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

/// BullMQ job counts from `GET /api/admin/ml/status`. The backend may add
/// further keys (e.g. `paused`), which are simply ignored.
private struct MlQueueStatus: Decodable {
    let active: Int
    let waiting: Int
    let completed: Int
    let failed: Int
    let delayed: Int

    var pending: Int { active + waiting + delayed }
}

private struct MlRescanResponse: Decodable {
    let queued: Int
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

    @State private var isCreatingUser = false
    @State private var userCreatedMessage: String?

    @State private var mlStatus: MlQueueStatus?
    @State private var mlStatusError: String?
    @State private var isLoadingMlStatus = false
    @State private var isConfirmingRescan = false
    @State private var isRescanning = false
    @State private var rescanMessage: String?
    @State private var rescanError: String?

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
                        Text(user.name.flatMap { $0.isEmpty ? nil : $0 } ?? user.email)
                        Text(userSubtitle(user)).font(.caption).foregroundStyle(.secondary)
                    }
                }
                Button {
                    userCreatedMessage = nil
                    isCreatingUser = true
                } label: {
                    Label("Neuen Benutzer anlegen", systemImage: "person.badge.plus")
                }
                if let userCreatedMessage {
                    Text(userCreatedMessage).foregroundStyle(.green).font(.footnote)
                }
            }

            mlSection

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
        .task { await pollMlStatus() }
        .sheet(isPresented: $isCreatingUser) {
            CreateUserView { user in
                userCreatedMessage = "\(user.email) wurde als \(user.role == .admin ? "Admin" : "Benutzer") angelegt."
                Task { await loadUsers() }
            }
        }
        .confirmationDialog(
            "Gesamte Bibliothek neu verarbeiten?",
            isPresented: $isConfirmingRescan,
            titleVisibility: .visible
        ) {
            Button("Alle Fotos neu analysieren") { Task { await rescan() } }
            Button("Abbrechen", role: .cancel) {}
        } message: {
            Text(rescanConfirmationText)
        }
    }

    // MARK: - ML-Verarbeitung

    /// Modelled on Immich's admin "Jobs" panel: live queue counters with a
    /// manual refresh (same pattern as SettingsView's "Server-Status") plus a
    /// guarded "reprocess everything" action.
    @ViewBuilder
    private var mlSection: some View {
        Section {
            HStack {
                Circle()
                    .fill(mlStatusColor)
                    .frame(width: 10, height: 10)
                Text(mlStatusText)
                Spacer()
                if isLoadingMlStatus {
                    ProgressView()
                } else {
                    Button("Neu prüfen") { Task { await loadMlStatus() } }
                        .font(.caption)
                }
            }

            if let mlStatus {
                LabeledContent("Aktiv", value: "\(mlStatus.active)")
                LabeledContent("Wartend", value: "\(mlStatus.waiting)")
                LabeledContent("Verzögert", value: "\(mlStatus.delayed)")
                LabeledContent("Fertig", value: "\(mlStatus.completed)")
                LabeledContent {
                    Text("\(mlStatus.failed)")
                        .foregroundStyle(mlStatus.failed > 0 ? .red : .secondary)
                } label: {
                    Text("Fehlgeschlagen")
                }
            }

            if let mlStatusError {
                Text(mlStatusError).foregroundStyle(.red).font(.footnote)
            }

            Button {
                rescanMessage = nil
                rescanError = nil
                isConfirmingRescan = true
            } label: {
                HStack {
                    Label("Bibliothek neu verarbeiten", systemImage: "arrow.triangle.2.circlepath")
                    if isRescanning {
                        Spacer()
                        ProgressView()
                    }
                }
            }
            .disabled(isRescanning || busy)

            if let rescanMessage {
                Text(rescanMessage).foregroundStyle(.green).font(.footnote)
            }
            if let rescanError {
                Text(rescanError).foregroundStyle(.red).font(.footnote)
            }
        } header: {
            Text("ML-Verarbeitung")
        } footer: {
            Text("Suche (CLIP), Objekt-Tags (YOLO) und Gesichtserkennung laufen im Hintergrund auf dem Server.")
        }
    }

    private var mlStatusColor: Color {
        guard let mlStatus else { return mlStatusError == nil ? .gray : .red }
        if mlStatus.failed > 0 && mlStatus.pending == 0 { return .orange }
        return mlStatus.pending > 0 ? .blue : .green
    }

    private var mlStatusText: String {
        guard let mlStatus else { return mlStatusError == nil ? "Prüfe…" : "Status nicht verfügbar" }
        if mlStatus.pending > 0 {
            return "In Arbeit · \(mlStatus.pending) offen"
        }
        return mlStatus.failed > 0 ? "Leerlauf · \(mlStatus.failed) fehlgeschlagen" : "Leerlauf · alles verarbeitet"
    }

    private var rescanConfirmationText: String {
        let count = stats.map { "Alle \($0.assetCount) Fotos und Videos" } ?? "Alle Fotos und Videos"
        return "\(count) aller Benutzer werden erneut für Suche, Objekt-Tags und Gesichtserkennung analysiert. "
            + "Bei einer großen Bibliothek kann das Stunden dauern und den Server stark auslasten."
    }

    private func loadMlStatus() async {
        isLoadingMlStatus = true
        defer { isLoadingMlStatus = false }
        do {
            mlStatus = try await APIClient.shared.request("/admin/ml/status")
            mlStatusError = nil
        } catch {
            mlStatus = nil
            mlStatusError = error.localizedDescription
        }
    }

    /// Refreshes the counters while the view is on screen: every few seconds
    /// while jobs are pending, rarely when idle. Cancelled automatically when
    /// the view disappears (`.task`).
    private func pollMlStatus() async {
        while !Task.isCancelled {
            await loadMlStatus()
            let seconds: UInt64 = (mlStatus?.pending ?? 0) > 0 ? 3 : 15
            try? await Task.sleep(nanoseconds: seconds * 1_000_000_000)
        }
    }

    private func rescan() async {
        isRescanning = true
        rescanError = nil
        defer { isRescanning = false }
        do {
            let result: MlRescanResponse = try await APIClient.shared.request("/admin/ml/rescan", method: "POST")
            rescanMessage = result.queued == 1
                ? "1 Datei zur Verarbeitung eingereiht."
                : "\(result.queued) Dateien zur Verarbeitung eingereiht."
        } catch {
            rescanError = error.localizedDescription
        }
        await loadMlStatus()
    }

    // MARK: - Loading

    private func load() async {
        await loadUsers()
        gitStatus = try? await APIClient.shared.request("/admin/git-status")
    }

    private func loadUsers() async {
        users = (try? await APIClient.shared.request("/admin/users")) ?? []
        stats = (try? await APIClient.shared.request("/admin/stats")) ?? stats
    }

    private func userSubtitle(_ user: User) -> String {
        let role = user.role == .admin ? "Admin" : "Benutzer"
        guard let name = user.name, !name.isEmpty else { return role }
        return "\(user.email) · \(role)"
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
