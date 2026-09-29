import ActivityKit
import BackgroundTasks
import CoreLocation
import Foundation
import Network
import Photos

@MainActor
final class BackupEngine: ObservableObject {
    static let shared = BackupEngine()

    static let backgroundTaskIdentifier = "de.baucas.photos.backup-refresh"

    @Published private(set) var status: Status = .idle
    @Published private(set) var totalCount = 0
    @Published private(set) var uploadedCount = 0

    private var activity: Activity<BackupActivityAttributes>?

    enum Status: Equatable {
        case idle
        case running
        case paused
        case error(String)
    }

    private let uploadedIdentifiersKey = "photos.backup.uploadedIdentifiers"
    private var uploadedIdentifiers: Set<String> {
        get { Set(UserDefaults.standard.stringArray(forKey: uploadedIdentifiersKey) ?? []) }
        set { UserDefaults.standard.set(Array(newValue), forKey: uploadedIdentifiersKey) }
    }

    func registerBackgroundTask() {
        BGTaskScheduler.shared.register(forTaskWithIdentifier: Self.backgroundTaskIdentifier, using: nil) { task in
            self.handleBackgroundRefresh(task: task as! BGProcessingTask)
        }
    }

    /// Only (re-)schedules while "Automatisches Backup" is on; turning it off
    /// also withdraws an already submitted request.
    func scheduleNextBackgroundRun() {
        guard BackupSettings.isAutoBackupEnabled else {
            BGTaskScheduler.shared.cancel(taskRequestWithIdentifier: Self.backgroundTaskIdentifier)
            return
        }
        let request = BGProcessingTaskRequest(identifier: Self.backgroundTaskIdentifier)
        request.requiresNetworkConnectivity = true
        request.requiresExternalPower = false
        request.earliestBeginDate = Date(timeIntervalSinceNow: 15 * 60)
        try? BGTaskScheduler.shared.submit(request)
    }

    private nonisolated func handleBackgroundRefresh(task: BGProcessingTask) {
        // BGProcessingTask is safe to complete from any thread (Apple's own
        // pattern), but it isn't marked Sendable, so Swift 6 strict
        // concurrency needs an explicit opt-out to hand it into the
        // MainActor-isolated Task below.
        nonisolated(unsafe) let task = task
        let operation = Task { @MainActor in
            self.scheduleNextBackgroundRun()
            // Setting may have been switched off after the request was submitted.
            if BackupSettings.isAutoBackupEnabled {
                await self.runBackup()
            }
            task.setTaskCompleted(success: true)
        }
        task.expirationHandler = { operation.cancel() }
    }

    // MARK: - Network check

    /// Returns nil when the current network satisfies the user's preference,
    /// or a human-readable reason string when the backup should be skipped.
    private func networkBlockReason() async -> String? {
        let pref = BackupSettings.networkPreference
        guard pref != .wifiAndCellular else { return nil }

        return await withCheckedContinuation { continuation in
            let monitor = NWPathMonitor()
            monitor.pathUpdateHandler = { path in
                monitor.cancel()
                let hasWifi     = path.usesInterfaceType(.wifi)
                let hasCellular = path.usesInterfaceType(.cellular)

                switch pref {
                case .wifiOnly:
                    continuation.resume(returning: hasWifi ? nil : "Kein WLAN verfügbar – Upload pausiert.")
                case .cellularOnly:
                    continuation.resume(returning: hasCellular ? nil : "Kein Mobilfunk verfügbar – Upload pausiert.")
                case .wifiPreferred:
                    // Wifi preferred: proceed on wifi; fall back to cellular if wifi unavailable.
                    let ok = hasWifi || hasCellular
                    continuation.resume(returning: ok ? nil : "Keine Netzwerkverbindung.")
                case .wifiAndCellular:
                    continuation.resume(returning: nil)
                }
            }
            monitor.start(queue: .global())
        }
    }

    /// Uploads every local PHAsset not yet uploaded. Tracked by local
    /// identifier in UserDefaults rather than re-querying the server, since
    /// that keeps this cheap enough to run from a background task.
    func runBackup() async {
        guard PhotoLibraryService.authorizationStatus == .authorized else { return }
        guard let accountId = AccountsStore.activeAccountId,
              ServerConfig.baseURL != nil,
              KeychainStore.get(.accessToken, account: accountId) != nil
        else { return }

        if let blockReason = await networkBlockReason() {
            status = .error(blockReason)
            return
        }

        status = .running
        let fetchResult = PhotoLibraryService.fetchAllAssets()
        let alreadyUploaded = uploadedIdentifiers

        var pending: [PHAsset] = []
        fetchResult.enumerateObjects { asset, _, _ in
            if !alreadyUploaded.contains(asset.localIdentifier) {
                pending.append(asset)
            }
        }

        totalCount = fetchResult.count
        uploadedCount = fetchResult.count - pending.count

        if !pending.isEmpty {
            startActivity()
        }

        knownAlbums = nil

        let allowsCellular: Bool = {
            switch BackupSettings.networkPreference {
            case .wifiOnly: return false
            case .cellularOnly, .wifiAndCellular, .wifiPreferred: return true
            }
        }()

        for asset in pending {
            do {
                let albumId = try await destinationAlbumId(for: asset)
                let baseFields = baseExtraFields(for: asset, albumId: albumId)

                if PhotoLibraryService.isLivePhoto(asset) {
                    try await uploadLivePhotoPair(asset, albumId: albumId, baseFields: baseFields, allowsCellular: allowsCellular)
                } else {
                    let fileURL = try await PhotoLibraryService.exportOriginal(asset)
                    defer { try? FileManager.default.removeItem(at: fileURL.deletingLastPathComponent()) }
                    let _: Asset = try await APIClient.shared.upload(
                        "/assets",
                        fileURL: fileURL,
                        extraFields: baseFields,
                        allowsCellularAccess: allowsCellular
                    )
                }

                var uploaded = uploadedIdentifiers
                uploaded.insert(asset.localIdentifier)
                uploadedIdentifiers = uploaded
                uploadedCount += 1
                await updateActivity()

                if BackupSettings.deleteAfterUpload {
                    await deleteFromPhotoLibrary(asset)
                }
            } catch {
                status = .error(error.localizedDescription)
                await endActivity()
                return
            }
        }

        status = .idle
        await endActivity()
    }

    /// Builds the multipart extra-fields dict from a PHAsset. Passes creation
    /// date and GPS as client-side metadata that the backend uses as fallback
    /// when EXIF is absent (e.g. screenshots, edited photos with stripped EXIF).
    private func baseExtraFields(for asset: PHAsset, albumId: String?) -> [String: String] {
        var fields: [String: String] = albumId.map { ["albumId": $0] } ?? [:]
        if let date = asset.creationDate {
            fields["clientTakenAt"] = ISO8601DateFormatter().string(from: date)
        }
        if let loc = asset.location {
            fields["clientLatitude"] = String(loc.coordinate.latitude)
            fields["clientLongitude"] = String(loc.coordinate.longitude)
        }
        return fields
    }

    /// Live Photos (docs/DONE.md Teil 7) upload as two requests: the motion
    /// video first, flagged `isLivePhotoMotion` so it never shows up on its
    /// own, then the still image pointing at the video's freshly-assigned id.
    private func uploadLivePhotoPair(_ asset: PHAsset, albumId: String?, baseFields: [String: String], allowsCellular: Bool = true) async throws {
        guard let videoURL = try await PhotoLibraryService.exportLivePhotoVideo(asset) else {
            let fileURL = try await PhotoLibraryService.exportOriginal(asset)
            defer { try? FileManager.default.removeItem(at: fileURL.deletingLastPathComponent()) }
            let _: Asset = try await APIClient.shared.upload("/assets", fileURL: fileURL, extraFields: baseFields, allowsCellularAccess: allowsCellular)
            return
        }
        defer { try? FileManager.default.removeItem(at: videoURL.deletingLastPathComponent()) }
        var videoFields = baseFields
        videoFields["isLivePhotoMotion"] = "true"
        let videoAsset: Asset = try await APIClient.shared.upload("/assets", fileURL: videoURL, extraFields: videoFields, allowsCellularAccess: allowsCellular)

        var photoFields = baseFields
        photoFields["livePhotoVideoAssetId"] = videoAsset.id
        let photoURL = try await PhotoLibraryService.exportOriginal(asset)
        defer { try? FileManager.default.removeItem(at: photoURL.deletingLastPathComponent()) }
        let _: Asset = try await APIClient.shared.upload("/assets", fileURL: photoURL, extraFields: photoFields, allowsCellularAccess: allowsCellular)
    }

    private func deleteFromPhotoLibrary(_ asset: PHAsset) async {
        await withCheckedContinuation { continuation in
            PHPhotoLibrary.shared().performChanges({
                PHAssetChangeRequest.deleteAssets([asset] as NSArray)
            }, completionHandler: { _, _ in continuation.resume() })
        }
    }

    // MARK: - Target album resolution

    /// Albums as last fetched from the server during this run; nil forces a
    /// refetch. Newly created albums are appended so each is created once.
    private var knownAlbums: [Album]?

    private struct CreateAlbumBody: Encodable {
        let name: String
        let parentId: String?
    }

    /// nil = no target album configured, so the backend files the upload by
    /// EXIF date under /YYYY/MM/ itself. Otherwise the target album (found or
    /// created), or its YYYY-MM child when "Nach Monat sortieren" is on.
    private func destinationAlbumId(for asset: PHAsset) async throws -> String? {
        let targetName = BackupSettings.targetAlbumName
        guard !targetName.isEmpty else { return nil }

        if knownAlbums == nil {
            knownAlbums = try await APIClient.shared.request("/albums")
        }
        let albums = knownAlbums ?? []

        let target: Album
        if let pickedId = BackupSettings.targetAlbumId, let picked = albums.first(where: { $0.id == pickedId }) {
            target = picked
        } else if let existing = albums.first(where: { $0.parentId == nil && $0.name == targetName }) {
            target = existing
        } else {
            target = try await createAlbum(name: targetName, parentId: nil)
        }

        guard BackupSettings.sortByMonth else { return target.id }

        let monthName = BackupSettings.monthAlbumName(for: asset.creationDate ?? Date())
        if let month = albums.first(where: { $0.parentId == target.id && $0.name == monthName }) {
            return month.id
        }
        return try await createAlbum(name: monthName, parentId: target.id).id
    }

    private func createAlbum(name: String, parentId: String?) async throws -> Album {
        let created: Album = try await APIClient.shared.request(
            "/albums", method: "POST", body: CreateAlbumBody(name: name, parentId: parentId)
        )
        knownAlbums = (knownAlbums ?? []) + [created]
        return created
    }

    // MARK: - Live Activity / Dynamic Island

    private func startActivity() {
        guard activity == nil, ActivityAuthorizationInfo().areActivitiesEnabled else { return }

        let state = BackupActivityAttributes.ContentState(uploadedCount: uploadedCount, totalCount: totalCount)
        activity = try? Activity.request(
            attributes: BackupActivityAttributes(),
            content: .init(state: state, staleDate: nil)
        )
    }

    private func updateActivity() async {
        // Activity<T>'s update/end run on a background executor and aren't
        // marked Sendable, but Apple's own docs have them safe to call from
        // any thread - same escape hatch as BGProcessingTask above.
        guard let currentActivity = activity else { return }
        nonisolated(unsafe) let unsafeActivity = currentActivity
        let state = BackupActivityAttributes.ContentState(uploadedCount: uploadedCount, totalCount: totalCount)
        await unsafeActivity.update(.init(state: state, staleDate: nil))
    }

    private func endActivity() async {
        guard let currentActivity = activity else { return }
        nonisolated(unsafe) let unsafeActivity = currentActivity
        let state = BackupActivityAttributes.ContentState(uploadedCount: uploadedCount, totalCount: totalCount)
        await unsafeActivity.end(.init(state: state, staleDate: nil), dismissalPolicy: .after(.now.addingTimeInterval(5)))
        self.activity = nil
    }
}
