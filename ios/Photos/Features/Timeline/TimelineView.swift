import SwiftUI

struct TimelineView: View {
    @StateObject private var viewModel = TimelineViewModel()
    @State private var selectedAsset: Asset?

    private let columns = [GridItem(.adaptive(minimum: 110), spacing: 2)]

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVGrid(columns: columns, spacing: 2) {
                    ForEach(viewModel.assets) { asset in
                        Button {
                            selectedAsset = asset
                        } label: {
                            CachedThumbnail(assetId: asset.id, url: APIClient.thumbnailURL(for: asset))
                                .aspectRatio(1, contentMode: .fill)
                                .clipped()
                        }
                        .task { await viewModel.loadMoreIfNeeded(current: asset) }
                    }
                }

                if viewModel.isLoading {
                    ProgressView().padding()
                }
            }
            .navigationTitle("Mediathek")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        NavigationLink("Sammlungen", destination: CollectionsView())
                        NavigationLink("Duplikate", destination: DuplicatesView())
                    } label: {
                        Image(systemName: "square.stack.3d.up")
                    }
                }
            }
            .task { if viewModel.assets.isEmpty { await viewModel.loadInitial() } }
            .refreshable { await viewModel.loadInitial() }
            .fullScreenCover(item: $selectedAsset) { asset in
                PhotoViewerView(assets: viewModel.assets, initialAsset: asset)
            }
            .overlay {
                if viewModel.assets.isEmpty && !viewModel.isLoading {
                    ContentUnavailableView(
                        "Noch keine Fotos",
                        systemImage: "photo.on.rectangle",
                        description: Text("Fotos werden hier angezeigt, sobald das Backup läuft oder du welche hochlädst.")
                    )
                }
            }
        }
    }
}
