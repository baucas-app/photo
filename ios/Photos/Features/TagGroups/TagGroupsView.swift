import SwiftUI

// MARK: - Models

struct TagGroupLabelModel: Codable, Identifiable {
    let id: String
    let label: String
}

struct TagGroupModel: Codable, Identifiable {
    let id: String
    let name: String
    let labels: [TagGroupLabelModel]
    let createdAt: Date
}

// MARK: - List View

struct TagGroupsView: View {
    @State private var groups: [TagGroupModel] = []
    @State private var showCreate = false

    var body: some View {
        NavigationStack {
            Group {
                if groups.isEmpty {
                    ContentUnavailableView(
                        "Keine Tag-Gruppen",
                        systemImage: "tag.stack",
                        description: Text("Gruppiere verwandte Tags \u{2013} z.B. \"Reisen\": Strand, Meer, Palme.")
                    )
                } else {
                    List {
                        ForEach(groups) { group in
                            NavigationLink(destination: TagGroupDetailView(group: group, onUpdate: { Task { await load() } })) {
                                VStack(alignment: .leading, spacing: 3) {
                                    Text(group.name).font(.headline)
                                    Text(group.labels.map { $0.label }.joined(separator: " · "))
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                        .lineLimit(1)
                                }
                            }
                        }
                        .onDelete { indexSet in
                            Task { await deleteGroups(at: indexSet) }
                        }
                    }
                }
            }
            .navigationTitle("Tag-Gruppen")
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button { showCreate = true } label: { Image(systemName: "plus") }
                }
            }
            .task { await load() }
            .sheet(isPresented: $showCreate, onDismiss: { Task { await load() } }) {
                TagGroupEditorView()
            }
        }
    }

    private func load() async {
        groups = (try? await APIClient.shared.request("/tag-groups")) ?? []
    }

    private func deleteGroups(at indexSet: IndexSet) async {
        for index in indexSet {
            try? await APIClient.shared.requestVoid("/tag-groups/\(groups[index].id)", method: "DELETE")
        }
        await load()
    }
}

// MARK: - Detail (shows assets with any tag in the group)

struct TagGroupDetailView: View {
    let group: TagGroupModel
    let onUpdate: () -> Void
    @State private var assets: [Asset] = []
    @State private var selectedAsset: Asset?
    @State private var showEdit = false
    private let columns = [GridItem(.adaptive(minimum: 110), spacing: 2)]

    var body: some View {
        Group {
            if assets.isEmpty {
                ContentUnavailableView(
                    "Keine Fotos",
                    systemImage: "photo",
                    description: Text("Noch keine Fotos mit diesen Tags.")
                )
            } else {
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
            }
        }
        .navigationTitle(group.name)
        .navigationBarTitleDisplayMode(.large)
        .task { await load() }
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button("Bearbeiten") { showEdit = true }
            }
        }
        .fullScreenCover(item: $selectedAsset) { asset in
            PhotoViewerView(assets: assets, initialAsset: asset)
        }
        .sheet(isPresented: $showEdit, onDismiss: onUpdate) {
            TagGroupEditorView(existing: group)
        }
    }

    private func load() async {
        let page: AssetPage? = try? await APIClient.shared.request("/tag-groups/\(group.id)/assets")
        assets = page?.assets ?? []
    }
}

// MARK: - Editor

struct TagGroupEditorView: View {
    var existing: TagGroupModel? = nil
    @Environment(\.dismiss) private var dismiss

    @State private var name = ""
    @State private var labelsText = ""
    @State private var saving = false
    @State private var showError = false
    @State private var errorMessage = ""

    var body: some View {
        NavigationStack {
            Form {
                Section("Gruppenname") {
                    TextField("z.B. Reisen", text: $name)
                }
                Section(header: Text("Tags (durch Komma getrennt)"),
                        footer: Text("Beispiel: Strand, Meer, Palme, Urlaub").font(.caption)) {
                    TextEditor(text: $labelsText)
                        .frame(minHeight: 100)
                }
            }
            .navigationTitle(existing == nil ? "Neue Tag-Gruppe" : "Gruppe bearbeiten")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Abbrechen") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Speichern") { Task { await save() } }
                        .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty || saving)
                }
            }
            .onAppear {
                if let existing {
                    name = existing.name
                    labelsText = existing.labels.map { $0.label }.joined(separator: ", ")
                }
            }
            .alert("Fehler", isPresented: $showError) {
                Button("OK") {}
            } message: {
                Text(errorMessage)
            }
        }
    }

    private struct SaveBody: Encodable {
        let name: String
        let labels: [String]
    }

    private func save() async {
        saving = true
        defer { saving = false }
        let labels = labelsText
            .split(separator: ",")
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
        guard !labels.isEmpty else {
            errorMessage = "Bitte mindestens einen Tag eingeben."
            showError = true
            return
        }
        let body = SaveBody(name: name.trimmingCharacters(in: .whitespaces), labels: labels)
        do {
            if let existing {
                try await APIClient.shared.requestVoid("/tag-groups/\(existing.id)", method: "PATCH", body: body)
            } else {
                try await APIClient.shared.requestVoid("/tag-groups", method: "POST", body: body)
            }
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
            showError = true
        }
    }
}
