import SwiftUI

private struct Memory: Decodable, Identifiable {
    let year: Int
    let yearsAgo: Int
    var assets: [Asset]
    var id: Int { year }

    var title: String { yearsAgo == 1 ? "Vor einem Jahr" : "Vor \(yearsAgo) Jahren" }
}

private struct MemoriesResponse: Decodable {
    let memories: [Memory]
}

/// What the viewer is opened with: one year's photos, starting at `asset`.
private struct MemorySelection: Identifiable {
    let assets: [Asset]
    let asset: Asset
    var id: String { asset.id }
}

/// "An diesem Tag": photos taken on today's date in earlier years
/// (`GET /assets/memories`), one horizontal row per year, newest first.
struct MemoriesView: View {
    @State private var memories: [Memory] = []
    @State private var hasLoaded = false
    @State private var errorMessage: String?
    @State private var selection: MemorySelection?

    private var todayTitle: String {
        Date.now.formatted(.dateTime.day().month(.wide))
    }

    var body: some View {
        ScrollView {
            if !memories.isEmpty {
                LazyVStack(alignment: .leading, spacing: Spacing.xl) {
                    Text("An diesem Tag · \(todayTitle)")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .padding(.horizontal, Spacing.md)

                    ForEach(memories) { memory in
                        section(memory)
                    }
                }
                .padding(.vertical, Spacing.md)
            }
        }
        .navigationTitle("Erinnerungen")
        .task { if !hasLoaded { await load() } }
        .refreshable { await load() }
        .fullScreenCover(item: $selection, onDismiss: dropHiddenAssets) { selection in
            PhotoViewerView(assets: selection.assets, initialAsset: selection.asset)
        }
        .overlay {
            if !hasLoaded {
                ProgressView()
            } else if let errorMessage, memories.isEmpty {
                ContentUnavailableView(
                    "Erinnerungen konnten nicht geladen werden",
                    systemImage: "exclamationmark.triangle",
                    description: Text(errorMessage)
                )
            } else if memories.isEmpty {
                ContentUnavailableView(
                    "Keine Erinnerungen für heute",
                    systemImage: "clock.arrow.circlepath",
                    description: Text("Hier erscheinen Fotos, die an einem \(todayTitle) in früheren Jahren aufgenommen wurden.")
                )
            }
        }
    }

    private func section(_ memory: Memory) -> some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            VStack(alignment: .leading, spacing: 2) {
                Text(memory.title)
                    .font(.title2.bold())
                Text(subtitle(memory))
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            .padding(.horizontal, Spacing.md)

            ScrollView(.horizontal, showsIndicators: false) {
                LazyHStack(spacing: Spacing.sm) {
                    ForEach(memory.assets) { asset in
                        Button {
                            selection = MemorySelection(assets: memory.assets, asset: asset)
                        } label: {
                            tile(asset, isHero: asset.id == memory.assets.first?.id)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .scrollTargetLayout()
            }
            .contentMargins(.horizontal, Spacing.md, for: .scrollContent)
            .scrollTargetBehavior(.viewAligned)
        }
    }

    /// The first photo of each year is shown larger, like a cover.
    private func tile(_ asset: Asset, isHero: Bool) -> some View {
        Color.clear
            .frame(width: isHero ? 240 : 150, height: 220)
            .overlay { TimelineThumbnail(asset: asset) }
            .clipShape(RoundedRectangle(cornerRadius: Radius.md))
            .overlay(alignment: .bottomLeading) {
                if asset.isVideo {
                    Image(systemName: "play.fill")
                        .font(.caption)
                        .foregroundStyle(.white)
                        .padding(Spacing.sm)
                        .shadow(radius: 3)
                }
            }
            .accessibilityLabel(asset.takenAt.map { "Foto vom \($0.formatted(date: .long, time: .shortened))" } ?? asset.filename)
    }

    private func subtitle(_ memory: Memory) -> String {
        let count = memory.assets.count
        let items = count == 1 ? "1 Foto" : "\(count) Fotos"
        let date = memory.assets.first?.takenAt?.formatted(.dateTime.day().month(.wide).year()) ?? String(memory.year)
        return "\(date) · \(items)"
    }

    private func load() async {
        do {
            let response: MemoriesResponse = try await APIClient.shared.request("/assets/memories")
            memories = response.memories
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
        hasLoaded = true
    }

    /// Photos archived / trashed from the viewer leave the memories too.
    private func dropHiddenAssets() {
        let hidden = AssetChanges.shared.hiddenFromLibrary
        for index in memories.indices {
            memories[index].assets.removeAll { hidden.contains($0.id) }
        }
        memories.removeAll { $0.assets.isEmpty }
    }
}
