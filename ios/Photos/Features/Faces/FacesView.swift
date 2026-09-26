import SwiftUI

struct FacesView: View {
    @State private var faces: [Face] = []

    private let columns = [GridItem(.adaptive(minimum: 100), spacing: Spacing.md)]

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVGrid(columns: columns, spacing: Spacing.md) {
                    ForEach(faces) { face in
                        NavigationLink(value: face) {
                            VStack {
                                CachedThumbnail(
                                    assetId: face.sampleAsset?.id ?? face.id,
                                    url: face.sampleAsset.flatMap { APIClient.thumbnailURL(for: $0) }
                                )
                                .frame(width: 88, height: 88)
                                .clipShape(Circle())

                                Text(face.personName ?? "Unbenannt").font(.footnote)
                                Text("\(face.assetCount) Fotos").font(.caption2).foregroundStyle(.secondary)
                            }
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(Spacing.md)
            }
            .navigationDestination(for: Face.self) { face in
                FaceDetailView(face: face)
            }
            .navigationTitle("Personen")
            .task { await load() }
            .overlay {
                if faces.isEmpty {
                    ContentUnavailableView("Noch keine Personen erkannt", systemImage: "person.crop.circle")
                }
            }
        }
    }

    private func load() async {
        faces = (try? await APIClient.shared.request("/faces")) ?? []
    }
}
