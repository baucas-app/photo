import SwiftUI

/// Like AsyncImage, but backed by ImageCache's on-disk store so thumbnails
/// already seen stay visible while offline (spec: "Offline-Mode: Thumbnails
/// gecacht").
struct CachedThumbnail: View {
    let assetId: String
    let url: URL?

    @State private var image: UIImage?

    var body: some View {
        Group {
            if let image {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFill()
            } else {
                Rectangle().fill(.quaternary)
            }
        }
        .task(id: assetId) {
            guard let url else { return }
            image = await ImageCache.shared.fetch(assetId: assetId, url: url)
        }
    }
}
