import Foundation
import Observation

/// App-wide record of what happened to assets while the app is running, so
/// screens that hold their own copy of an asset list stay in sync without a
/// full reload:
///
/// - `latest`: the newest server copy of every asset changed in this session
///   (favourite/archive toggles, edits). The viewer maps its input through
///   it, so re-opening a photo never shows a stale heart/archive state.
/// - `revision(for:)`: bumped after an edit/revert. Thumbnail views and the
///   viewer fold it into their image URL and `.task(id:)`, which drops the old
///   pixels from every cache layer and refetches.
/// - `libraryVersion`: bumped whenever an asset leaves the main library
///   (archived, moved to the trash, deleted forever) or comes back into it
///   (un-archived, restored). Lists observe it and reconcile.
@MainActor
@Observable
final class AssetChanges {
    static let shared = AssetChanges()

    private(set) var latest: [String: Asset] = [:]
    private(set) var revisions: [String: Int] = [:]
    /// Ids that are currently not part of the main library (archive/trash).
    private(set) var hiddenFromLibrary: Set<String> = []
    private(set) var libraryVersion = 0
    /// Only bumped when something *re-enters* the library - lists that
    /// can't know where to insert it (timeline) reload in that case.
    private(set) var additionsVersion = 0

    private init() {}

    func current(_ asset: Asset) -> Asset { latest[asset.id] ?? asset }

    func revision(for assetId: String) -> Int { revisions[assetId] ?? 0 }

    /// Adds a cache-busting `v` query item once an asset has been edited.
    func versionedURL(_ url: URL?, assetId: String) -> URL? {
        let revision = revision(for: assetId)
        guard revision > 0, let url else { return url }
        return url.appending(queryItems: [URLQueryItem(name: "v", value: String(revision))])
    }

    /// A server response (favourite, archive, ...) - no pixel change.
    func update(_ asset: Asset) {
        latest[asset.id] = asset
        if asset.isArchived {
            markRemovedFromLibrary(asset.id)
        } else if hiddenFromLibrary.contains(asset.id) {
            markAddedToLibrary(asset.id)
        }
    }

    /// Pixels changed (edit/revert): purge caches, then bump the revision.
    func pixelsChanged(_ asset: Asset) async {
        latest[asset.id] = asset
        await ImageCache.shared.remove(assetId: asset.id)
        TimelineThumbnailMemory.shared.remove(asset.id)
        revisions[asset.id, default: 0] += 1
    }

    func markRemovedFromLibrary(_ assetId: String) {
        hiddenFromLibrary.insert(assetId)
        libraryVersion += 1
    }

    func markAddedToLibrary(_ assetId: String) {
        hiddenFromLibrary.remove(assetId)
        additionsVersion += 1
        libraryVersion += 1
    }

    // MARK: - Shared server actions

    @discardableResult
    func setArchived(_ asset: Asset, _ archived: Bool) async throws -> Asset {
        struct Body: Encodable { let isArchived: Bool }
        let updated: Asset = try await APIClient.shared.request(
            "/assets/\(asset.id)", method: "PUT", body: Body(isArchived: archived)
        )
        update(updated)
        return updated
    }

    func moveToTrash(_ assetId: String) async throws {
        try await APIClient.shared.requestVoid("/assets/\(assetId)", method: "DELETE")
        markRemovedFromLibrary(assetId)
    }

    func restoreFromTrash(_ assetId: String) async throws {
        try await APIClient.shared.requestVoid("/assets/\(assetId)/restore", method: "POST")
        // Archived items restore into the archive, not the timeline - the
        // timeline reload that follows filters them out server-side anyway.
        markAddedToLibrary(assetId)
    }

    func deletePermanently(_ assetId: String) async throws {
        try await APIClient.shared.requestVoid("/assets/\(assetId)/permanent", method: "DELETE")
        latest[assetId] = nil
        PhotoEditRecord.remove(assetId: assetId)
        await ImageCache.shared.remove(assetId: assetId)
        TimelineThumbnailMemory.shared.remove(assetId)
        hiddenFromLibrary.insert(assetId)
        libraryVersion += 1
    }
}
