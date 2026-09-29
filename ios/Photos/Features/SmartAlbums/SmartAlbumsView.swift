import SwiftUI

// MARK: - Models

struct SmartAlbumRule: Codable, Identifiable {
    var id = UUID()
    var field: SmartAlbumField
    var op: SmartAlbumOp
    var value: String

    private enum CodingKeys: String, CodingKey { case field, op, value }
}

enum SmartAlbumField: String, Codable, CaseIterable {
    case tag
    case cameraModel
    case cameraMake
    case takenAfter
    case takenBefore
    case isFavorite
    case locationCity
    case locationCountry
    case ocrContains

    var displayName: String {
        switch self {
        case .tag: return "Tag"
        case .cameraModel: return "Kameramodell"
        case .cameraMake: return "Kamerahersteller"
        case .takenAfter: return "Aufgenommen nach"
        case .takenBefore: return "Aufgenommen vor"
        case .isFavorite: return "Favorit"
        case .locationCity: return "Stadt"
        case .locationCountry: return "Land"
        case .ocrContains: return "Erkannter Text enthält"
        }
    }

    var defaultOp: SmartAlbumOp {
        switch self {
        case .takenAfter: return .after
        case .takenBefore: return .before
        case .isFavorite: return .is
        default: return .eq
        }
    }
}

enum SmartAlbumOp: String, Codable, CaseIterable {
    case eq
    case contains
    case before
    case after
    case `is`

    var displayName: String {
        switch self {
        case .eq: return "ist"
        case .contains: return "enthält"
        case .before: return "vor"
        case .after: return "nach"
        case .is: return "="
        }
    }
}

struct SmartAlbumModel: Codable, Identifiable {
    let id: String
    let name: String
    let rules: [SmartAlbumRule]
    let createdAt: Date
    let updatedAt: Date
}

// MARK: - List View

struct SmartAlbumsView: View {
    @State private var albums: [SmartAlbumModel] = []
    @State private var showCreate = false

    var body: some View {
        NavigationStack {
            Group {
                if albums.isEmpty {
                    ContentUnavailableView(
                        "Keine Smart Albums",
                        systemImage: "sparkles",
                        description: Text("Erstelle ein Smart Album mit gespeicherten Suchregeln.")
                    )
                } else {
                    List {
                        ForEach(albums) { album in
                            NavigationLink(destination: SmartAlbumDetailView(album: album)) {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(album.name).font(.headline)
                                    Text("\(album.rules.count) Regel\(album.rules.count == 1 ? "" : "n")")
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                            }
                        }
                        .onDelete { indexSet in
                            Task { await deleteAlbums(at: indexSet) }
                        }
                    }
                }
            }
            .navigationTitle("Smart Albums")
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button { showCreate = true } label: {
                        Image(systemName: "plus")
                    }
                }
            }
            .task { await load() }
            .sheet(isPresented: $showCreate, onDismiss: { Task { await load() } }) {
                SmartAlbumEditorView()
            }
        }
    }

    private func load() async {
        albums = (try? await APIClient.shared.request("/smart-albums")) ?? []
    }

    private func deleteAlbums(at indexSet: IndexSet) async {
        for index in indexSet {
            let album = albums[index]
            try? await APIClient.shared.requestVoid("/smart-albums/\(album.id)", method: "DELETE")
        }
        await load()
    }
}

// MARK: - Detail View (shows assets matching rules)

struct SmartAlbumDetailView: View {
    let album: SmartAlbumModel
    @State private var assets: [Asset] = []
    @State private var selectedAsset: Asset?
    private let columns = [GridItem(.adaptive(minimum: 110), spacing: 2)]

    var body: some View {
        Group {
            if assets.isEmpty {
                ContentUnavailableView(
                    "Keine Fotos",
                    systemImage: "photo",
                    description: Text("Es gibt keine Fotos, die allen Regeln entsprechen.")
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
        .navigationTitle(album.name)
        .navigationBarTitleDisplayMode(.large)
        .task { await load() }
        .fullScreenCover(item: $selectedAsset) { asset in
            PhotoViewerView(assets: assets, initialAsset: asset)
        }
    }

    private func load() async {
        let page: AssetPage? = try? await APIClient.shared.request("/smart-albums/\(album.id)/assets")
        assets = page?.assets ?? []
    }
}

// MARK: - Editor (create/edit)

struct SmartAlbumEditorView: View {
    var existing: SmartAlbumModel? = nil
    @Environment(\.dismiss) private var dismiss

    @State private var name = ""
    @State private var rules: [SmartAlbumRule] = [SmartAlbumRule(field: .tag, op: .eq, value: "")]
    @State private var saving = false
    @State private var showError = false
    @State private var errorMessage = ""

    var body: some View {
        NavigationStack {
            Form {
                Section("Name") {
                    TextField("z.B. Sommerurlaub", text: $name)
                }
                Section("Regeln") {
                    ForEach(rules.indices, id: \.self) { i in
                        ruleRow(index: i)
                    }
                    .onDelete { rules.remove(atOffsets: $0) }
                    Button("Regel hinzufügen") {
                        rules.append(SmartAlbumRule(field: .tag, op: .eq, value: ""))
                    }
                }
            }
            .navigationTitle(existing == nil ? "Neues Smart Album" : "Album bearbeiten")
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
                    rules = existing.rules
                }
            }
            .alert("Fehler", isPresented: $showError) {
                Button("OK") {}
            } message: {
                Text(errorMessage)
            }
        }
    }

    @ViewBuilder
    private func ruleRow(index i: Int) -> some View {
        VStack(alignment: .leading, spacing: Spacing.xs) {
            Picker("Feld", selection: $rules[i].field) {
                ForEach(SmartAlbumField.allCases, id: \.self) { field in
                    Text(field.displayName).tag(field)
                }
            }
            .pickerStyle(.menu)
            if rules[i].field == .isFavorite {
                Picker("Wert", selection: $rules[i].value) {
                    Text("Ja").tag("true")
                    Text("Nein").tag("false")
                }
                .pickerStyle(.segmented)
            } else if rules[i].field == .takenAfter || rules[i].field == .takenBefore {
                TextField("JJJJ-MM-TT", text: $rules[i].value)
                    .keyboardType(.numbersAndPunctuation)
            } else {
                TextField("Wert", text: $rules[i].value)
            }
        }
        .padding(.vertical, 4)
    }

    private struct SaveBody: Encodable {
        let name: String
        let rules: [SmartAlbumRule]
    }

    private func save() async {
        saving = true
        defer { saving = false }
        let validRules = rules.filter { !$0.value.trimmingCharacters(in: .whitespaces).isEmpty }
        guard !validRules.isEmpty else {
            errorMessage = "Bitte mindestens eine gültige Regel angeben."
            showError = true
            return
        }
        let body = SaveBody(name: name.trimmingCharacters(in: .whitespaces), rules: validRules)
        do {
            if let existing {
                try await APIClient.shared.requestVoid("/smart-albums/\(existing.id)", method: "PATCH", body: body)
            } else {
                try await APIClient.shared.requestVoid("/smart-albums", method: "POST", body: body)
            }
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
            showError = true
        }
    }
}
