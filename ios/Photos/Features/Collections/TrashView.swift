import SwiftUI

/// An `Asset` plus the trash timestamp, decoded from the same JSON object
/// (`Asset` itself doesn't carry `deletedAt`).
private struct TrashedAsset: Decodable, Identifiable {
    let asset: Asset
    let deletedAt: Date?
    var id: String { asset.id }

    private enum CodingKeys: String, CodingKey { case deletedAt }

    init(from decoder: any Decoder) throws {
        asset = try Asset(from: decoder)
        deletedAt = try decoder.container(keyedBy: CodingKeys.self).decodeIfPresent(Date.self, forKey: .deletedAt)
    }

    /// Days until the backend's 30-day purge removes it for good.
    var daysLeft: Int? {
        guard let deletedAt else { return nil }
        let expiry = deletedAt.addingTimeInterval(TimeInterval(TrashView.retentionDays) * 86_400)
        return max(0, Int((expiry.timeIntervalSinceNow / 86_400).rounded(.up)))
    }
}

private struct TrashPage: Decodable {
    let assets: [TrashedAsset]
    let nextCursor: String?
}

/// "Zuletzt gelöscht": `DELETE /assets/:id` only moves photos here. Swipe
/// right to restore, swipe left to delete forever (with confirmation).
struct TrashView: View {
    nonisolated static let retentionDays = 30

    @State private var items: [TrashedAsset] = []
    @State private var nextCursor: String?
    @State private var isLoading = false
    @State private var hasLoaded = false

    @State private var pendingDelete: TrashedAsset?
    @State private var confirmEmptyTrash = false
    @State private var confirmRestoreAll = false
    @State private var isWorking = false
    @State private var errorMessage: String?
    @State private var previewAsset: Asset?

    var body: some View {
        List {
            if !items.isEmpty {
                Section {
                    ForEach(items) { item in
                        row(item)
                            .onAppear { if item.id == items.last?.id { Task { await loadMore() } } }
                    }
                } footer: {
                    Text("Fotos im Papierkorb werden nach \(Self.retentionDays) Tagen automatisch endgültig gelöscht. Nach rechts wischen zum Wiederherstellen, nach links zum endgültigen Löschen.")
                }
            }
            if isLoading && hasLoaded {
                ProgressView().frame(maxWidth: .infinity)
            }
        }
        .navigationTitle("Papierkorb")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Button("Alle wiederherstellen", systemImage: "arrow.uturn.backward") { confirmRestoreAll = true }
                    Button("Papierkorb leeren", systemImage: "trash.slash", role: .destructive) { confirmEmptyTrash = true }
                } label: {
                    Image(systemName: "ellipsis")
                }
                .disabled(items.isEmpty || isWorking)
                .accessibilityLabel("Weitere Aktionen")
            }
        }
        .overlay {
            if !hasLoaded {
                ProgressView()
            } else if items.isEmpty {
                ContentUnavailableView(
                    "Papierkorb ist leer",
                    systemImage: "trash",
                    description: Text("Gelöschte Fotos bleiben hier \(Self.retentionDays) Tage, bevor sie endgültig entfernt werden.")
                )
            }
        }
        .overlay {
            if isWorking {
                ProgressView()
                    .padding(Spacing.lg)
                    .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: Radius.md))
            }
        }
        .task { if !hasLoaded { await reload() } }
        .refreshable { await reload() }
        .fullScreenCover(item: $previewAsset) { asset in
            PhotoViewerView(assets: items.map(\.asset), initialAsset: asset, showsLibraryActions: false)
        }
        .alert("Endgültig löschen?", isPresented: Binding(
            get: { pendingDelete != nil },
            set: { if !$0 { pendingDelete = nil } }
        ), presenting: pendingDelete) { item in
            Button("Endgültig löschen", role: .destructive) { Task { await deletePermanently([item]) } }
            Button("Abbrechen", role: .cancel) {}
        } message: { item in
            Text("„\(item.asset.filename)“ wird unwiderruflich vom Server gelöscht. Das kann nicht rückgängig gemacht werden.")
        }
        .alert("Papierkorb leeren?", isPresented: $confirmEmptyTrash) {
            Button("Alle endgültig löschen", role: .destructive) { Task { await emptyTrash() } }
            Button("Abbrechen", role: .cancel) {}
        } message: {
            Text("Alle Fotos im Papierkorb werden unwiderruflich gelöscht. Das kann nicht rückgängig gemacht werden.")
        }
        .confirmationDialog("Alle Fotos wiederherstellen?", isPresented: $confirmRestoreAll, titleVisibility: .visible) {
            Button("Alle wiederherstellen") { Task { await restoreAll() } }
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

    private func row(_ item: TrashedAsset) -> some View {
        Button { previewAsset = item.asset } label: {
            HStack(spacing: Spacing.md) {
                CachedThumbnail(assetId: item.asset.id, url: APIClient.thumbnailURL(for: item.asset))
                    .frame(width: 60, height: 60)
                    .clipShape(RoundedRectangle(cornerRadius: Radius.sm))
                    .overlay(alignment: .bottomTrailing) {
                        if item.asset.isVideo {
                            Image(systemName: "video.fill")
                                .font(.caption2)
                                .foregroundStyle(.white)
                                .padding(3)
                                .shadow(radius: 2)
                        }
                    }

                VStack(alignment: .leading, spacing: 2) {
                    Text(item.asset.filename)
                        .font(.subheadline)
                        .lineLimit(1)
                        .truncationMode(.middle)
                    if let deletedAt = item.deletedAt {
                        Text("Gelöscht \(deletedAt.formatted(.relative(presentation: .named)))")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    if let daysLeft = item.daysLeft {
                        Text(daysLeft == 1 ? "Noch 1 Tag" : "Noch \(daysLeft) Tage")
                            .font(.caption2)
                            .foregroundStyle(daysLeft <= 3 ? .red : .secondary)
                    }
                }
            }
        }
        .foregroundStyle(.primary)
        .swipeActions(edge: .leading) {
            Button { Task { await restore([item]) } } label: {
                Label("Wiederherstellen", systemImage: "arrow.uturn.backward")
            }
            .tint(.green)
        }
        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
            // Not role: .destructive - that would animate the row away
            // before the confirmation alert has been answered.
            Button { pendingDelete = item } label: {
                Label("Endgültig löschen", systemImage: "trash.slash")
            }
            .tint(.red)
        }
        .contextMenu {
            Button("Wiederherstellen", systemImage: "arrow.uturn.backward") { Task { await restore([item]) } }
            Button("Endgültig löschen", systemImage: "trash.slash", role: .destructive) { pendingDelete = item }
        }
    }

    // MARK: - Networking

    private func reload() async {
        nextCursor = nil
        await fetchPage(replacing: true)
    }

    private func loadMore() async {
        guard nextCursor != nil else { return }
        await fetchPage(replacing: false)
    }

    private func fetchPage(replacing: Bool) async {
        guard !isLoading else { return }
        isLoading = true
        defer {
            isLoading = false
            hasLoaded = true
        }
        let cursor = replacing ? nil : nextCursor
        let path = "/assets?trashed=true&limit=100" + (cursor.map { "&cursor=\($0)" } ?? "")
        do {
            let page: TrashPage = try await APIClient.shared.request(path)
            if replacing {
                items = page.assets
            } else {
                items.append(contentsOf: page.assets)
            }
            nextCursor = page.nextCursor
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func restore(_ targets: [TrashedAsset]) async {
        await perform(targets) { try await AssetChanges.shared.restoreFromTrash($0.id) }
    }

    private func deletePermanently(_ targets: [TrashedAsset]) async {
        await perform(targets) { try await AssetChanges.shared.deletePermanently($0.id) }
    }

    /// Runs `action` per item, removing each from the list as it succeeds.
    private func perform(_ targets: [TrashedAsset], action: (TrashedAsset) async throws -> Void) async {
        isWorking = targets.count > 1
        defer { isWorking = false }
        var failures = 0
        for item in targets {
            do {
                try await action(item)
                withAnimation { items.removeAll { $0.id == item.id } }
            } catch {
                failures += 1
                if targets.count == 1 { errorMessage = error.localizedDescription }
            }
        }
        if failures > 0, targets.count > 1 {
            errorMessage = "\(failures) von \(targets.count) Fotos konnten nicht verarbeitet werden."
        }
        if items.isEmpty, nextCursor != nil { await reload() }
    }

    /// Everything in the trash, not just the pages loaded so far.
    private func allTrashed() async -> [TrashedAsset] {
        while nextCursor != nil {
            let before = items.count
            await loadMore()
            if items.count == before { break }
        }
        return items
    }

    private func emptyTrash() async {
        isWorking = true
        await deletePermanently(await allTrashed())
    }

    private func restoreAll() async {
        isWorking = true
        await restore(await allTrashed())
    }
}
