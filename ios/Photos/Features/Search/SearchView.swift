import SwiftUI

struct SearchView: View {
    @StateObject private var viewModel = SearchViewModel()
    @State private var selectedAsset: Asset?

    private let columns = [GridItem(.adaptive(minimum: 110), spacing: 2)]

    var body: some View {
        NavigationStack {
            ScrollView {
                if viewModel.results == nil, !viewModel.tagStats.isEmpty {
                    VStack(alignment: .leading, spacing: Spacing.sm) {
                        Text("Erkannte Objekte").font(.headline).padding(.horizontal, Spacing.md)
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: Spacing.sm) {
                                ForEach(viewModel.tagStats) { tag in
                                    Button {
                                        Task { await viewModel.filterByTag(tag.label) }
                                    } label: {
                                        Text("\(tag.label) · \(tag.count)")
                                            .font(.caption)
                                            .padding(.horizontal, Spacing.md)
                                            .padding(.vertical, Spacing.sm)
                                            .background(.thinMaterial, in: Capsule())
                                    }
                                    .buttonStyle(.plain)
                                }
                            }
                            .padding(.horizontal, Spacing.md)
                        }
                    }
                    .padding(.top, Spacing.md)
                }

                if viewModel.results == nil, !viewModel.cameraStats.isEmpty {
                    VStack(alignment: .leading, spacing: Spacing.sm) {
                        Text("Aufnahmegeräte").font(.headline).padding(.horizontal, Spacing.md)
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: Spacing.sm) {
                                ForEach(viewModel.cameraStats) { stat in
                                    Button {
                                        Task { await viewModel.filterByCamera(stat.cameraModel) }
                                    } label: {
                                        VStack(alignment: .leading) {
                                            Text("\(stat.count)").font(.title2.bold())
                                            Text([stat.cameraMake, stat.cameraModel].compactMap { $0 }.joined(separator: " "))
                                                .font(.caption)
                                                .foregroundStyle(.secondary)
                                        }
                                        .padding(Spacing.md)
                                        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: Radius.md))
                                    }
                                    .buttonStyle(.plain)
                                }
                            }
                            .padding(.horizontal, Spacing.md)
                        }
                    }
                    .padding(.vertical, Spacing.md)
                }

                if let results = viewModel.results {
                    LazyVGrid(columns: columns, spacing: 2) {
                        ForEach(results) { asset in
                            Button { selectedAsset = asset } label: {
                                CachedThumbnail(assetId: asset.id, url: APIClient.thumbnailURL(for: asset))
                                    .aspectRatio(1, contentMode: .fill)
                                    .clipped()
                            }
                        }
                    }
                    if results.isEmpty {
                        ContentUnavailableView.search(text: viewModel.query)
                    }
                }
            }
            .navigationTitle("Suche")
            .searchable(text: $viewModel.query, prompt: "z.B. „Strand“, „Geburtstag“…")
            .onSubmit(of: .search) { Task { await viewModel.search() } }
            .task { await viewModel.loadFacets() }
            .fullScreenCover(item: $selectedAsset) { asset in
                PhotoViewerView(assets: viewModel.results ?? [], initialAsset: asset)
            }
        }
    }
}
