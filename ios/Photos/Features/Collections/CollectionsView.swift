import SwiftUI

enum SmartCollection: String, CaseIterable, Identifiable {
    case videos = "Videos"
    case screenshots = "Screenshots"

    var id: String { rawValue }
    var systemImage: String {
        switch self {
        case .videos: return "video"
        case .screenshots: return "camera.viewfinder"
        }
    }

    var mimeTypeFilter: String? {
        switch self {
        case .videos: return "video/"
        case .screenshots: return nil
        }
    }
}

/// Auto-detected buckets, e.g. "Videos"/"Screenshots" smart albums.
/// Screenshots are detected by filename convention since the backend doesn't
/// track PHAssetMediaSubtype (that's an on-device-only concept) - "IMG_" vs
/// "Screenshot" is what iOS itself names them.
struct CollectionsView: View {
    var body: some View {
        List(SmartCollection.allCases) { collection in
            NavigationLink(value: collection) {
                Label(collection.rawValue, systemImage: collection.systemImage)
            }
        }
        .navigationDestination(for: SmartCollection.self) { collection in
            CollectionAssetsView(collection: collection)
        }
        .navigationTitle("Sammlungen")
    }
}

private struct CollectionAssetsView: View {
    let collection: SmartCollection
    @State private var assets: [Asset] = []
    @State private var selectedAsset: Asset?

    private let columns = [GridItem(.adaptive(minimum: 110), spacing: 2)]

    var body: some View {
        ScrollView {
            LazyVGrid(columns: columns, spacing: 2) {
                ForEach(assets) { asset in
                    Button { selectedAsset = asset } label: {
                        CachedThumbnail(assetId: asset.id, url: APIClient.thumbnailURL(for: asset))
                            .aspectRatio(1, contentMode: .fill)
                            .clipped()
                    }
                }
            }
        }
        .navigationTitle(collection.rawValue)
        .task { await load() }
        .fullScreenCover(item: $selectedAsset) { asset in
            PhotoViewerView(assets: assets, initialAsset: asset)
        }
    }

    private func load() async {
        do {
            let page: AssetPage
            if let mimeType = collection.mimeTypeFilter {
                page = try await APIClient.shared.request("/assets?mimeType=\(mimeType)&limit=200")
            } else {
                page = try await APIClient.shared.request("/assets?limit=200")
            }
            assets = page.assets.filter { asset in
                switch collection {
                case .videos: return true
                case .screenshots: return asset.filename.lowercased().contains("screenshot")
                }
            }
        } catch {
            assets = []
        }
    }
}
