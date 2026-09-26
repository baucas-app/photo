import UIKit

/// Two-tier thumbnail cache (memory + disk) so the timeline stays scrollable
/// offline. Keyed by the asset id, not the full URL, since the API key
/// query param can rotate.
actor ImageCache {
    static let shared = ImageCache()

    private let memoryCache = NSCache<NSString, UIImage>()
    private let diskDirectory: URL

    init() {
        let caches = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
        diskDirectory = caches.appendingPathComponent("thumbnails", isDirectory: true)
        try? FileManager.default.createDirectory(at: diskDirectory, withIntermediateDirectories: true)
    }

    func image(for assetId: String) -> UIImage? {
        if let cached = memoryCache.object(forKey: assetId as NSString) {
            return cached
        }
        let fileURL = diskDirectory.appendingPathComponent(assetId)
        guard let data = try? Data(contentsOf: fileURL), let image = UIImage(data: data) else { return nil }
        memoryCache.setObject(image, forKey: assetId as NSString)
        return image
    }

    func store(_ data: Data, for assetId: String) {
        guard let image = UIImage(data: data) else { return }
        memoryCache.setObject(image, forKey: assetId as NSString)
        try? data.write(to: diskDirectory.appendingPathComponent(assetId))
    }

    func fetch(assetId: String, url: URL) async -> UIImage? {
        if let cached = image(for: assetId) { return cached }
        guard let (data, _) = try? await URLSession.shared.data(from: url) else { return nil }
        store(data, for: assetId)
        return UIImage(data: data)
    }
}
