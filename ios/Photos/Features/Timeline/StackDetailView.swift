import SwiftUI

/// Shown when tapping a stacked photo tile in the timeline grid (docs/DONE.md
/// Teil 7): every member of the stack, leader included - `GET /assets/:id/stack`
/// works from either end, so it doesn't matter which tile was tapped. From
/// here the whole stack can be dissolved, or a single photo pulled out.
struct StackDetailView: View {
    let leaderId: String

    @Environment(\.dismiss) private var dismiss
    @State private var members: [Asset] = []
    @State private var isLoading = true
    @State private var selectedAsset: Asset?
    @State private var confirmDissolve = false
    @State private var errorMessage: String?
    @State private var isBusy = false

    private let columns = [GridItem(.adaptive(minimum: 100), spacing: Spacing.sm)]

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVGrid(columns: columns, spacing: Spacing.sm) {
                    ForEach(members) { asset in
                        Button { selectedAsset = asset } label: {
                            Color.clear
                                .aspectRatio(1, contentMode: .fit)
                                .overlay { TimelineThumbnail(asset: asset) }
                                .clipShape(RoundedRectangle(cornerRadius: Radius.sm, style: .continuous))
                        }
                        .contextMenu {
                            // Removing the leader itself always dissolves the
                            // whole stack (see unstackAsset in
                            // asset.service.ts) - offer the clearer, single
                            // "Stapel auflösen" action for that case instead.
                            if asset.stackParentId != nil {
                                Button("Aus Stapel lösen", systemImage: "square.stack.3d.up.slash") {
                                    Task { await unstack(asset) }
                                }
                            }
                        }
                    }
                }
                .padding(Spacing.md)
            }
            .overlay {
                if isLoading {
                    ProgressView()
                } else if members.isEmpty {
                    ContentUnavailableView("Stapel aufgelöst", systemImage: "square.stack.3d.up.slash")
                }
            }
            .navigationTitle(members.isEmpty ? "Stapel" : "Stapel · \(members.count) Fotos")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Fertig") { dismiss() } }
                ToolbarItem(placement: .topBarTrailing) {
                    if isBusy {
                        ProgressView()
                    } else {
                        Button("Stapel auflösen", role: .destructive) { confirmDissolve = true }
                            .disabled(members.isEmpty)
                    }
                }
            }
            .confirmationDialog(
                "Stapel auflösen?", isPresented: $confirmDissolve, titleVisibility: .visible
            ) {
                Button("Auflösen", role: .destructive) { Task { await dissolve() } }
            } message: {
                Text("Alle \(members.count) Fotos werden wieder eigenständig und tauchen einzeln in der Mediathek auf.")
            }
            .alert("Aktion fehlgeschlagen", isPresented: Binding(
                get: { errorMessage != nil },
                set: { if !$0 { errorMessage = nil } }
            )) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(errorMessage ?? "")
            }
            .fullScreenCover(item: $selectedAsset) { asset in
                PhotoViewerView(assets: members, initialAsset: asset)
            }
            .task { await load() }
        }
    }

    private func load() async {
        isLoading = true
        defer { isLoading = false }
        do {
            let response: StackMembersResponse = try await APIClient.shared.request("/assets/\(leaderId)/stack")
            members = response.assets
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func dissolve() async {
        isBusy = true
        defer { isBusy = false }
        do {
            try await APIClient.shared.requestVoid("/assets/\(leaderId)/stack", method: "DELETE")
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    /// Pulls one member out; a "stack" of one leftover photo isn't a stack
    /// anymore, so that case closes the sheet like a full dissolve would.
    private func unstack(_ asset: Asset) async {
        isBusy = true
        defer { isBusy = false }
        do {
            try await APIClient.shared.requestVoid("/assets/\(asset.id)/stack", method: "DELETE")
            await load()
            if members.count <= 1 { dismiss() }
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

private struct StackMembersResponse: Decodable { let assets: [Asset] }
