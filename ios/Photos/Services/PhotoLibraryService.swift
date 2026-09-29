import Photos
import UIKit

/// Wraps PhotosKit access for the backup engine: authorization and fetching
/// local assets as plain file URLs the APIClient can upload.
///
/// `PHAssetResource` isn't `Sendable`, so it's deliberately never a parameter
/// or return value of anything public here - every resource lookup and the
/// `export` helper that consumes it happen inside the same function, so it
/// never has to cross the actor boundary from `BackupEngine` (`@MainActor`)
/// into this (nonisolated) enum. Only `PHAsset` (Sendable) and plain values
/// cross that boundary.
enum PhotoLibraryService {
    static func requestAuthorization() async -> PHAuthorizationStatus {
        await PHPhotoLibrary.requestAuthorization(for: .readWrite)
    }

    static var authorizationStatus: PHAuthorizationStatus {
        PHPhotoLibrary.authorizationStatus(for: .readWrite)
    }

    static func fetchAllAssets() -> PHFetchResult<PHAsset> {
        let options = PHFetchOptions()
        options.sortDescriptors = [NSSortDescriptor(key: "creationDate", ascending: true)]
        return PHAsset.fetchAssets(with: options)
    }

    // MARK: - Live Photos
    //
    // A Live Photo is one PHAsset with two PHAssetResources: the still image
    // (.photo/.fullSizePhoto) and a short muted .pairedVideo clip. The backend
    // wants both uploaded as separate assets, video first (see BackupEngine).

    static func isLivePhoto(_ asset: PHAsset) -> Bool {
        asset.mediaSubtypes.contains(.photoLive)
    }

    /// Exports a PHAsset's original file to a temp URL so it can be uploaded
    /// as-is (preserving EXIF, which the backend needs for taken-date/camera).
    static func exportOriginal(
        _ asset: PHAsset,
        fileNameTemplate: String = BackupSettings.fileNameTemplate
    ) async throws -> URL {
        guard let resource = primaryResource(for: asset) else {
            throw CocoaError(.fileReadUnknown)
        }
        return try await export(resource, creationDate: asset.creationDate ?? Date(), fileNameTemplate: fileNameTemplate)
    }

    /// Exports the paired motion-video of a Live Photo - nil if `asset` isn't
    /// one (or, unexpectedly, has no paired video resource).
    static func exportLivePhotoVideo(
        _ asset: PHAsset,
        fileNameTemplate: String = BackupSettings.fileNameTemplate
    ) async throws -> URL? {
        guard let resource = livePhotoVideoResource(for: asset) else { return nil }
        return try await export(resource, creationDate: asset.creationDate ?? Date(), fileNameTemplate: fileNameTemplate)
    }

    /// The resource that represents `asset` itself (its still image, or its
    /// video data for a plain video asset) - what every asset uploads as its
    /// main file, regardless of whether it's also a Live Photo.
    private static func primaryResource(for asset: PHAsset) -> PHAssetResource? {
        PHAssetResource.assetResources(for: asset).first {
            $0.type == .photo || $0.type == .video || $0.type == .fullSizePhoto
        }
    }

    private static func livePhotoVideoResource(for asset: PHAsset) -> PHAssetResource? {
        guard isLivePhoto(asset) else { return nil }
        return PHAssetResource.assetResources(for: asset).first { $0.type == .pairedVideo }
    }

    /// Exports one resource to a temp URL named per the configured backup
    /// file-name template (+ its own extension), because APIClient.upload
    /// sends `lastPathComponent` as the server-side file name. The file lives
    /// in its own UUID subdirectory so identical rendered names can't
    /// collide; callers should delete `fileURL.deletingLastPathComponent()`
    /// afterwards.
    private static func export(
        _ resource: PHAssetResource,
        creationDate: Date,
        fileNameTemplate: String
    ) async throws -> URL {
        try await withCheckedThrowingContinuation { continuation in
            let options = PHAssetResourceRequestOptions()
            options.isNetworkAccessAllowed = true

            let original = resource.originalFilename as NSString
            let title = original.deletingPathExtension.isEmpty ? "Foto" : original.deletingPathExtension
            let baseName = BackupSettings.renderFileName(
                template: fileNameTemplate,
                title: title,
                date: creationDate
            )

            let tempDirectory = FileManager.default.temporaryDirectory
                .appendingPathComponent(UUID().uuidString, isDirectory: true)
            do {
                try FileManager.default.createDirectory(at: tempDirectory, withIntermediateDirectories: true)
            } catch {
                continuation.resume(throwing: error)
                return
            }

            let namedURL = tempDirectory.appendingPathComponent(baseName)
            let tempURL = original.pathExtension.isEmpty
                ? namedURL
                : namedURL.appendingPathExtension(original.pathExtension)

            PHAssetResourceManager.default().writeData(for: resource, toFile: tempURL, options: options) { error in
                if let error {
                    try? FileManager.default.removeItem(at: tempDirectory)
                    continuation.resume(throwing: error)
                } else {
                    continuation.resume(returning: tempURL)
                }
            }
        }
    }
}
