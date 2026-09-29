import SwiftUI

private struct DuplicateAsset: Codable, Identifiable {
    let id: String
    let filename: String
    let path: String
    let size: Int?
    let takenAt: Date?
    let uploadedAt: Date
}

private struct DuplicateGroup: Codable, Identifiable {
    let hash: String
    let assets: [DuplicateAsset]
    var id: String { hash }
}

private struct DuplicatesResponse: Decodable {
    let groups: [DuplicateGroup]
}

/// Perceptual-hash based near-duplicate detection (spec: "User kann
/// Duplikate sehen und eine Datei löschen") - not byte-identical files, but
/// the same photo re-encoded/resized, e.g. from repeated iCloud downloads.
struct DuplicatesView: View {
    @State private var groups: [DuplicateGroup] = []
    @State private var isLoading = true

    private let columns = [GridItem(.adaptive(minimum: 100), spacing: Spacing.sm)]

    var body: some View {
        ScrollView {
            if groups.isEmpty && !isLoading {
                ContentUnavailableView("Keine Duplikate gefunden", systemImage: "checkmark.circle")
                    .padding(.top, Spacing.xl)
            }

            LazyVStack(alignment: .leading, spacing: Spacing.lg) {
                ForEach(groups) { group in
                    LazyVGrid(columns: columns, spacing: Spacing.sm) {
                        ForEach(group.assets) { asset in
                            VStack(spacing: 4) {
                                CachedThumbnail(assetId: asset.id, url: thumbnailURL(asset))
                                    .aspectRatio(1, contentMode: .fill)
                                    .clipShape(RoundedRectangle(cornerRadius: Radius.sm))

                                Button("In den Papierkorb", role: .destructive) {
                                    Task { await delete(asset.id) }
                                }
                                .font(.caption)
                            }
                        }
                    }
                    Divider()
                }
            }
            .padding(Spacing.md)
        }
        .navigationTitle("Duplikate")
        .task { await load() }
    }

    private func thumbnailURL(_ asset: DuplicateAsset) -> URL? {
        APIClient.imageURL(path: "/assets/\(asset.id)/thumbnail")
    }

    private func load() async {
        isLoading = true
        defer { isLoading = false }
        let response: DuplicatesResponse? = try? await APIClient.shared.request("/assets/duplicates")
        groups = response?.groups ?? []
    }

    private func delete(_ assetId: String) async {
        // DELETE only moves to the trash now (restorable for 30 days).
        try? await AssetChanges.shared.moveToTrash(assetId)
        await load()
    }
}
