import SwiftUI

/// Main-actor mirror of already decoded thumbnails, so a tile that is created
/// fresh (e.g. by the pinch overlay or after a column change) shows its image
/// in the very first frame instead of flashing the placeholder.
@MainActor
final class TimelineThumbnailMemory {
    static let shared = TimelineThumbnailMemory()
    private let cache = NSCache<NSString, UIImage>()

    private init() { cache.countLimit = 800 }

    func image(for assetId: String) -> UIImage? { cache.object(forKey: assetId as NSString) }
    func store(_ image: UIImage, for assetId: String) { cache.setObject(image, forKey: assetId as NSString) }
    func remove(_ assetId: String) { cache.removeObject(forKey: assetId as NSString) }
}

/// Timeline-only variant of `CachedThumbnail`: fills whatever frame it is
/// given and resolves synchronously from `TimelineThumbnailMemory`.
struct TimelineThumbnail: View {
    let asset: Asset
    @State private var image: UIImage?
    @State private var loadedRevision: Int

    init(asset: Asset) {
        self.asset = asset
        _image = State(initialValue: TimelineThumbnailMemory.shared.image(for: asset.id))
        _loadedRevision = State(initialValue: AssetChanges.shared.revision(for: asset.id))
    }

    private var revision: Int { AssetChanges.shared.revision(for: asset.id) }

    var body: some View {
        Color.clear
            .overlay {
                if let image {
                    Image(uiImage: image)
                        .resizable()
                        .scaledToFill()
                } else {
                    Rectangle().fill(.quaternary)
                }
            }
            .clipped()
            .task(id: ThumbnailKey(assetId: asset.id, revision: revision)) {
                // After an edit the memory/disk caches were purged, so the
                // lookups below miss and the new rendition is fetched.
                if image != nil, loadedRevision == revision { return }
                if let cached = TimelineThumbnailMemory.shared.image(for: asset.id) {
                    image = cached
                    loadedRevision = revision
                    return
                }
                let url = AssetChanges.shared.versionedURL(APIClient.thumbnailURL(for: asset), assetId: asset.id)
                guard let url,
                      let fetched = await ImageCache.shared.fetch(assetId: asset.id, url: url) else { return }
                TimelineThumbnailMemory.shared.store(fetched, for: asset.id)
                image = fetched
                loadedRevision = revision
            }
    }
}

/// `.task(id:)` key that restarts a thumbnail load when the asset's pixels
/// change (see `AssetChanges.revision(for:)`).
struct ThumbnailKey: Hashable {
    let assetId: String
    let revision: Int
}
