import SwiftUI
import UniformTypeIdentifiers

// MARK: - Drag payload

extension UTType {
    /// App-internal type so album drags only ever land on album drop
    /// targets (and never get confused with dragged text or images).
    static let photosAlbumReference = UTType(exportedAs: "de.baucas.photos.album-reference")
}

/// What travels with an album drag: only the id - the drop target looks
/// the album up in AlbumsViewModel, which has the authoritative tree.
struct AlbumDragItem: Codable, Transferable {
    let albumId: String

    static var transferRepresentation: some TransferRepresentation {
        CodableRepresentation(contentType: .photosAlbumReference)
    }
}

extension View {
    /// Makes an album draggable and remembers which one is in flight, so
    /// drop targets can decide (before the drop) whether they're valid.
    func albumDraggable<S: Shape>(_ album: Album, viewModel: AlbumsViewModel, previewShape: S) -> some View {
        self
            .contentShape(.dragPreview, previewShape)
            .draggable({ () -> AlbumDragItem in
                viewModel.draggingAlbumId = album.id
                return AlbumDragItem(albumId: album.id)
            }())
    }

    /// Accepts an album drop and moves the dropped album into
    /// `targetParentId` (nil = top level). Highlights only for drops the
    /// backend would accept (not onto itself / its own descendants / its
    /// current parent).
    func albumDropTarget<S: InsettableShape>(
        into targetParentId: String?,
        viewModel: AlbumsViewModel,
        shape: S,
        onMoved: @escaping () async -> Void = {}
    ) -> some View {
        modifier(AlbumDropTargetModifier(
            targetParentId: targetParentId, viewModel: viewModel, shape: shape, onMoved: onMoved
        ))
    }
}

private struct AlbumDropTargetModifier<S: InsettableShape>: ViewModifier {
    let targetParentId: String?
    @ObservedObject var viewModel: AlbumsViewModel
    let shape: S
    let onMoved: () async -> Void

    @State private var isValidTarget = false

    func body(content: Content) -> some View {
        content
            .overlay {
                shape
                    .strokeBorder(Color.accentColor, lineWidth: 3)
                    .background(shape.fill(Color.accentColor.opacity(0.14)))
                    .opacity(isValidTarget ? 1 : 0)
                    .allowsHitTesting(false)
            }
            .scaleEffect(isValidTarget ? 1.04 : 1)
            .animation(.snappy(duration: 0.25), value: isValidTarget)
            .sensoryFeedback(.impact(weight: .light), trigger: isValidTarget) { _, new in new }
            .dropDestination(for: AlbumDragItem.self) { items, _ in
                isValidTarget = false
                guard let albumId = items.first?.albumId,
                      viewModel.canMove(albumId: albumId, toParent: targetParentId)
                else { return false }
                Task {
                    if await viewModel.move(albumId: albumId, toParent: targetParentId) {
                        await onMoved()
                    }
                }
                return true
            } isTargeted: { targeted in
                isValidTarget = targeted && viewModel.draggingAlbumId.map {
                    viewModel.canMove(albumId: $0, toParent: targetParentId)
                } == true
            }
    }
}

// MARK: - Cover

/// Square cover image for an album, falling back to a folder glyph for
/// empty albums (or while the preview is still loading).
struct AlbumCoverView: View {
    let preview: AlbumPreview?
    var glyphSize: CGFloat = 34

    var body: some View {
        ZStack {
            Rectangle().fill(.quaternary)
            if let coverId = preview?.coverAssetId {
                CachedThumbnail(assetId: coverId, url: APIClient.imageURL(path: "/assets/\(coverId)/thumbnail"))
            } else {
                Image(systemName: preview == nil ? "photo.on.rectangle" : "folder")
                    .font(.system(size: glyphSize, weight: .light))
                    .foregroundStyle(.tertiary)
                    .symbolEffect(.pulse, isActive: preview == nil)
            }
        }
    }
}

extension AlbumPreview {
    /// "12", "200+", "Leer" - plus the sub-album count when there is one.
    func subtitle(childCount: Int) -> String {
        var parts: [String] = []
        if assetCount > 0 || childCount == 0 {
            if assetCount == 0 {
                parts.append("Leer")
            } else {
                parts.append(hasMoreAssets ? "\(assetCount)+" : "\(assetCount)")
            }
        }
        if childCount > 0 {
            parts.append(childCount == 1 ? "1 Unteralbum" : "\(childCount) Unteralben")
        }
        return parts.joined(separator: " · ")
    }
}

// MARK: - Grid tile

struct AlbumGridTile: View {
    let album: Album
    @ObservedObject var viewModel: AlbumsViewModel
    var onCoverChange: (() -> Void)? = nil
    var onShare: (() -> Void)? = nil
    var onDelete: (() -> Void)? = nil
    var onRename: (() -> Void)? = nil
    var onDuplicate: (() -> Void)? = nil
    var onTogglePin: (() -> Void)? = nil
    var onSortOrder: (() -> Void)? = nil

    private var shape: RoundedRectangle { RoundedRectangle(cornerRadius: Radius.md, style: .continuous) }

    var body: some View {
        let preview = viewModel.previews[album.id]
        let isMoving = viewModel.movingAlbumId == album.id
        let hasMenu = onCoverChange != nil || onShare != nil || onDelete != nil

        VStack(alignment: .leading, spacing: Spacing.xs) {
            Color.clear
                .aspectRatio(1, contentMode: .fit)
                .overlay { AlbumCoverView(preview: preview) }
                .clipShape(shape)
                .overlay(alignment: .topLeading) {
                    if album.pinned {
                        Image(systemName: "pin.fill")
                            .font(.caption2.weight(.semibold))
                            .foregroundStyle(.orange)
                            .padding(6)
                            .glassEffect(.regular, in: Circle())
                            .padding(Spacing.sm)
                    }
                }
                .overlay(alignment: .topTrailing) {
                    if viewModel.children(of: album.id).isEmpty == false {
                        Image(systemName: "folder.fill")
                            .font(.caption2.weight(.semibold))
                            .padding(6)
                            .glassEffect(.regular, in: Circle())
                            .padding(Spacing.sm)
                    }
                }
                .overlay(alignment: .bottomTrailing) {
                    if hasMenu && !isMoving {
                        Menu {
                            if let onRename {
                                Button { onRename() } label: {
                                    Label("Umbenennen", systemImage: "pencil")
                                }
                            }
                            if let onDuplicate {
                                Button { onDuplicate() } label: {
                                    Label("Duplizieren", systemImage: "plus.square.on.square")
                                }
                            }
                            if let onTogglePin {
                                Button { onTogglePin() } label: {
                                    Label(
                                        album.pinned ? "Nicht mehr anheften" : "Oben anheften",
                                        systemImage: album.pinned ? "pin.slash" : "pin"
                                    )
                                }
                            }
                            if let onSortOrder {
                                Button { onSortOrder() } label: {
                                    Label("Sortierung", systemImage: "arrow.up.arrow.down")
                                }
                            }
                            Divider()
                            if let onCoverChange {
                                Button { onCoverChange() } label: {
                                    Label("Cover ändern", systemImage: "photo")
                                }
                            }
                            if let onShare {
                                Button { onShare() } label: {
                                    Label("Freigeben", systemImage: "square.and.arrow.up")
                                }
                            }
                            if let onDelete {
                                Button(role: .destructive) { onDelete() } label: {
                                    Label("Löschen", systemImage: "trash")
                                }
                            }
                        } label: {
                            Image(systemName: "ellipsis.circle.fill")
                                .font(.title3)
                                .symbolRenderingMode(.hierarchical)
                                .padding(6)
                                .glassEffect(.regular, in: Circle())
                        }
                        .padding(Spacing.sm)
                    }
                }
                .overlay {
                    if isMoving {
                        ProgressView()
                            .padding(Spacing.sm)
                            .glassEffect(.regular, in: Circle())
                    }
                }
                .albumDropTarget(into: album.id, viewModel: viewModel, shape: shape)

            VStack(alignment: .leading, spacing: 2) {
                Text(album.name)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.primary)
                    .lineLimit(1)
                Text(preview?.subtitle(childCount: viewModel.children(of: album.id).count) ?? "Lädt …")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                    .redacted(reason: preview == nil ? .placeholder : [])
            }
            .padding(.horizontal, 2)
        }
        .opacity(isMoving ? 0.6 : 1)
        .contentShape(Rectangle())
        .albumDraggable(album, viewModel: viewModel, previewShape: shape)
        .task(id: album.id) { await viewModel.loadPreviewIfNeeded(for: album) }
        .accessibilityElement(children: .combine)
        .accessibilityHint("Zum Verschieben gedrückt halten und auf ein anderes Album ziehen")
    }
}

// MARK: - List row

struct AlbumListRow: View {
    let album: Album
    @ObservedObject var viewModel: AlbumsViewModel
    var onCoverChange: (() -> Void)? = nil
    var onShare: (() -> Void)? = nil
    var onDelete: (() -> Void)? = nil
    var onRename: (() -> Void)? = nil
    var onDuplicate: (() -> Void)? = nil
    var onTogglePin: (() -> Void)? = nil
    var onSortOrder: (() -> Void)? = nil

    private var thumbShape: RoundedRectangle { RoundedRectangle(cornerRadius: Radius.sm, style: .continuous) }
    private var rowShape: RoundedRectangle { RoundedRectangle(cornerRadius: Radius.md, style: .continuous) }

    var body: some View {
        let preview = viewModel.previews[album.id]
        let isMoving = viewModel.movingAlbumId == album.id
        let hasMenu = onCoverChange != nil || onShare != nil || onDelete != nil

        HStack(spacing: Spacing.md) {
            AlbumCoverView(preview: preview, glyphSize: 20)
                .frame(width: 56, height: 56)
                .clipShape(thumbShape)

            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 4) {
                    if album.pinned {
                        Image(systemName: "pin.fill")
                            .font(.caption2)
                            .foregroundStyle(.orange)
                    }
                    Text(album.name)
                        .font(.body.weight(.medium))
                        .foregroundStyle(.primary)
                        .lineLimit(1)
                }
                Text(preview?.subtitle(childCount: viewModel.children(of: album.id).count) ?? "Lädt …")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                    .redacted(reason: preview == nil ? .placeholder : [])
            }

            Spacer(minLength: 0)

            if isMoving {
                ProgressView()
            } else {
                if hasMenu {
                    Menu {
                        if let onRename {
                            Button { onRename() } label: {
                                Label("Umbenennen", systemImage: "pencil")
                            }
                        }
                        if let onDuplicate {
                            Button { onDuplicate() } label: {
                                Label("Duplizieren", systemImage: "plus.square.on.square")
                            }
                        }
                        if let onTogglePin {
                            Button { onTogglePin() } label: {
                                Label(
                                    album.pinned ? "Nicht mehr anheften" : "Oben anheften",
                                    systemImage: album.pinned ? "pin.slash" : "pin"
                                )
                            }
                        }
                        if let onSortOrder {
                            Button { onSortOrder() } label: {
                                Label("Sortierung", systemImage: "arrow.up.arrow.down")
                            }
                        }
                        Divider()
                        if let onCoverChange {
                            Button { onCoverChange() } label: {
                                Label("Cover ändern", systemImage: "photo")
                            }
                        }
                        if let onShare {
                            Button { onShare() } label: {
                                Label("Freigeben", systemImage: "square.and.arrow.up")
                            }
                        }
                        if let onDelete {
                            Button(role: .destructive) { onDelete() } label: {
                                Label("Löschen", systemImage: "trash")
                            }
                        }
                    } label: {
                        Image(systemName: "ellipsis.circle")
                            .font(.title3)
                            .foregroundStyle(.secondary)
                    }
                }
                Image(systemName: "chevron.right")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(.tertiary)
            }
        }
        .padding(.horizontal, Spacing.sm)
        .padding(.vertical, Spacing.sm)
        .background(Color(.secondarySystemGroupedBackground), in: rowShape)
        .opacity(isMoving ? 0.6 : 1)
        .contentShape(rowShape)
        .albumDropTarget(into: album.id, viewModel: viewModel, shape: rowShape)
        .albumDraggable(album, viewModel: viewModel, previewShape: rowShape)
        .task(id: album.id) { await viewModel.loadPreviewIfNeeded(for: album) }
        .accessibilityElement(children: .combine)
        .accessibilityHint("Zum Verschieben gedrückt halten und auf ein anderes Album ziehen")
    }
}

// MARK: - Sub-album chip (AlbumDetailView)

struct AlbumChip: View {
    let album: Album
    @ObservedObject var viewModel: AlbumsViewModel

    var body: some View {
        let isMoving = viewModel.movingAlbumId == album.id

        HStack(spacing: Spacing.sm) {
            AlbumCoverView(preview: viewModel.previews[album.id], glyphSize: 13)
                .frame(width: 28, height: 28)
                .clipShape(Circle())
            Text(album.name)
                .font(.subheadline.weight(.medium))
                .foregroundStyle(.primary)
                .lineLimit(1)
            if isMoving {
                ProgressView().controlSize(.small)
            }
        }
        .padding(.leading, Spacing.xs)
        .padding(.trailing, Spacing.md)
        .padding(.vertical, Spacing.xs)
        .background(.thinMaterial, in: Capsule())
        .opacity(isMoving ? 0.6 : 1)
        .contentShape(Capsule())
        .albumDropTarget(into: album.id, viewModel: viewModel, shape: Capsule())
        .albumDraggable(album, viewModel: viewModel, previewShape: Capsule())
        .task(id: album.id) { await viewModel.loadPreviewIfNeeded(for: album) }
    }
}
