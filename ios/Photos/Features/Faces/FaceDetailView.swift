import SwiftUI

struct FaceDetailView: View {
    let face: Face
    @State private var assets: [Asset] = []
    @State private var selectedAsset: Asset?
    @State private var showRenameAlert = false
    @State private var editedName: String = ""
    @State private var personName: String?

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
        .navigationTitle(personName ?? "Unbenannt")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button("Umbenennen") {
                    editedName = personName ?? ""
                    showRenameAlert = true
                }
            }
        }
        .alert("Name der Person", isPresented: $showRenameAlert) {
            TextField("Name", text: $editedName)
            Button("Abbrechen", role: .cancel) {}
            Button("Speichern") { Task { await rename() } }
        }
        .task {
            personName = face.personName
            await load()
        }
        .fullScreenCover(item: $selectedAsset) { asset in
            PhotoViewerView(assets: assets, initialAsset: asset)
        }
    }

    private func load() async {
        struct Response: Decodable { let assets: [Asset] }
        let response: Response? = try? await APIClient.shared.request("/faces/\(face.id)/assets")
        assets = response?.assets ?? []
    }

    private func rename() async {
        guard !editedName.trimmingCharacters(in: .whitespaces).isEmpty else { return }
        struct Body: Encodable { let personName: String }
        if (try? await APIClient.shared.request(
            "/faces/\(face.id)", method: "PUT", body: Body(personName: editedName)
        ) as Face) != nil {
            personName = editedName
        }
    }
}
