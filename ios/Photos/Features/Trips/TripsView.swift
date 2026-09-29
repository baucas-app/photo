import SwiftUI

struct TripsView: View {
    @State private var trips: [Trip] = []
    @State private var isLoading = true
    @State private var isRecalculating = false
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            Group {
                if isLoading {
                    ProgressView()
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if trips.isEmpty {
                    emptyState
                } else {
                    tripGrid
                }
            }
            .navigationTitle("Reisen")
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button {
                        Task { await recalculate() }
                    } label: {
                        if isRecalculating {
                            ProgressView().scaleEffect(0.8)
                        } else {
                            Label("Neu berechnen", systemImage: "arrow.clockwise")
                        }
                    }
                    .disabled(isRecalculating)
                }
            }
        }
        .task { await loadTrips() }
    }

    private var tripGrid: some View {
        ScrollView {
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 160), spacing: 12)], spacing: 12) {
                ForEach(trips) { trip in
                    NavigationLink(destination: TripDetailView(trip: trip)) {
                        TripCard(trip: trip)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding()
        }
    }

    private var emptyState: some View {
        VStack(spacing: 12) {
            Image(systemName: "map")
                .font(.system(size: 48))
                .foregroundStyle(.secondary)
            Text("Noch keine Reisen")
                .font(.headline)
            Text("Tippe auf ↺ um Fotos mit GPS automatisch zu gruppieren.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func loadTrips() async {
        isLoading = true
        trips = (try? await APIClient.shared.request("/trips")) ?? []
        isLoading = false
    }

    private func recalculate() async {
        isRecalculating = true
        struct Result: Decodable { let trips: Int }
        _ = try? await APIClient.shared.requestVoid("/trips/recalculate", method: "POST")
        await loadTrips()
        isRecalculating = false
    }
}

struct TripCard: View {
    let trip: Trip

    private var dateRange: String {
        let fmt = DateFormatter()
        fmt.locale = Locale(identifier: "de_DE")
        fmt.dateStyle = .medium
        fmt.timeStyle = .none
        let start = fmt.string(from: trip.startDate)
        let end = fmt.string(from: trip.endDate)
        return start == end ? start : "\(start) – \(end)"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Cover photo
            ZStack {
                Color(.systemGray5)
                if let id = trip.coverAssetId, let url = APIClient.imageURL(path: "/assets/\(id)/thumbnail") {
                    AsyncImage(url: url) { phase in
                        if let img = phase.image {
                            img.resizable().scaledToFill()
                        } else {
                            Color(.systemGray5)
                        }
                    }
                } else {
                    Image(systemName: "map")
                        .font(.system(size: 28))
                        .foregroundStyle(.secondary)
                }
            }
            .frame(height: 120)
            .clipped()

            VStack(alignment: .leading, spacing: 4) {
                Text(trip.name)
                    .font(.subheadline.weight(.semibold))
                    .lineLimit(1)

                Text(dateRange)
                    .font(.caption)
                    .foregroundStyle(.secondary)

                HStack(spacing: 4) {
                    Text("\(trip.count.assets) Fotos")
                    if let loc = trip.locationName {
                        Text("· \(loc)")
                    }
                }
                .font(.caption2)
                .foregroundStyle(.tertiary)
            }
            .padding(10)
        }
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    }
}
