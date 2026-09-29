import SwiftUI

enum SmartCollection: String, CaseIterable, Identifiable {
    case videos = "Videos"
    case selfies = "Selfies"
    case screenshots = "Screenshots"

    var id: String { rawValue }
    var systemImage: String {
        switch self {
        case .videos: return "video"
        case .selfies: return "person.crop.square"
        case .screenshots: return "camera.viewfinder"
        }
    }

    var mimeTypeFilter: String? {
        switch self {
        case .videos: return "video/"
        case .selfies, .screenshots: return nil
        }
    }
}

/// Auto-detected buckets, e.g. "Videos"/"Selfies"/"Screenshots" smart albums.
/// Screenshots are detected by filename convention since the backend doesn't
/// track PHAssetMediaSubtype (that's an on-device-only concept) - "IMG_" vs
/// "Screenshot" is what iOS itself names them. Selfies are detected from the
/// EXIF lens model: iPhones label the front camera's lens "... front camera
/// ..." distinctly from the rear lenses.
/// Non-filter destinations listed alongside the smart albums.
enum LibraryDestination: String, Hashable, CaseIterable {
    case memories, map, archive, trash

    var title: String {
        switch self {
        case .memories: return "Erinnerungen"
        case .map: return "Karte"
        case .archive: return "Archiv"
        case .trash: return "Papierkorb"
        }
    }

    var systemImage: String {
        switch self {
        case .memories: return "clock.arrow.circlepath"
        case .map: return "map"
        case .archive: return "archivebox"
        case .trash: return "trash"
        }
    }

    var subtitle: String {
        switch self {
        case .memories: return "Heute vor einem oder mehr Jahren"
        case .map: return "Fotos nach Aufnahmeort"
        case .archive: return "Aus der Mediathek ausgeblendet"
        case .trash: return "Wird nach 30 Tagen endgültig gelöscht"
        }
    }
}

struct CollectionsView: View {
    var body: some View {
        List {
            Section("Rückblick") {
                destinationLink(.memories)
                destinationLink(.map)
            }
            Section("Medientypen") {
                ForEach(SmartCollection.allCases) { collection in
                    NavigationLink(value: collection) {
                        Label(collection.rawValue, systemImage: collection.systemImage)
                    }
                }
            }
            Section("Weitere") {
                destinationLink(.archive)
                destinationLink(.trash)
            }
        }
        .navigationDestination(for: SmartCollection.self) { collection in
            CollectionAssetsView(collection: collection)
        }
        .navigationDestination(for: LibraryDestination.self) { destination in
            switch destination {
            case .memories: MemoriesView()
            case .map: PhotoMapView()
            case .archive: ArchiveView()
            case .trash: TrashView()
            }
        }
        .navigationTitle("Sammlungen")
    }

    private func destinationLink(_ destination: LibraryDestination) -> some View {
        NavigationLink(value: destination) {
            Label {
                VStack(alignment: .leading, spacing: 2) {
                    Text(destination.title)
                    Text(destination.subtitle)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            } icon: {
                Image(systemName: destination.systemImage)
            }
        }
    }
}

private struct CollectionAssetsView: View {
    let collection: SmartCollection
    @State private var assets: [Asset] = []
    @State private var selectedAsset: Asset?

    private let columns = [GridItem(.adaptive(minimum: 110), spacing: 2)]

    var body: some View {
        ScrollView {
            LazyVGrid(columns: columns, spacing: 2) {
                ForEach(assets) { asset in
                    Button { selectedAsset = asset } label: {
                        CachedThumbnail(assetId: asset.id, url: APIClient.thumbnailURL(for: asset))
                            .aspectRatio(1, contentMode: .fill)
                            .clipped()
                    }
                }
            }
        }
        .navigationTitle(collection.rawValue)
        .task { await load() }
        .fullScreenCover(item: $selectedAsset, onDismiss: dropHiddenAssets) { asset in
            PhotoViewerView(assets: assets, initialAsset: asset)
        }
        .onChange(of: AssetChanges.shared.libraryVersion) {
            if selectedAsset == nil { dropHiddenAssets() }
        }
        .overlay {
            if assets.isEmpty {
                ContentUnavailableView("Nichts gefunden", systemImage: collection.systemImage)
            }
        }
    }

    private func dropHiddenAssets() {
        let hidden = AssetChanges.shared.hiddenFromLibrary
        assets.removeAll { hidden.contains($0.id) }
    }

    private func load() async {
        do {
            let page: AssetPage
            if let mimeType = collection.mimeTypeFilter {
                page = try await APIClient.shared.request("/assets?mimeType=\(mimeType)&limit=200")
            } else {
                page = try await APIClient.shared.request("/assets?limit=200")
            }
            assets = page.assets.filter { asset in
                switch collection {
                case .videos: return true
                case .screenshots: return asset.filename.lowercased().contains("screenshot")
                case .selfies: return asset.lensModel?.lowercased().contains("front") == true
                }
            }
        } catch {
            assets = []
        }
    }
}
