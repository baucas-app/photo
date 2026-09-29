import SwiftUI

struct PartnerView: View {
    @State private var data = PartnerData(sent: [], received: [])
    @State private var emailInput = ""
    @State private var isLoading = true
    @State private var inviteError: String?
    @State private var inviteSuccess: String?

    var body: some View {
        Form {
            pendingSection
            acceptedSection
            sentSection
            inviteSection
        }
        .navigationTitle("Partner-Freigabe")
        .task { await load() }
    }

    @ViewBuilder
    private var pendingSection: some View {
        let pending = data.received.filter { $0.status == .pending }
        if !pending.isEmpty {
            Section("Ausstehende Einladung") {
                ForEach(pending) { share in
                    VStack(alignment: .leading, spacing: 6) {
                        Text("\(share.fromUser?.displayName ?? "Jemand") möchte seine Bibliothek teilen.")
                        HStack {
                            Button("Annehmen") { Task { await accept() } }
                            Button("Ablehnen", role: .destructive) { Task { await remove(share.id) } }
                        }
                        .buttonStyle(.bordered)
                        .font(.footnote)
                    }
                    .padding(.vertical, 4)
                }
            }
        }
    }

    @ViewBuilder
    private var acceptedSection: some View {
        let accepted = data.sent.filter { $0.status == .accepted }
            + data.received.filter { $0.status == .accepted }
        if !accepted.isEmpty {
            Section("Aktive Partner") {
                ForEach(accepted) { share in
                    let partner: LibraryShareUser? = share.fromUserId == share.toUserId
                        ? nil
                        : (share.toUser ?? share.fromUser)
                    HStack {
                        Label(partner?.displayName ?? "–", systemImage: "person.2.fill")
                        Spacer()
                    }
                    .swipeActions {
                        Button("Entfernen", role: .destructive) { Task { await remove(share.id) } }
                    }
                }
            }
        }
    }

    @ViewBuilder
    private var sentSection: some View {
        let sent = data.sent.filter { $0.status == .pending }
        if !sent.isEmpty {
            Section("Gesendete Einladungen") {
                ForEach(sent) { share in
                    HStack {
                        Text(share.toUser?.displayName ?? "–")
                        Spacer()
                        Text("Ausstehend").font(.caption).foregroundStyle(.secondary)
                    }
                    .swipeActions {
                        Button("Zurückziehen", role: .destructive) { Task { await remove(share.id) } }
                    }
                }
            }
        }
    }

    @ViewBuilder
    private var inviteSection: some View {
        let canInvite = data.sent.isEmpty && data.received.filter({ $0.status == .accepted }).isEmpty
        if canInvite {
            Section("Einladung senden") {
                TextField("E-Mail-Adresse", text: $emailInput)
                    .textInputAutocapitalization(.never)
                    .keyboardType(.emailAddress)
                    .autocorrectionDisabled()
                Button("Einladen") { Task { await invite() } }
                    .disabled(emailInput.isEmpty)
                if let inviteError {
                    Text(inviteError).font(.caption).foregroundStyle(.red)
                }
                if let inviteSuccess {
                    Text(inviteSuccess).font(.caption).foregroundStyle(.green)
                }
            }
        }
        Section {
            Text("Teile deine gesamte Bibliothek gegenseitig mit einer anderen Person – z. B. einem Familienmitglied. Beide Seiten müssen einen Account auf diesem Server haben.")
                .font(.footnote)
                .foregroundStyle(.secondary)
        }
    }

    private func load() async {
        isLoading = true
        data = (try? await APIClient.shared.request("/partner")) ?? PartnerData(sent: [], received: [])
        isLoading = false
    }

    private func invite() async {
        inviteError = nil
        inviteSuccess = nil
        struct Body: Encodable { let email: String }
        do {
            let _: LibraryShare = try await APIClient.shared.request(
                "/partner/invite", method: "POST", body: Body(email: emailInput)
            )
            emailInput = ""
            inviteSuccess = "Einladung gesendet."
            await load()
        } catch {
            inviteError = error.localizedDescription
        }
    }

    private func accept() async {
        try? await APIClient.shared.requestVoid("/partner/accept", method: "POST")
        await load()
    }

    private func remove(_ id: String) async {
        try? await APIClient.shared.requestVoid("/partner/\(id)", method: "DELETE")
        await load()
    }
}
