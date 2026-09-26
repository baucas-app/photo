import SwiftUI

struct AlbumDetailView: View {
    let album: Album
    @ObservedObject var viewModel: AlbumsViewModel

    @State private var detail: AlbumDetail?
    @State private var selectedAsset: Asset?
    @State private var showManage = false

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
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button("Verwalten") { showManage = true }
            }
        }
        .task { await load() }
        .fullScreenCover(item: $selectedAsset) { asset in
            PhotoViewerView(assets: detail?.assets ?? [], initialAsset: asset)
        }
        .sheet(isPresented: $showManage) {
            AlbumManageSheet(album: album) {
                await viewModel.load()
                await load()
            }
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

/// Rename and/or move an album to a different parent - both cause the
/// backend to move the real folder, so this hits the same PUT endpoint
/// with whichever fields changed.
private struct AlbumManageSheet: View {
    let album: Album
    let onSaved: () async -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var name: String
    @State private var parentId: String?
    @State private var allAlbums: [Album] = []
    @State private var errorMessage: String?
    @State private var isSaving = false

    init(album: Album, onSaved: @escaping () async -> Void) {
        self.album = album
        self.onSaved = onSaved
        _name = State(initialValue: album.name)
        _parentId = State(initialValue: album.parentId)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Name") {
                    TextField("Name", text: $name)
                }
                Section("Übergeordnetes Album") {
                    Picker("Übergeordnetes Album", selection: $parentId) {
                        Text("(keins)").tag(String?.none)
                        ForEach(allAlbums.filter { $0.id != album.id }) { candidate in
                            Text(candidate.path).tag(String?.some(candidate.id))
                        }
                    }
                    .labelsHidden()
                    .pickerStyle(.inline)
                }
                if let errorMessage {
                    Text(errorMessage).foregroundStyle(.red).font(.footnote)
                }
            }
            .navigationTitle("Album verwalten")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Abbrechen") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Speichern") { Task { await save() } }
                        .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty || isSaving)
                }
            }
            .task {
                allAlbums = (try? await APIClient.shared.request("/albums")) ?? []
            }
        }
    }

    private func save() async {
        isSaving = true
        defer { isSaving = false }
        struct Body: Encodable { let name: String; let parentId: String? }
        do {
            let _: Album = try await APIClient.shared.request(
                "/albums/\(album.id)", method: "PUT", body: Body(name: name, parentId: parentId)
            )
            await onSaved()
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
