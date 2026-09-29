import SwiftUI

/// Persisted (via @AppStorage) choice between the cover grid and the
/// compact list on the album overview.
enum AlbumsLayout: String, CaseIterable {
    case grid
    case list

    var systemImage: String {
        switch self {
        case .grid: return "square.grid.2x2"
        case .list: return "list.bullet"
        }
    }

    var accessibilityLabel: String {
        switch self {
        case .grid: return "Rasteransicht"
        case .list: return "Listenansicht"
        }
    }
}

/// The "Sammlungen" tile grid at the top of the Albums tab, like Apple
/// Photos' own Albums tab (Memories/Places/... tiles above the actual
/// album list). `.more` covers the smart media-type collections
/// (Videos/Selfies/Screenshots) that don't warrant their own tile.
enum SystemCollectionTile: CaseIterable, Identifiable, Hashable {
    case memories, map, duplicates, archive, trash, more

    var id: Self { self }

    var title: String {
        switch self {
        case .memories: return "Erinnerungen"
        case .map: return "Karte"
        case .duplicates: return "Duplikate"
        case .archive: return "Archiv"
        case .trash: return "Papierkorb"
        case .more: return "Sammlungen"
        }
    }

    var systemImage: String {
        switch self {
        case .memories: return "clock.arrow.circlepath"
        case .map: return "map"
        case .duplicates: return "square.on.square"
        case .archive: return "archivebox"
        case .trash: return "trash"
        case .more: return "square.stack"
        }
    }

    /// Used as the empty-state background when there's no photo to show yet
    /// (e.g. an empty trash) - each tile gets a distinct tint like Apple's
    /// own colour-coded system collections.
    var gradientColors: [Color] {
        switch self {
        case .memories: return [.orange, .pink]
        case .map: return [.teal, .green]
        case .duplicates: return [.purple, .indigo]
        case .archive: return [.brown, .gray]
        case .trash: return [.red, .gray]
        case .more: return [.blue, .cyan]
        }
    }
}

struct AlbumsView: View {
    @StateObject private var viewModel = AlbumsViewModel()
    @AppStorage("albums.layout") private var layout: AlbumsLayout = .grid
    @State private var navigationPath = NavigationPath()
    @State private var showCreateSheet = false
    @State private var newAlbumName = ""
    @State private var hasLoaded = false

    // "Sammlungen" tile grid (Erinnerungen/Karte/Duplikate/Archiv/Papierkorb),
    // like the top of Apple Photos' own Albums tab.
    @State private var collectionCovers: [SystemCollectionTile: String] = [:]

    // Album context menu (Cover ändern / Freigeben / Löschen).
    @State private var coverPickerAlbum: Album?
    @State private var shareAlbum: Album?
    @State private var albumPendingDeletion: Album?
    @State private var isDeleteDialogPresented = false
    @State private var showMoveTargetPicker = false

    // New: Umbenennen, Sortierung
    @State private var albumPendingRename: Album?
    @State private var renameInput = ""
    @State private var albumPendingSort: Album?

    private let gridColumns = [GridItem(.adaptive(minimum: 150), spacing: Spacing.md, alignment: .top)]

    var body: some View {
        NavigationStack(path: $navigationPath) {
            ScrollView {
                VStack(spacing: Spacing.lg) {
                    collectionsSection

                    exploreSection

                    Text("Meine Alben")
                        .font(.title3.weight(.bold))
                        .frame(maxWidth: .infinity, alignment: .leading)

                    switch layout {
                    case .grid: grid
                    case .list: list
                    }

                    if !viewModel.rootAlbums.isEmpty {
                        Text("Album gedrückt halten und auf ein anderes ziehen, um es dort einzuordnen.")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.center)
                            .padding(.horizontal, Spacing.lg)
                    }
                }
                .padding(.horizontal, Spacing.md)
                .padding(.top, Spacing.sm)
                // Room for the floating controls so the last row isn't covered.
                .padding(.bottom, 96)
            }
            .background(Color(.systemGroupedBackground))
            .navigationDestination(for: Album.self) { album in
                AlbumDetailView(album: album, viewModel: viewModel)
            }
            .navigationDestination(for: SystemCollectionTile.self) { tile in
                switch tile {
                case .memories: MemoriesView()
                case .map: PhotoMapView()
                case .duplicates: DuplicatesView()
                case .archive: ArchiveView()
                case .trash: TrashView()
                case .more: CollectionsView()
                }
            }
            .overlay {
                if hasLoaded && viewModel.rootAlbums.isEmpty {
                    ContentUnavailableView(
                        "Noch keine Alben",
                        systemImage: "rectangle.stack",
                        description: Text("Tippe auf +, um dein erstes Album anzulegen.")
                    )
                }
            }
            .overlay(alignment: .bottom) { floatingControls }
            .navigationTitle("Alben")
            .task {
                await viewModel.load()
                hasLoaded = true
            }
            .task { await loadCollectionCovers() }
            .refreshable { await viewModel.reload() }
            .sensoryFeedback(.success, trigger: viewModel.moveSuccessCount)
            .sensoryFeedback(.error, trigger: viewModel.moveFailureCount)
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
            .sheet(item: $coverPickerAlbum) { album in
                AlbumCoverPickerSheet(album: album) { assetId in
                    await viewModel.setCover(album: album, assetId: assetId)
                }
            }
            .sheet(item: $shareAlbum) { album in
                NavigationStack {
                    SharingView(preselectedAlbumId: album.id)
                        .toolbar {
                            ToolbarItem(placement: .confirmationAction) {
                                Button("Fertig") { shareAlbum = nil }
                            }
                        }
                }
            }
            .sheet(isPresented: $showMoveTargetPicker) {
                if let album = albumPendingDeletion {
                    AlbumMoveTargetPicker(excluding: album) { targetId in
                        Task { await performDelete(album: album, assetAction: .move, targetAlbumId: targetId) }
                    }
                }
            }
            .alert(
                "Album umbenennen",
                isPresented: Binding(get: { albumPendingRename != nil }, set: { if !$0 { albumPendingRename = nil } })
            ) {
                TextField("Name", text: $renameInput)
                Button("Abbrechen", role: .cancel) { albumPendingRename = nil }
                Button("Umbenennen") {
                    if let album = albumPendingRename, !renameInput.trimmingCharacters(in: .whitespaces).isEmpty {
                        Task { await viewModel.renameAlbum(albumId: album.id, newName: renameInput.trimmingCharacters(in: .whitespaces)) }
                    }
                    albumPendingRename = nil
                }
            } message: {
                if let album = albumPendingRename { Text("Aktueller Name: \(album.name)") }
            }
            .confirmationDialog(
                albumPendingSort.map { "Sortierung: \($0.name)" } ?? "",
                isPresented: Binding(get: { albumPendingSort != nil }, set: { if !$0 { albumPendingSort = nil } }),
                titleVisibility: .visible
            ) {
                if let album = albumPendingSort {
                    ForEach(AlbumSortOrder.allCases, id: \.self) { order in
                        Button(order == album.sortOrder ? "✓ \(order.displayName)" : order.displayName) {
                            Task { await viewModel.setSortOrder(albumId: album.id, sortOrder: order) }
                            albumPendingSort = nil
                        }
                    }
                    Button("Abbrechen", role: .cancel) { albumPendingSort = nil }
                }
            }
            .confirmationDialog(
                albumPendingDeletion.map { "\($0.name) löschen?" } ?? "",
                isPresented: $isDeleteDialogPresented,
                titleVisibility: .visible
            ) {
                if let album = albumPendingDeletion {
                    let assetCount = viewModel.previews[album.id]?.assetCount
                    if assetCount == 0 {
                        Button("Album löschen", role: .destructive) {
                            Task { await performDelete(album: album, assetAction: .keep) }
                        }
                    } else {
                        Button("Fotos behalten, Album löschen") {
                            Task { await performDelete(album: album, assetAction: .keep) }
                        }
                        Button("Fotos in ein anderes Album verschieben…") {
                            showMoveTargetPicker = true
                        }
                        Button("Fotos in den Papierkorb verschieben", role: .destructive) {
                            Task { await performDelete(album: album, assetAction: .trash) }
                        }
                    }
                    Button("Abbrechen", role: .cancel) { albumPendingDeletion = nil }
                }
            }
        }
        // Outside the NavigationStack so move errors from a pushed
        // AlbumDetailView surface too.
        .alert(
            "Aktion fehlgeschlagen",
            isPresented: Binding(
                get: { viewModel.errorMessage != nil },
                set: { if !$0 { viewModel.errorMessage = nil } }
            )
        ) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(viewModel.errorMessage ?? "")
        }
    }

    private var exploreSection: some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            Text("Erkunden")
                .font(.title3.weight(.bold))
            VStack(spacing: 0) {
                NavigationLink(destination: TripsView()) {
                    exploreRow("Reisen", systemImage: "map")
                }
                Divider().padding(.leading, 48)
                NavigationLink(destination: SmartAlbumsView()) {
                    exploreRow("Smarte Alben", systemImage: "sparkles")
                }
                Divider().padding(.leading, 48)
                NavigationLink(destination: TagGroupsView()) {
                    exploreRow("Tags", systemImage: "tag.stack")
                }
                Divider().padding(.leading, 48)
                NavigationLink(destination: UserLabelsView()) {
                    exploreRow("Labels", systemImage: "tag")
                }
            }
            .background(Color(.secondarySystemGroupedBackground))
            .clipShape(RoundedRectangle(cornerRadius: Radius.md, style: .continuous))
        }
    }

    private func exploreRow(_ title: String, systemImage: String) -> some View {
        HStack(spacing: Spacing.sm) {
            Image(systemName: systemImage)
                .frame(width: 28)
                .foregroundStyle(Color.accentColor)
            Text(title)
                .foregroundStyle(.primary)
            Spacer()
            Image(systemName: "chevron.right")
                .font(.footnote.weight(.semibold))
                .foregroundStyle(Color(.tertiaryLabel))
        }
        .padding(.horizontal, Spacing.md)
        .padding(.vertical, 12)
        .contentShape(Rectangle())
    }

    private var collectionsSection: some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            Text("Sammlungen")
                .font(.title3.weight(.bold))
            LazyVGrid(
                columns: [GridItem(.flexible(), spacing: Spacing.sm), GridItem(.flexible(), spacing: Spacing.sm)],
                spacing: Spacing.sm
            ) {
                ForEach(SystemCollectionTile.allCases) { tile in
                    NavigationLink(value: tile) {
                        SystemCollectionTileView(tile: tile, coverAssetId: collectionCovers[tile])
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    /// One cheap, id-only fetch per tile so the grid can show a real cover
    /// photo - `.more` needs none (it just links onward to a sub-list).
    private func loadCollectionCovers() async {
        struct AssetIdOnly: Decodable { let id: String }
        struct MemoriesGroup: Decodable { let assets: [AssetIdOnly] }
        struct MemoriesResponse: Decodable { let memories: [MemoriesGroup] }
        struct MapPointOnly: Decodable { let id: String }
        struct MapResponseLite: Decodable { let points: [MapPointOnly] }
        struct DuplicateGroupLite: Decodable { let assets: [AssetIdOnly] }
        struct DuplicatesResponseLite: Decodable { let groups: [DuplicateGroupLite] }

        async let memories: MemoriesResponse? = try? APIClient.shared.request("/assets/memories")
        async let mapPoints: MapResponseLite? = try? APIClient.shared.request("/assets/map")
        async let duplicates: DuplicatesResponseLite? = try? APIClient.shared.request("/assets/duplicates")
        async let archived: AssetPage? = try? APIClient.shared.request("/assets?archived=true&limit=1")
        async let trashed: AssetPage? = try? APIClient.shared.request("/assets?trashed=true&limit=1")

        let (memoriesResult, mapResult, duplicatesResult, archivedResult, trashedResult) =
            await (memories, mapPoints, duplicates, archived, trashed)

        var covers: [SystemCollectionTile: String] = [:]
        covers[.memories] = memoriesResult?.memories.first?.assets.first?.id
        covers[.map] = mapResult?.points.first?.id
        covers[.duplicates] = duplicatesResult?.groups.first?.assets.first?.id
        covers[.archive] = archivedResult?.assets.first?.id
        covers[.trash] = trashedResult?.assets.first?.id
        collectionCovers = covers
    }

    private var grid: some View {
        LazyVGrid(columns: gridColumns, spacing: Spacing.lg) {
            ForEach(viewModel.rootAlbums) { album in
                NavigationLink(value: album) {
                    AlbumGridTile(
                        album: album,
                        viewModel: viewModel,
                        onCoverChange: { coverPickerAlbum = album },
                        onShare: { shareAlbum = album },
                        onDelete: { requestDelete(album) },
                        onRename: { albumPendingRename = album; renameInput = album.name },
                        onDuplicate: { Task { await performDuplicate(album) } },
                        onTogglePin: { Task { await viewModel.togglePin(album: album) } },
                        onSortOrder: { albumPendingSort = album }
                    )
                }
                .buttonStyle(.plain)
            }
        }
        .transition(.opacity.combined(with: .scale(scale: 0.98)))
    }

    private var list: some View {
        LazyVStack(spacing: Spacing.sm) {
            ForEach(viewModel.rootAlbums) { album in
                NavigationLink(value: album) {
                    AlbumListRow(
                        album: album,
                        viewModel: viewModel,
                        onCoverChange: { coverPickerAlbum = album },
                        onShare: { shareAlbum = album },
                        onDelete: { requestDelete(album) },
                        onRename: { albumPendingRename = album; renameInput = album.name },
                        onDuplicate: { Task { await performDuplicate(album) } },
                        onTogglePin: { Task { await viewModel.togglePin(album: album) } },
                        onSortOrder: { albumPendingSort = album }
                    )
                }
                .buttonStyle(.plain)
            }
        }
        .transition(.opacity.combined(with: .scale(scale: 0.98)))
    }

    /// Sub-albums must be deleted or moved out first (the backend rejects
    /// otherwise) - caught here too so the message is German and immediate
    /// instead of a round-trip to the server.
    private func requestDelete(_ album: Album) {
        guard viewModel.children(of: album.id).isEmpty else {
            viewModel.errorMessage = "Lösche oder verschiebe zuerst die Unteralben von \"\(album.name)\"."
            return
        }
        albumPendingDeletion = album
        isDeleteDialogPresented = true
    }

    private func performDelete(album: Album, assetAction: AlbumDeleteAssetAction, targetAlbumId: String? = nil) async {
        await viewModel.deleteAlbum(albumId: album.id, assetAction: assetAction, targetAlbumId: targetAlbumId)
        albumPendingDeletion = nil
        showMoveTargetPicker = false
    }

    private func performDuplicate(_ album: Album) async {
        if let newAlbum = await viewModel.duplicateAlbum(albumId: album.id) {
            navigationPath.append(newAlbum)
        }
    }

    private var floatingControls: some View {
        HStack(alignment: .center) {
            GlassSegmentedToggle(
                options: AlbumsLayout.allCases,
                selection: $layout,
                systemImage: \.systemImage,
                accessibilityLabel: \.accessibilityLabel
            )
            Spacer()
            GlassFloatingActionButton(systemImage: "plus") { showCreateSheet = true }
                .accessibilityLabel("Neues Album")
        }
        .padding(.horizontal, Spacing.lg)
        .padding(.bottom, Spacing.md)
    }
}

/// One large photo-backed tile in the "Sammlungen" grid, styled like Apple
/// Photos: the cover photo fills the tile with the title overlaid at the
/// bottom over a dark scrim; falls back to a tinted gradient + icon when
/// there's no cover yet (still loading, or the collection is empty).
private struct SystemCollectionTileView: View {
    let tile: SystemCollectionTile
    let coverAssetId: String?

    private var shape: RoundedRectangle { RoundedRectangle(cornerRadius: Radius.md, style: .continuous) }

    var body: some View {
        ZStack(alignment: .bottomLeading) {
            if let coverAssetId {
                CachedThumbnail(assetId: coverAssetId, url: APIClient.imageURL(path: "/assets/\(coverAssetId)/thumbnail"))
                    .aspectRatio(contentMode: .fill)
                LinearGradient(colors: [.clear, .black.opacity(0.6)], startPoint: .center, endPoint: .bottom)
            } else {
                LinearGradient(colors: tile.gradientColors, startPoint: .topLeading, endPoint: .bottomTrailing)
                Image(systemName: tile.systemImage)
                    .font(.system(size: 32, weight: .light))
                    .foregroundStyle(.white.opacity(0.9))
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
            }

            Text(tile.title)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.white)
                .lineLimit(1)
                .padding(Spacing.sm)
        }
        .aspectRatio(1, contentMode: .fit)
        .clipShape(shape)
        .contentShape(shape)
    }
}

/// Sheet for the "Cover ändern" context menu action - a plain grid of the
/// album's own photos (mirrors AlbumDetailView's grid), tap to set as cover.
private struct AlbumCoverPickerSheet: View {
    let album: Album
    let onSelect: (String) async -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var detail: AlbumDetail?
    @State private var isSaving = false

    private let columns = [GridItem(.adaptive(minimum: 90), spacing: 2)]

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVGrid(columns: columns, spacing: 2) {
                    ForEach(detail?.assets ?? []) { asset in
                        Button {
                            Task {
                                isSaving = true
                                await onSelect(asset.id)
                                isSaving = false
                                dismiss()
                            }
                        } label: {
                            CachedThumbnail(assetId: asset.id, url: APIClient.thumbnailURL(for: asset))
                                .aspectRatio(1, contentMode: .fill)
                                .clipped()
                        }
                        .disabled(isSaving)
                    }
                }
            }
            .overlay {
                if let detail, detail.assets.isEmpty {
                    ContentUnavailableView("Album ist leer", systemImage: "photo")
                }
            }
            .navigationTitle("Cover wählen")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Abbrechen") { dismiss() } }
            }
            .task { detail = try? await APIClient.shared.request("/albums/\(album.id)") }
        }
    }
}

/// Sheet for "Fotos in ein anderes Album verschieben…" during album
/// deletion - a flat list of every other album, picking one deletes the
/// source album with assetAction "move" + this target.
private struct AlbumMoveTargetPicker: View {
    let excluding: Album
    let onPick: (String) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var albums: [Album] = []

    private var candidates: [Album] {
        albums.filter { candidate in
            candidate.id != excluding.id
                && candidate.path != excluding.path
                && !candidate.path.hasPrefix(excluding.path + "/")
        }
    }

    var body: some View {
        NavigationStack {
            List(candidates) { candidate in
                Button(candidate.path) {
                    onPick(candidate.id)
                    dismiss()
                }
            }
            .overlay {
                if albums.isEmpty {
                    ContentUnavailableView("Keine weiteren Alben", systemImage: "rectangle.stack")
                }
            }
            .navigationTitle("Fotos verschieben nach…")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Abbrechen") { dismiss() } }
            }
            .task { albums = (try? await APIClient.shared.request("/albums")) ?? [] }
        }
    }
}
