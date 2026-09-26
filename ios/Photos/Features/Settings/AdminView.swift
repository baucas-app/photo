import SwiftUI

private struct AdminStats: Decodable {
    let userCount: Int
    let assetCount: Int
    let storageBytes: Int
}

private struct GitStatus: Decodable {
    let currentCommit: String
    let currentMessage: String
    let updateAvailable: Bool
}

private struct GitUpdateResult: Decodable {
    let success: Bool
    let log: String
}

struct AdminView: View {
    @State private var stats: AdminStats?
    @State private var users: [User] = []
    @State private var gitStatus: GitStatus?
    @State private var log: String?
    @State private var busy = false

    var body: some View {
        Form {
            if let stats {
                Section("Übersicht") {
                    LabeledContent("Benutzer", value: "\(stats.userCount)")
                    LabeledContent("Fotos & Videos", value: "\(stats.assetCount)")
                    LabeledContent("Speicher", value: formattedBytes(stats.storageBytes))
                }
            }

            Section("Benutzer") {
                ForEach(users) { user in
                    VStack(alignment: .leading) {
                        Text(user.email)
                        Text(user.role == .admin ? "Admin" : "Benutzer").font(.caption).foregroundStyle(.secondary)
                    }
                }
            }

            Section("ML-Pipeline") {
                Button("Alle Fotos neu analysieren") { Task { await rescan() } }
                    .disabled(busy)
            }

            Section("Server-Update") {
                if let gitStatus {
                    Text(gitStatus.updateAvailable ? "Update verfügbar" : "Auf dem neuesten Stand")
                    Text(gitStatus.currentMessage).font(.caption).foregroundStyle(.secondary)
                }
                Button("Update laden & neustarten") { Task { await gitUpdate() } }
                    .disabled(busy)
                if let log {
                    Text(log).font(.caption).textSelection(.enabled)
                }
            }
        }
        .navigationTitle("Admin")
        .task { await load() }
    }

    private func load() async {
        stats = try? await APIClient.shared.request("/admin/stats")
        users = (try? await APIClient.shared.request("/admin/users")) ?? []
        gitStatus = try? await APIClient.shared.request("/admin/git-status")
    }

    private func rescan() async {
        busy = true
        defer { busy = false }
        try? await APIClient.shared.requestVoid("/admin/ml/rescan", method: "POST")
    }

    private func gitUpdate() async {
        busy = true
        defer { busy = false }
        let result: GitUpdateResult? = try? await APIClient.shared.request("/admin/git-update", method: "POST")
        log = result?.log
        await load()
    }

    private func formattedBytes(_ bytes: Int) -> String {
        ByteCountFormatter.string(fromByteCount: Int64(bytes), countStyle: .file)
    }
}
