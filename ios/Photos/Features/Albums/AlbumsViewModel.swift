import Foundation

/// What an album tile needs beyond the bare `Album` row: a representative
/// asset for the cover and how many assets it holds. The backend has no
/// per-album count/cover endpoint (and `coverAssetId` is never set by it
/// yet), so this is derived from the first page of GET /albums/:id.
struct AlbumPreview: Equatable {
    let coverAssetId: String?
    let assetCount: Int
    /// The first page was full, i.e. there are at least `assetCount` assets.
    let hasMoreAssets: Bool
}

@MainActor
final class AlbumsViewModel: ObservableObject {
    @Published var rootAlbums: [Album] = []
    @Published var errorMessage: String?
    @Published private(set) var previews: [String: AlbumPreview] = [:]
    /// Album currently being moved on the server - its tile dims and shows a
    /// spinner so a slow folder move (big albums move real directories) is
    /// visibly in progress.
    @Published private(set) var movingAlbumId: String?
    /// Bumped after every successful / failed move, drives haptic feedback.
    @Published private(set) var moveSuccessCount = 0
    @Published private(set) var moveFailureCount = 0
    /// Set when an album drag starts (SwiftUI on iOS 26 has no drag-session
    /// callbacks yet). Deliberately not @Published: it's only read by drop
    /// targets while that same drag hovers them, so a stale value after a
    /// cancelled drag is harmless - the next drag overwrites it.
    var draggingAlbumId: String?

    private var allAlbums: [Album] = []
    private var previewTasks: [String: Task<Void, Never>] = [:]

    private func setError(_ error: Error) {
        guard !(error is CancellationError) else { return }
        setError(error)
    }

    /// Page size used to count assets for a tile; beyond this we show "200+"
    /// instead of paging through the whole album just for a number.
    private static let previewPageSize = 200

    func load() async {
        do {
            allAlbums = try await APIClient.shared.request("/albums")
            rootAlbums = allAlbums.filter { $0.parentId == nil }
        } catch {
            setError(error)
        }
    }

    /// Pull-to-refresh: also forget cached covers/counts so newly added
    /// photos show up.
    func reload() async {
        previewTasks.values.forEach { $0.cancel() }
        previewTasks = [:]
        previews = [:]
        await load()
    }

    func album(withId id: String) -> Album? {
        allAlbums.first { $0.id == id }
    }

    func children(of albumId: String) -> [Album] {
        allAlbums.filter { $0.parentId == albumId }
    }

    func createAlbum(name: String, parentId: String?) async {
        struct Body: Encodable { let name: String; let parentId: String? }
        do {
            let created: Album = try await APIClient.shared.request(
                "/albums", method: "POST", body: Body(name: name, parentId: parentId)
            )
            allAlbums.append(created)
            if parentId == nil { rootAlbums.append(created) }
        } catch {
            setError(error)
        }
    }

    // MARK: - Previews (cover + count)

    func loadPreviewIfNeeded(for album: Album) async {
        guard previews[album.id] == nil else { return }
        if let running = previewTasks[album.id] {
            await running.value
            return
        }
        let task = Task { [weak self] in
            guard let self else { return }
            if let preview = await self.fetchPreview(for: album) {
                self.previews[album.id] = preview
            }
            self.previewTasks[album.id] = nil
        }
        previewTasks[album.id] = task
        await task.value
    }

    private func fetchPreview(for album: Album) async -> AlbumPreview? {
        guard let detail: AlbumDetail = try? await APIClient.shared.request(
            "/albums/\(album.id)?limit=\(Self.previewPageSize)"
        ) else { return nil }

        var cover = album.coverAssetId ?? detail.coverAssetId ?? detail.assets.first?.id
        // An album that only contains sub-albums (a pure "folder") borrows
        // the cover of its first non-empty descendant, like Apple Photos
        // does for folders.
        if cover == nil {
            cover = await firstDescendantCover(of: detail.children, depth: 2)
        }
        return AlbumPreview(
            coverAssetId: cover,
            assetCount: detail.assets.count,
            hasMoreAssets: detail.nextCursor != nil
        )
    }

    private func firstDescendantCover(of children: [Album], depth: Int) async -> String? {
        guard depth > 0, !children.isEmpty else { return nil }

        // Fast path: return immediately from cache without any network round-trip.
        for child in children.prefix(4) {
            if let known = previews[child.id]?.coverAssetId { return known }
        }

        // Parallel fetch: fire all candidates at once instead of sequentially.
        typealias Fetched = (index: Int, cover: String?, subChildren: [Album])
        let candidates = Array(children.prefix(4))

        let fetched: [Fetched] = await withTaskGroup(of: Fetched.self) { group in
            for (i, child) in candidates.enumerated() {
                let childId = child.id
                let knownCover = child.coverAssetId
                group.addTask {
                    if let cover = knownCover { return (i, cover, []) }
                    guard let detail: AlbumDetail = try? await APIClient.shared.request(
                        "/albums/\(childId)?limit=1"
                    ) else { return (i, nil, []) }
                    return (i, detail.assets.first?.id, detail.children)
                }
            }
            var out: [Fetched] = []
            for await r in group { out.append(r) }
            return out
        }

        // Evaluate in original order to keep cover preference deterministic.
        for result in fetched.sorted(by: { $0.index < $1.index }) {
            if let cover = result.cover { return cover }
            if let nested = await firstDescendantCover(of: result.subChildren, depth: depth - 1) {
                return nested
            }
        }
        return nil
    }

    // MARK: - Moving (drag & drop reparenting)

    /// Whether `albumId` may be dropped onto `targetParentId` (nil = top
    /// level). Mirrors the backend's checks in album.service.ts
    /// (moveAlbumFolder) so invalid targets never light up as drop zones.
    func canMove(albumId: String, toParent targetParentId: String?) -> Bool {
        guard movingAlbumId == nil, let album = album(withId: albumId) else { return false }
        guard album.parentId != targetParentId else { return false }
        guard let targetParentId else { return true }
        guard targetParentId != albumId, let target = self.album(withId: targetParentId) else { return false }
        return !(target.path == album.path || target.path.hasPrefix(album.path + "/"))
    }

    /// Reparents an album via the same PUT /albums/:id call the web album
    /// tree (frontend/src/components/AlbumTree.tsx) uses. The backend moves
    /// the real folder and every nested asset path with it.
    @discardableResult
    func move(albumId: String, toParent targetParentId: String?) async -> Bool {
        guard canMove(albumId: albumId, toParent: targetParentId) else { return false }
        movingAlbumId = albumId
        defer { movingAlbumId = nil }
        do {
            let _: Album = try await APIClient.shared.request(
                "/albums/\(albumId)", method: "PUT", body: AlbumParentUpdate(parentId: targetParentId)
            )
            await load()
            moveSuccessCount += 1
            return true
        } catch {
            setError(error)
            moveFailureCount += 1
            return false
        }
    }

    // MARK: - Context menu actions

    /// `PUT /albums/:id {coverAssetId}` - `assetId` must already be in the
    /// album's grid (the backend validates this via AlbumAsset).
    @discardableResult
    func setCover(album: Album, assetId: String) async -> Bool {
        struct Body: Encodable { let coverAssetId: String }
        do {
            let _: Album = try await APIClient.shared.request(
                "/albums/\(album.id)", method: "PUT", body: Body(coverAssetId: assetId)
            )
            // previews[album.id] == nil would just re-trigger the tile's
            // .task(id:) guard as a no-op - fetch the fresh cover directly.
            if let preview = await fetchPreview(for: album) {
                previews[album.id] = preview
            }
            return true
        } catch {
            setError(error)
            return false
        }
    }

    /// `PUT /albums/:id {name}` — renames the album and refreshes the list.
    @discardableResult
    func renameAlbum(albumId: String, newName: String) async -> Bool {
        struct Body: Encodable { let name: String }
        do {
            let updated: Album = try await APIClient.shared.request(
                "/albums/\(albumId)", method: "PUT", body: Body(name: newName)
            )
            // Update in-place so the tile reflects the new name immediately.
            func replace(in list: inout [Album]) {
                if let idx = list.firstIndex(where: { $0.id == albumId }) {
                    list[idx] = updated
                }
            }
            replace(in: &allAlbums)
            replace(in: &rootAlbums)
            return true
        } catch {
            setError(error)
            return false
        }
    }

    /// `POST /albums/:id/duplicate` — creates "Kopie von [Name]" and returns the new album.
    func duplicateAlbum(albumId: String) async -> Album? {
        do {
            let newAlbum: Album = try await APIClient.shared.request(
                "/albums/\(albumId)/duplicate", method: "POST"
            )
            allAlbums.append(newAlbum)
            if newAlbum.parentId == nil { rootAlbums.append(newAlbum) }
            return newAlbum
        } catch {
            setError(error)
            return nil
        }
    }

    /// `PUT /albums/:id {pinned}` — toggles the pinned flag and refreshes order.
    @discardableResult
    func togglePin(album: Album) async -> Bool {
        struct Body: Encodable { let pinned: Bool }
        do {
            let updated: Album = try await APIClient.shared.request(
                "/albums/\(album.id)", method: "PUT", body: Body(pinned: !album.pinned)
            )
            func replace(in list: inout [Album]) {
                if let idx = list.firstIndex(where: { $0.id == album.id }) {
                    list[idx] = updated
                }
            }
            replace(in: &allAlbums)
            replace(in: &rootAlbums)
            // Pinned albums sort first - reload to get the server order.
            await load()
            return true
        } catch {
            setError(error)
            return false
        }
    }

    /// `PUT /albums/:id {sortOrder}` — persists the photo sort preference.
    @discardableResult
    func setSortOrder(albumId: String, sortOrder: AlbumSortOrder) async -> Bool {
        struct Body: Encodable { let sortOrder: AlbumSortOrder }
        do {
            let updated: Album = try await APIClient.shared.request(
                "/albums/\(albumId)", method: "PUT", body: Body(sortOrder: sortOrder)
            )
            func replace(in list: inout [Album]) {
                if let idx = list.firstIndex(where: { $0.id == albumId }) {
                    list[idx] = updated
                }
            }
            replace(in: &allAlbums)
            replace(in: &rootAlbums)
            return true
        } catch {
            setError(error)
            return false
        }
    }

    /// `DELETE /albums/:id {assetAction, targetAlbumId?}` - see
    /// backend/src/services/album.service.ts for what each assetAction does.
    @discardableResult
    func deleteAlbum(albumId: String, assetAction: AlbumDeleteAssetAction, targetAlbumId: String? = nil) async -> Bool {
        do {
            try await APIClient.shared.requestVoid(
                "/albums/\(albumId)", method: "DELETE",
                body: AlbumDeleteBody(assetAction: assetAction, targetAlbumId: targetAlbumId)
            )
            allAlbums.removeAll { $0.id == albumId }
            rootAlbums.removeAll { $0.id == albumId }
            previews[albumId] = nil
            return true
        } catch {
            setError(error)
            return false
        }
    }
}

enum AlbumDeleteAssetAction: String, Encodable {
    case keep, move, trash
}

private struct AlbumDeleteBody: Encodable {
    let assetAction: AlbumDeleteAssetAction
    let targetAlbumId: String?
}

/// `{ "parentId": ... }` with an explicit JSON `null` for "move to top
/// level". A synthesized Encodable would drop a nil optional entirely, and
/// the backend treats a missing `parentId` as "leave unchanged".
struct AlbumParentUpdate: Encodable {
    let name: String?
    let parentId: String?

    init(name: String? = nil, parentId: String?) {
        self.name = name
        self.parentId = parentId
    }

    private enum CodingKeys: String, CodingKey { case name, parentId }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encodeIfPresent(name, forKey: .name)
        try container.encode(parentId, forKey: .parentId)
    }
}
