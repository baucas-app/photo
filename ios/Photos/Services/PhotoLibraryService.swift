import Photos
import UIKit

/// Wraps PhotosKit access for the backup engine: authorization and fetching
/// local assets as plain file URLs the APIClient can upload.
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

    /// Exports a PHAsset's original file to a temp URL so it can be uploaded
    /// as-is (preserving EXIF, which the backend needs for taken-date/camera).
    static func exportOriginal(_ asset: PHAsset) async throws -> URL {
        try await withCheckedThrowingContinuation { continuation in
            let options = PHAssetResourceRequestOptions()
            options.isNetworkAccessAllowed = true

            guard let resource = PHAssetResource.assetResources(for: asset).first(where: {
                $0.type == .photo || $0.type == .video || $0.type == .fullSizePhoto
            }) else {
                continuation.resume(throwing: CocoaError(.fileReadUnknown))
                return
            }

            let tempURL = FileManager.default.temporaryDirectory
                .appendingPathComponent(UUID().uuidString)
                .appendingPathExtension((resource.originalFilename as NSString).pathExtension)

            PHAssetResourceManager.default().writeData(for: resource, toFile: tempURL, options: options) { error in
                if let error {
                    continuation.resume(throwing: error)
                } else {
                    continuation.resume(returning: tempURL)
                }
            }
        }
    }
}
