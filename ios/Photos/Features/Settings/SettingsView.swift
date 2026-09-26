import SwiftUI

struct SettingsView: View {
    @EnvironmentObject private var auth: AuthViewModel
    @State private var apiKeys: [ApiKeyInfo] = []

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
            .task { await loadApiKeys() }
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
