import SwiftUI

private struct HealthResponse: Decodable {
    let status: String
    let database: String
}

/// Split out of SettingsView's account list because the inline version
/// (Button > HStack > VStack > conditional Image) made the Swift type
/// checker time out on that one expression.
private struct AccountRow: View {
    let account: SavedAccount
    let isActive: Bool
    let onSelect: () -> Void

    var body: some View {
        Button(action: onSelect) {
            HStack {
                VStack(alignment: .leading) {
                    Text(account.email).foregroundStyle(.primary)
                    Text(account.serverURL.host ?? account.serverURL.absoluteString)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                if isActive {
                    Image(systemName: "checkmark").foregroundStyle(Color.accentColor)
                }
            }
        }
    }
}

struct SettingsView: View {
    @EnvironmentObject private var auth: AuthViewModel
    @State private var apiKeys: [ApiKeyInfo] = []
    @State private var isServerOnline: Bool?
    @State private var latencyMs: Int?

    var body: some View {
        NavigationStack {
            Form {
                Section("Account") {
                    LabeledContent("E-Mail", value: auth.currentUser?.email ?? "")
                    if let name = auth.currentUser?.name, !name.isEmpty {
                        LabeledContent("Name", value: name)
                    }
                    LabeledContent("Rolle", value: auth.currentUser?.role == .admin ? "Admin" : "Benutzer")
                }

                Section("Konten") {
                    ForEach(auth.savedAccounts) { account in
                        AccountRow(account: account, isActive: account.id == auth.currentUser?.id) {
                            Task { await auth.switchAccount(to: account) }
                        }
                        .swipeActions {
                            Button("Entfernen", role: .destructive) { auth.removeAccount(account) }
                        }
                    }
                    Button("Weiteres Konto hinzufügen") { auth.addAccount() }
                }

                Section("Server-Status") {
                    HStack {
                        Circle()
                            .fill(isServerOnline == true ? .green : .red)
                            .frame(width: 10, height: 10)
                        Text(serverStatusText)
                        Spacer()
                        Button("Neu prüfen") { Task { await checkHealth() } }
                            .font(.caption)
                    }
                }

                BackupStatusView()

                Section {
                    NavigationLink("Freigaben") { SharingView() }
                }

                Section("API-Keys") {
                    ForEach(apiKeys) { key in
                        VStack(alignment: .leading) {
                            Text(key.name)
                            Text("Erstellt \(key.createdAt.formatted(date: .abbreviated, time: .omitted))")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        .swipeActions {
                            Button("Widerrufen", role: .destructive) {
                                Task { await revoke(key.id) }
                            }
                        }
                    }
                }

                if auth.currentUser?.role == .admin {
                    Section {
                        NavigationLink("Admin-Bereich") { AdminView() }
                    }
                }

                Section {
                    Button("Abmelden", role: .destructive) { auth.logout() }
                }
            }
            .navigationTitle("Einstellungen")
            .task {
                await loadApiKeys()
                await checkHealth()
            }
        }
    }

    private var serverStatusText: String {
        guard let isServerOnline else { return "Prüfe…" }
        guard isServerOnline else { return "Server nicht erreichbar" }
        return latencyMs.map { "Online · \($0) ms" } ?? "Online"
    }

    private func checkHealth() async {
        let start = Date()
        let response: HealthResponse? = try? await APIClient.shared.request("/health")
        if let response, response.database == "ok" {
            isServerOnline = true
            latencyMs = Int(Date().timeIntervalSince(start) * 1000)
        } else {
            isServerOnline = false
            latencyMs = nil
        }
    }

    private func loadApiKeys() async {
        apiKeys = (try? await APIClient.shared.request("/auth/api-keys")) ?? []
    }

    private func revoke(_ id: String) async {
        try? await APIClient.shared.requestVoid("/auth/api-keys/\(id)", method: "DELETE")
        await loadApiKeys()
    }
}
