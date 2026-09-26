import SwiftUI

struct AlbumDetailView: View {
    let album: Album
    @ObservedObject var viewModel: AlbumsViewModel

    @State private var detail: AlbumDetail?
    @State private var selectedAsset: Asset?

    private let columns = [GridItem(.adaptive(minimum: 110), spacing: 2)]

    var body: some View {
        ScrollView {
            if let detail, !detail.children.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: Spacing.sm) {
                        ForEach(detail.children) { child in
                            NavigationLink(value: child) {
                                Label(child.name, systemImage: "folder")
                                    .padding(.horizontal, Spacing.md)
                                    .padding(.vertical, Spacing.sm)
                                    .background(.thinMaterial, in: Capsule())
                            }
                        }
                    }
                    .padding(.horizontal, Spacing.md)
                }
                .padding(.vertical, Spacing.sm)
            }

            LazyVGrid(columns: columns, spacing: 2) {
                ForEach(detail?.assets ?? []) { asset in
                    Button { selectedAsset = asset } label: {
                        CachedThumbnail(assetId: asset.id, url: APIClient.thumbnailURL(for: asset))
                            .aspectRatio(1, contentMode: .fill)
                            .clipped()
                    }
                }
            }
        }
        .navigationTitle(album.name)
        .task { await load() }
        .fullScreenCover(item: $selectedAsset) { asset in
            PhotoViewerView(assets: detail?.assets ?? [], initialAsset: asset)
        }
        .overlay {
            if let detail, detail.assets.isEmpty, detail.children.isEmpty {
                ContentUnavailableView("Album ist leer", systemImage: "photo")
            }
        }
    }

    private func load() async {
        detail = try? await APIClient.shared.request("/albums/\(album.id)")
    }
}
