import LocalAuthentication
import SwiftUI

struct AlbumDetailView: View {
    let album: Album
    @ObservedObject var viewModel: AlbumsViewModel

    @State private var detail: AlbumDetail?
    @State private var selectedAsset: Asset?
    @State private var showManage = false
    @State private var showSlideshow = false
    @State private var showComments = false
    @State private var downloadingZip = false
    @State private var zipShareItems: [Any]?
    @State private var biometricUnlocked = false
    @State private var biometricError: String?

    private let columns = [GridItem(.adaptive(minimum: 110), spacing: 2)]

    /// `album` is a snapshot frozen at the moment this view was pushed - a
    /// rename via "Verwalten" updates the server and `detail` (`load()`
    /// refetches it), but never that frozen struct, so the title used to
    /// keep showing the old name until the user left and came back. Prefer
    /// the freshly loaded name wherever one is available.
    private var currentAlbum: Album {
        guard let detail else { return album }
        return Album(
            id: detail.id, name: detail.name, description: detail.description,
            path: detail.path, parentId: detail.parentId, coverAssetId: detail.coverAssetId,
            pinned: detail.pinned, sortOrder: detail.sortOrder, isLocked: detail.isLocked
        )
    }

    var body: some View {
        Group {
            if album.isLocked && !biometricUnlocked {
                lockScreen
            } else {
                albumContent
            }
        }
        .navigationTitle(currentAlbum.name)
        .task {
            if album.isLocked && !biometricUnlocked {
                await requestBiometric()
            } else {
                await load()
            }
        }
    }

    private var lockScreen: some View {
        VStack(spacing: 16) {
            Image(systemName: "lock.fill")
                .font(.system(size: 48, weight: .light))
                .foregroundStyle(.secondary)
            Text("Dieses Album ist gesperrt.")
                .font(.headline)
            if let err = biometricError {
                Text(err)
                    .font(.subheadline)
                    .foregroundStyle(.red)
            }
            Button("Entsperren") { Task { await requestBiometric() } }
                .buttonStyle(.borderedProminent)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var albumContent: some View {
        ScrollView {
            if let detail, !detail.children.isEmpty {
                subAlbumBar(detail)
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
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { showSlideshow = true } label: {
                    Image(systemName: "play.rectangle")
                }
                .disabled(detail?.assets.isEmpty ?? true)
                .accessibilityLabel("Diashow")
            }
            ToolbarItem(placement: .topBarTrailing) {
                Button { showComments = true } label: {
                    Image(systemName: "bubble.left.and.bubble.right")
                }
                .accessibilityLabel("Kommentare")
            }
            ToolbarItem(placement: .topBarTrailing) {
                if downloadingZip {
                    ProgressView()
                } else {
                    Button { Task { await downloadZip() } } label: {
                        Image(systemName: "arrow.down.circle")
                    }
                    .disabled(detail?.assets.isEmpty ?? true)
                    .accessibilityLabel("Als ZIP herunterladen")
                }
            }
            ToolbarItem(placement: .primaryAction) {
                Button("Verwalten") { showManage = true }
            }
        }
        .onChange(of: viewModel.moveSuccessCount) {
            Task { await load() }
        }
        .fullScreenCover(item: $selectedAsset) { asset in
            PhotoViewerView(assets: detail?.assets ?? [], initialAsset: asset)
        }
        .fullScreenCover(isPresented: $showSlideshow) {
            SlideshowView(assets: detail?.assets ?? [])
        }
        .sheet(isPresented: $showManage) {
            AlbumManageSheet(album: currentAlbum) {
                await viewModel.load()
                await load()
            }
        }
        .sheet(isPresented: $showComments) {
            AlbumCommentsSheet(albumId: album.id, currentUserId: "")
        }
        .sheet(isPresented: Binding(
            get: { zipShareItems != nil },
            set: { if !$0 { zipShareItems = nil } }
        )) {
            if let items = zipShareItems {
                ShareSheetView(items: items)
            }
        }
        .overlay {
            if let detail, detail.assets.isEmpty, detail.children.isEmpty {
                ContentUnavailableView("Album ist leer", systemImage: "photo")
            }
        }
    }

    private func downloadZip() async {
        downloadingZip = true
        defer { downloadingZip = false }
        guard let url = await APIClient.shared.urlFor("/albums/\(album.id)/download") else { return }
        var request = URLRequest(url: url)
        if let token = await APIClient.shared.currentAccessToken() {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        guard let (data, _) = try? await URLSession.shared.data(for: request) else { return }
        let safeName = currentAlbum.name
            .components(separatedBy: CharacterSet.alphanumerics.inverted.union(.init(charactersIn: "-_"))).joined()
        let tmpURL = FileManager.default.temporaryDirectory.appendingPathComponent("\(safeName).zip")
        try? data.write(to: tmpURL)
        zipShareItems = [tmpURL]
    }

    private func load() async {
        detail = try? await APIClient.shared.request("/albums/\(album.id)")
    }

    private func requestBiometric() async {
        let context = LAContext()
        var error: NSError?
        guard context.canEvaluatePolicy(.deviceOwnerAuthentication, error: &error) else {
            biometricError = "Biometrie nicht verfügbar."
            return
        }
        do {
            let success = try await context.evaluatePolicy(
                .deviceOwnerAuthentication,
                localizedReason: "Entsperre \"\(album.name)\""
            )
            if success {
                biometricUnlocked = true
                biometricError = nil
                await load()
            }
        } catch {
            biometricError = "Entsperren fehlgeschlagen."
        }
    }

    /// Sub-albums as draggable chips: drop one onto a sibling to nest it
    /// there, or onto the leading "Ebene höher" chip to move it out of this
    /// album (into this album's parent, or to the top level).
    private func subAlbumBar(_ detail: AlbumDetail) -> some View {
        VStack(alignment: .leading, spacing: Spacing.xs) {
            Text("Unteralben")
                .font(.footnote.weight(.semibold))
                .foregroundStyle(.secondary)
                .padding(.horizontal, Spacing.md)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: Spacing.sm) {
                    moveUpDropChip(targetParentId: detail.parentId)

                    ForEach(detail.children) { child in
                        NavigationLink(value: child) {
                            AlbumChip(album: child, viewModel: viewModel)
                        }
                        .buttonStyle(.plain)
                        .contextMenu {
                            Button {
                                Task { await viewModel.move(albumId: child.id, toParent: detail.parentId) }
                            } label: {
                                Label(
                                    detail.parentId == nil ? "Auf oberste Ebene verschieben" : "Eine Ebene höher verschieben",
                                    systemImage: "arrow.up.forward.square"
                                )
                            }
                        }
                    }
                }
                .padding(.horizontal, Spacing.md)
                // Drop targets scale up while highlighted - keep them unclipped.
                .padding(.vertical, Spacing.xs)
            }
        }
        .padding(.vertical, Spacing.sm)
    }

    private func moveUpDropChip(targetParentId: String?) -> some View {
        let label = targetParentId.flatMap { viewModel.album(withId: $0)?.name } ?? "Alben"
        return Label("Nach „\(label)“", systemImage: "arrow.turn.left.up")
            .font(.subheadline.weight(.medium))
            .foregroundStyle(.secondary)
            .padding(.horizontal, Spacing.md)
            .padding(.vertical, Spacing.sm + 2)
            .overlay {
                Capsule().strokeBorder(.secondary.opacity(0.5), style: StrokeStyle(lineWidth: 1, dash: [4, 3]))
            }
            .contentShape(Capsule())
            .albumDropTarget(into: targetParentId, viewModel: viewModel, shape: Capsule())
            .accessibilityLabel("Ablagefläche: Unteralbum nach \(label) verschieben")
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
                        ForEach(allAlbums.filter { candidate in
                            // Exclude the album itself and its own
                            // descendants - reparenting under one of those
                            // would create a cycle the server rejects.
                            candidate.id != album.id
                                && candidate.path != album.path
                                && !candidate.path.hasPrefix(album.path + "/")
                        }) { candidate in
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
        do {
            // AlbumParentUpdate always sends parentId (null for "(keins)"),
            // otherwise moving back to the top level was silently ignored.
            let _: Album = try await APIClient.shared.request(
                "/albums/\(album.id)", method: "PUT", body: AlbumParentUpdate(name: name, parentId: parentId)
            )
            await onSaved()
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
