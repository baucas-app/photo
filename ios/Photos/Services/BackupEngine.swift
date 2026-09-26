import BackgroundTasks
import Foundation
import Photos

@MainActor
final class BackupEngine: ObservableObject {
    static let shared = BackupEngine()

    static let backgroundTaskIdentifier = "de.baucas.photos.backup-refresh"

    @Published private(set) var status: Status = .idle
    @Published private(set) var totalCount = 0
    @Published private(set) var uploadedCount = 0

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

    func scheduleNextBackgroundRun() {
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
            await self.runBackup()
            task.setTaskCompleted(success: true)
        }
        task.expirationHandler = { operation.cancel() }
    }

    /// Uploads every local PHAsset not yet uploaded. Tracked by local
    /// identifier in UserDefaults rather than re-querying the server, since
    /// that keeps this cheap enough to run from a background task.
    func runBackup() async {
        guard PhotoLibraryService.authorizationStatus == .authorized else { return }
        guard ServerConfig.baseURL != nil, KeychainStore.get(.accessToken) != nil else { return }

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

        for asset in pending {
            do {
                let fileURL = try await PhotoLibraryService.exportOriginal(asset)
                let _: Asset = try await APIClient.shared.upload("/assets", fileURL: fileURL)
                try? FileManager.default.removeItem(at: fileURL)

                var uploaded = uploadedIdentifiers
                uploaded.insert(asset.localIdentifier)
                uploadedIdentifiers = uploaded
                uploadedCount += 1
            } catch {
                status = .error(error.localizedDescription)
                return
            }
        }

        status = .idle
    }
}
