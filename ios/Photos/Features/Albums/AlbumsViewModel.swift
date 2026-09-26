import Foundation

@MainActor
final class AlbumsViewModel: ObservableObject {
    @Published var rootAlbums: [Album] = []
    @Published var errorMessage: String?

    private var allAlbums: [Album] = []

    func load() async {
        do {
            allAlbums = try await APIClient.shared.request("/albums")
            rootAlbums = allAlbums.filter { $0.parentId == nil }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func children(of albumId: String) -> [Album] {
        allAlbums.filter { $0.parentId == albumId }
    }

    func createAlbum(name: String, parentId: String?) async {
        struct Body: Encodable { let name: String; let parentId: String? }
        do {
            let created: Album = try await APIClient.shared.request(
                "/albums", method: "POST", body: Body(name: name, parentId: parentId)
            )
            allAlbums.append(created)
            if parentId == nil { rootAlbums.append(created) }
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
