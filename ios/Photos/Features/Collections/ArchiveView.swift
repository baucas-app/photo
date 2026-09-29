import SwiftUI

/// Archived photos (`GET /assets?archived=true`): hidden from the timeline,
/// memories and search, but not deleted. Photos get here via the archive
/// button in the viewer; long-press or the same button brings them back.
struct ArchiveView: View {
    @StateObject private var viewModel = TimelineViewModel(filter: [URLQueryItem(name: "archived", value: "true")])
    @State private var selectedAsset: Asset?
    @State private var seenVersion = AssetChanges.shared.libraryVersion
    @State private var errorMessage: String?

    private let columns = [GridItem(.adaptive(minimum: 110), spacing: 2)]

    var body: some View {
        ScrollView {
            LazyVGrid(columns: columns, spacing: 2) {
                ForEach(viewModel.assets) { asset in
                    Button { selectedAsset = asset } label: {
                        Color.clear
                            .aspectRatio(1, contentMode: .fit)
                            .overlay { TimelineThumbnail(asset: asset) }
                            .clipped()
                    }
                    .contextMenu {
                        Button("Aus dem Archiv holen", systemImage: "archivebox") {
                            Task { await unarchive(asset) }
                        }
                        Button("In den Papierkorb verschieben", systemImage: "trash", role: .destructive) {
                            Task { await trash(asset) }
                        }
                    }
                    .task { await viewModel.loadMoreIfNeeded(current: asset) }
                }
            }

            if viewModel.isLoading {
                ProgressView().padding()
            }
        }
        .navigationTitle("Archiv")
        .task { if viewModel.assets.isEmpty { await viewModel.loadInitial() } }
        .refreshable { await viewModel.loadInitial() }
        .onChange(of: AssetChanges.shared.libraryVersion) {
            if selectedAsset == nil { reloadIfChanged() }
        }
        .fullScreenCover(item: $selectedAsset, onDismiss: reloadIfChanged) { asset in
            PhotoViewerView(assets: viewModel.assets, initialAsset: asset)
        }
        .overlay {
            if viewModel.assets.isEmpty && !viewModel.isLoading {
                ContentUnavailableView(
                    "Archiv ist leer",
                    systemImage: "archivebox",
                    description: Text("Archivierte Fotos werden aus der Mediathek ausgeblendet, aber nicht gelöscht. Archivieren kannst du über das Archiv-Symbol in der Fotoansicht.")
                )
            }
        }
        .alert("Aktion fehlgeschlagen", isPresented: Binding(
            get: { errorMessage != nil },
            set: { if !$0 { errorMessage = nil } }
        )) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(errorMessage ?? "")
        }
    }

    /// Un-archived / trashed from the viewer: the archive is small, just
    /// reload it.
    private func reloadIfChanged() {
        let version = AssetChanges.shared.libraryVersion
        guard version != seenVersion else { return }
        seenVersion = version
        Task { await viewModel.loadInitial() }
    }

    private func unarchive(_ asset: Asset) async {
        do {
            try await AssetChanges.shared.setArchived(asset, false)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func trash(_ asset: Asset) async {
        do {
            try await AssetChanges.shared.moveToTrash(asset.id)
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
