import MapKit
import SwiftUI

private struct MapPoint: Decodable, Identifiable, Hashable {
    let id: String
    let latitude: Double
    let longitude: Double
    let takenAt: Date?

    var coordinate: CLLocationCoordinate2D { .init(latitude: latitude, longitude: longitude) }
}

private struct MapResponse: Decodable {
    let points: [MapPoint]
}

/// One pin on the map: a single photo or several close-together ones.
private struct PhotoCluster: Identifiable {
    let id: String
    /// Newest first; the first one is the pin's thumbnail.
    let points: [MapPoint]
    let coordinate: CLLocationCoordinate2D
}

private struct MapSelection: Identifiable {
    let points: [MapPoint]
    var id: String { points.map(\.id).joined(separator: ",") }
}

/// All photos with GPS data (`GET /assets/map`) as thumbnail pins. Nearby
/// pins merge into one with a count badge, recomputed for every zoom level
/// (SwiftUI's `Map` has no built-in clustering, so it's done here on a
/// screen-space grid). Tapping a pin opens a preview sheet; tapping a photo
/// there opens the regular viewer.
struct PhotoMapView: View {
    @Environment(\.dismiss) private var dismiss

    @State private var points: [MapPoint] = []
    @State private var hasLoaded = false
    @State private var errorMessage: String?

    @State private var position: MapCameraPosition = .automatic
    @State private var region: MKCoordinateRegion?
    @State private var mapSize: CGSize = .zero
    @State private var clusters: [PhotoCluster] = []
    @State private var selection: MapSelection?
    @State private var usesSatellite = false

    /// Pins closer than this (in points) are merged.
    private let clusterDistance: CGFloat = 60

    var body: some View {
        Map(position: $position) {
            ForEach(clusters) { cluster in
                Annotation("", coordinate: cluster.coordinate, anchor: .bottom) {
                    Button {
                        selection = MapSelection(points: cluster.points)
                    } label: {
                        PhotoPin(point: cluster.points[0], count: cluster.points.count)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(cluster.points.count == 1 ? "Foto" : "\(cluster.points.count) Fotos")
                }
                .annotationTitles(.hidden)
            }
        }
        .mapStyle(usesSatellite ? .hybrid(elevation: .realistic) : .standard(elevation: .realistic))
        .mapControls {
            MapCompass()
            MapScaleView()
            MapPitchToggle()
        }
        .onMapCameraChange(frequency: .onEnd) { context in
            region = context.region
            recluster()
        }
        .onGeometryChange(for: CGSize.self) { $0.size } action: { size in
            mapSize = size
            recluster()
        }
        .navigationTitle("Karte")
        .navigationBarTitleDisplayMode(.inline)
        // Map extends edge-to-edge in iOS 26 and would otherwise hide the back button.
        .toolbarBackground(.regularMaterial, for: .navigationBar)
        .toolbarBackground(.visible, for: .navigationBar)
        .navigationBarBackButtonHidden(true)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Button { dismiss() } label: {
                    Image(systemName: "chevron.left")
                        .fontWeight(.semibold)
                }
            }
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Picker("Kartenstil", selection: $usesSatellite) {
                        Label("Standard", systemImage: "map").tag(false)
                        Label("Satellit", systemImage: "globe.europe.africa").tag(true)
                    }
                    Button("Alle Fotos zeigen", systemImage: "arrow.up.left.and.arrow.down.right") {
                        withAnimation { position = .automatic }
                    }
                    .disabled(points.isEmpty)
                } label: {
                    Image(systemName: "ellipsis")
                }
                .accessibilityLabel("Kartenoptionen")
            }
        }
        .overlay(alignment: .bottom) {
            if hasLoaded, points.isEmpty {
                emptyCard
            }
        }
        .overlay {
            if !hasLoaded {
                ZStack {
                    Color.clear
                    ProgressView()
                        .padding(Spacing.md)
                        .glassEffect(.regular, in: RoundedRectangle(cornerRadius: Radius.md))
                }
            }
        }
        .task { if !hasLoaded { await load() } }
        .onChange(of: AssetChanges.shared.libraryVersion) {
            // A photo was trashed / deleted from the preview's viewer.
            Task { await load() }
        }
        .sheet(item: $selection) { selection in
            MapPreviewSheet(points: selection.points)
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
        }
    }

    private var emptyCard: some View {
        VStack(spacing: Spacing.xs) {
            Label(
                errorMessage == nil ? "Keine Fotos mit Ortsangabe" : "Karte konnte nicht geladen werden",
                systemImage: errorMessage == nil ? "mappin.slash" : "exclamationmark.triangle"
            )
            .font(.headline)
            Text(errorMessage ?? "Fotos erscheinen hier, sobald sie GPS-Daten enthalten – z. B. iPhone-Fotos mit aktivierten Ortungsdiensten für die Kamera.")
                .font(.footnote)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .padding(Spacing.md)
        .frame(maxWidth: .infinity)
        .glassEffect(.regular, in: RoundedRectangle(cornerRadius: Radius.lg))
        .padding(Spacing.md)
    }

    private func load() async {
        do {
            let response: MapResponse = try await APIClient.shared.request("/assets/map")
            points = response.points.sorted { ($0.takenAt ?? .distantPast) > ($1.takenAt ?? .distantPast) }
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
        hasLoaded = true
        recluster()
    }

    /// Buckets points into a grid of ~`clusterDistance`-sized screen cells
    /// for the current region. Before the first camera update every photo
    /// gets its own pin.
    private func recluster() {
        guard let region, mapSize.width > 0, mapSize.height > 0 else {
            clusters = points.map { PhotoCluster(id: $0.id, points: [$0], coordinate: $0.coordinate) }
            return
        }
        let cellLatitude = max(region.span.latitudeDelta * clusterDistance / mapSize.height, 1e-7)
        let cellLongitude = max(region.span.longitudeDelta * clusterDistance / mapSize.width, 1e-7)

        struct Cell: Hashable { let x: Int; let y: Int }
        var buckets: [Cell: [MapPoint]] = [:]
        var order: [Cell] = []
        for point in points {
            let cell = Cell(
                x: Int((point.longitude / cellLongitude).rounded(.down)),
                y: Int((point.latitude / cellLatitude).rounded(.down))
            )
            if buckets[cell] == nil { order.append(cell) }
            buckets[cell, default: []].append(point)
        }

        clusters = order.compactMap { cell in
            guard let members = buckets[cell], let first = members.first else { return nil }
            let latitude = members.map(\.latitude).reduce(0, +) / Double(members.count)
            let longitude = members.map(\.longitude).reduce(0, +) / Double(members.count)
            return PhotoCluster(
                id: members.count == 1 ? first.id : "\(first.id)+\(members.count)",
                points: members,
                coordinate: .init(latitude: latitude, longitude: longitude)
            )
        }
    }
}

/// Rounded thumbnail pin with a white frame and, for clusters, a count.
private struct PhotoPin: View {
    let point: MapPoint
    let count: Int

    var body: some View {
        CachedThumbnail(assetId: point.id, url: APIClient.imageURL(path: "/assets/\(point.id)/thumbnail"))
            .frame(width: 52, height: 52)
            .clipShape(RoundedRectangle(cornerRadius: 10))
            .padding(2.5)
            .background(.white, in: RoundedRectangle(cornerRadius: 12))
            .shadow(color: .black.opacity(0.3), radius: 4, y: 2)
            .overlay(alignment: .topTrailing) {
                if count > 1 {
                    Text(count, format: .number)
                        .font(.caption2.bold())
                        .monospacedDigit()
                        .foregroundStyle(.white)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(Color.accentColor, in: Capsule())
                        .offset(x: 8, y: -8)
                }
            }
            .padding(.bottom, 4)
    }
}

/// Bottom sheet for a tapped pin: one large preview or a grid for a
/// cluster. Map points only carry id/coordinates, so the full assets (needed
/// by the viewer) are fetched here.
private struct MapPreviewSheet: View {
    let points: [MapPoint]

    @State private var assets: [String: Asset] = [:]
    @State private var viewerSelection: Asset?

    private let columns = [GridItem(.adaptive(minimum: 96), spacing: 2)]

    /// In map order, only those already loaded.
    private var loadedAssets: [Asset] { points.compactMap { assets[$0.id] } }

    var body: some View {
        NavigationStack {
            Group {
                if points.count == 1, let point = points.first {
                    single(point)
                } else {
                    grid
                }
            }
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
        }
        .task { await loadAssets() }
        .fullScreenCover(item: $viewerSelection) { asset in
            PhotoViewerView(assets: loadedAssets, initialAsset: asset)
        }
    }

    private var title: String {
        if points.count == 1 {
            return points[0].takenAt?.formatted(date: .long, time: .omitted) ?? "Foto"
        }
        return "\(points.count) Fotos"
    }

    private func single(_ point: MapPoint) -> some View {
        VStack(spacing: Spacing.md) {
            Button { open(point) } label: {
                CachedThumbnail(assetId: point.id, url: APIClient.imageURL(path: "/assets/\(point.id)/thumbnail"))
                    .aspectRatio(contentMode: .fit)
                    .frame(maxWidth: .infinity, maxHeight: 360)
                    .clipShape(RoundedRectangle(cornerRadius: Radius.md))
            }
            .buttonStyle(.plain)

            if let takenAt = point.takenAt {
                Text(takenAt.formatted(date: .complete, time: .shortened))
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }

            Button {
                open(point)
            } label: {
                Label("Foto öffnen", systemImage: "arrow.up.left.and.arrow.down.right")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.glassProminent)
            .disabled(assets[point.id] == nil)

            Spacer(minLength: 0)
        }
        .padding(Spacing.md)
    }

    private var grid: some View {
        ScrollView {
            LazyVGrid(columns: columns, spacing: 2) {
                ForEach(points) { point in
                    Button { open(point) } label: {
                        Color.clear
                            .aspectRatio(1, contentMode: .fit)
                            .overlay {
                                CachedThumbnail(assetId: point.id, url: APIClient.imageURL(path: "/assets/\(point.id)/thumbnail"))
                            }
                            .clipped()
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private func open(_ point: MapPoint) {
        guard let asset = assets[point.id] else { return }
        viewerSelection = asset
    }

    private func loadAssets() async {
        await withTaskGroup(of: Asset?.self) { group in
            for point in points.prefix(300) {
                group.addTask {
                    try? await APIClient.shared.request("/assets/\(point.id)") as Asset
                }
            }
            for await asset in group {
                if let asset { assets[asset.id] = asset }
            }
        }
    }
}
