import SwiftUI

struct SharingView: View {
    @State private var links: [SharedLink] = []
    @State private var albums: [Album] = []
    @State private var selectedAlbumId: String?
    @State private var password = ""
    @State private var errorMessage: String?

    /// Lets the album context menu's "Freigeben" jump straight into this
    /// flow with the right album already picked, instead of making the user
    /// find it again in the picker.
    init(preselectedAlbumId: String? = nil) {
        _selectedAlbumId = State(initialValue: preselectedAlbumId)
    }

    var body: some View {
        Form {
            Section("Neuen Link erstellen") {
                Picker("Album", selection: $selectedAlbumId) {
                    Text("Wählen…").tag(String?.none)
                    ForEach(albums) { album in
                        Text(album.path).tag(String?.some(album.id))
                    }
                }
                SecureField("Passwort (optional)", text: $password)
                Button("Link erstellen") { Task { await createLink() } }
                    .disabled(selectedAlbumId == nil)
            }

            if let errorMessage {
                Text(errorMessage).foregroundStyle(.red).font(.footnote)
            }

            Section("Aktive Links") {
                if links.isEmpty {
                    Text("Noch keine geteilten Links").foregroundStyle(.secondary)
                }
                ForEach(links) { link in
                    VStack(alignment: .leading, spacing: 4) {
                        Text(link.album.path).font(.subheadline.bold())
                        if let baseURL = ServerConfig.baseURL {
                            Text(baseURL.appendingPathComponent("share/\(link.token)").absoluteString)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                                .lineLimit(1)
                        }
                    }
                    .swipeActions {
                        Button("Entfernen", role: .destructive) {
                            Task { await revoke(albumId: link.albumId) }
                        }
                    }
                }
            }
        }
        .navigationTitle("Freigaben")
        .task {
            await loadLinks()
            albums = (try? await APIClient.shared.request("/albums")) ?? []
        }
    }

    private func loadLinks() async {
        links = (try? await APIClient.shared.request("/shared-links")) ?? []
    }

    private func createLink() async {
        guard let albumId = selectedAlbumId else { return }
        errorMessage = nil
        struct Body: Encodable { let password: String? }
        do {
            let _: SharedLinkCreateResponse = try await APIClient.shared.request(
                "/albums/\(albumId)/share", method: "POST",
                body: Body(password: password.isEmpty ? nil : password)
            )
            password = ""
            await loadLinks()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func revoke(albumId: String) async {
        try? await APIClient.shared.requestVoid("/albums/\(albumId)/share", method: "DELETE")
        await loadLinks()
    }
}

private struct SharedLinkCreateResponse: Decodable {
    let id: String
}
