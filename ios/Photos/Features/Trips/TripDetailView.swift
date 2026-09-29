import MapKit
import SwiftUI

struct TripDetailView: View {
    let trip: Trip

    @State private var assets: [Asset] = []
    @State private var nextCursor: String?
    @State private var isLoading = true
    @State private var isLoadingMore = false
    @State private var isEditing = false
    @State private var editName = ""
    @State private var currentTrip: Trip

    init(trip: Trip) {
        self.trip = trip
        _currentTrip = State(initialValue: trip)
        _editName = State(initialValue: trip.name)
    }

    private let columns = [GridItem(.adaptive(minimum: 100), spacing: 2)]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                // Map / location card
                if let lat = currentTrip.centerLat, let lon = currentTrip.centerLon {
                    mapCard(lat: lat, lon: lon)
                }

                // Date range + count
                VStack(alignment: .leading, spacing: 4) {
                    Text(dateRange)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                    Text("\(currentTrip.count.assets) Fotos")
                        .font(.caption)
                        .foregroundStyle(.tertiary)
                }
                .padding(.horizontal)

                // Photo grid
                LazyVGrid(columns: columns, spacing: 2) {
                    ForEach(assets) { asset in
                        TripPhotoCell(asset: asset, allAssets: assets)
                    }
                }

                if nextCursor != nil {
                    Button {
                        Task { await loadMore() }
                    } label: {
                        if isLoadingMore { ProgressView() } else { Text("Mehr laden") }
                    }
                    .frame(maxWidth: .infinity)
                    .padding()
                }
            }
        }
        .navigationTitle(currentTrip.name)
        .navigationBarTitleDisplayMode(.large)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button { isEditing = true } label: {
                    Label("Umbenennen", systemImage: "pencil")
                }
            }
        }
        .alert("Reise umbenennen", isPresented: $isEditing) {
            TextField("Name", text: $editName)
            Button("Speichern") { Task { await saveName() } }
            Button("Abbrechen", role: .cancel) { editName = currentTrip.name }
        }
        .task { await loadAssets() }
    }

    private func mapCard(lat: Double, lon: Double) -> some View {
        let coordinate = CLLocationCoordinate2D(latitude: lat, longitude: lon)
        return Map(position: .constant(.region(
            MKCoordinateRegion(center: coordinate, latitudinalMeters: 150_000, longitudinalMeters: 150_000)
        ))) {
            Marker(currentTrip.name, coordinate: coordinate)
        }
        .allowsHitTesting(false)
        .frame(height: 200)
        .clipShape(RoundedRectangle(cornerRadius: 0))
    }

    private var dateRange: String {
        let fmt = DateFormatter()
        fmt.locale = Locale(identifier: "de_DE")
        fmt.dateStyle = .long
        fmt.timeStyle = .none
        let s = fmt.string(from: currentTrip.startDate)
        let e = fmt.string(from: currentTrip.endDate)
        return s == e ? s : "\(s) – \(e)"
    }

    private func loadAssets() async {
        isLoading = true
        let result: TripDetailResponse? = try? await APIClient.shared.request("/trips/\(currentTrip.id)")
        assets = result?.assets ?? []
        nextCursor = result?.nextCursor
        isLoading = false
    }

    private func loadMore() async {
        guard let cursor = nextCursor else { return }
        isLoadingMore = true
        let result: TripDetailResponse? = try? await APIClient.shared.request(
            "/trips/\(currentTrip.id)?cursor=\(cursor)"
        )
        assets += result?.assets ?? []
        nextCursor = result?.nextCursor
        isLoadingMore = false
    }

    private func saveName() async {
        struct Body: Encodable { let name: String }
        guard let updated: Trip = try? await APIClient.shared.request(
            "/trips/\(currentTrip.id)", method: "PATCH", body: Body(name: editName)
        ) else { return }
        currentTrip = updated
    }
}

private struct TripPhotoCell: View {
    let asset: Asset
    let allAssets: [Asset]

    var body: some View {
        NavigationLink(destination: PhotoViewerView(assets: allAssets, initialAsset: asset)) {
            AsyncImage(url: APIClient.thumbnailURL(for: asset)) { phase in
                if let img = phase.image {
                    img.resizable().scaledToFill()
                } else {
                    Color(.systemGray5)
                }
            }
            .aspectRatio(1, contentMode: .fill)
            .clipped()
        }
        .buttonStyle(.plain)
    }
}
