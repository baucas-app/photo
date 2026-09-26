import SwiftUI

struct AlbumsView: View {
    @StateObject private var viewModel = AlbumsViewModel()
    @State private var showCreateSheet = false
    @State private var newAlbumName = ""

    var body: some View {
        NavigationStack {
            ZStack(alignment: .bottomTrailing) {
                List(viewModel.rootAlbums) { album in
                    NavigationLink(value: album) {
                        Label(album.name, systemImage: "folder")
                    }
                }
                .navigationDestination(for: Album.self) { album in
                    AlbumDetailView(album: album, viewModel: viewModel)
                }
                .overlay {
                    if viewModel.rootAlbums.isEmpty {
                        ContentUnavailableView("Noch keine Alben", systemImage: "rectangle.stack")
                    }
                }

                GlassFloatingActionButton(systemImage: "plus") { showCreateSheet = true }
                    .padding(Spacing.lg)
            }
            .navigationTitle("Alben")
            .task { await viewModel.load() }
            .refreshable { await viewModel.load() }
            .alert("Neues Album", isPresented: $showCreateSheet) {
                TextField("Name", text: $newAlbumName)
                Button("Abbrechen", role: .cancel) {}
                Button("Erstellen") {
                    Task {
                        await viewModel.createAlbum(name: newAlbumName, parentId: nil)
                        newAlbumName = ""
                    }
                }
            }
        }
    }
}
