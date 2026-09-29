import SwiftUI

struct UserLabelsView: View {
    @State private var labels: [UserLabel] = []
    @State private var showCreate = false

    var body: some View {
        NavigationStack {
            Group {
                if labels.isEmpty {
                    ContentUnavailableView(
                        "Keine Labels",
                        systemImage: "tag",
                        description: Text("Erstelle eigene Labels mit Hierarchie und weise sie Fotos zu.")
                    )
                } else {
                    List {
                        ForEach(rootLabels) { label in
                            LabelSection(label: label, all: labels, onDelete: { id in
                                Task { await delete(id: id) }
                            })
                        }
                    }
                }
            }
            .navigationTitle("Labels")
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button { showCreate = true } label: { Image(systemName: "plus") }
                }
            }
            .sheet(isPresented: $showCreate, onDismiss: { Task { await load() } }) {
                CreateLabelSheet(existingLabels: labels)
            }
            .task { await load() }
        }
    }

    private var rootLabels: [UserLabel] { labels.filter { $0.parentId == nil } }

    private func load() async {
        labels = (try? await APIClient.shared.request("/user-labels")) ?? []
    }

    private func delete(id: String) async {
        try? await APIClient.shared.requestVoid("/user-labels/\(id)", method: "DELETE")
        await load()
    }
}

private struct LabelSection: View {
    let label: UserLabel
    let all: [UserLabel]
    let onDelete: (String) -> Void

    var children: [UserLabel] { all.filter { $0.parentId == label.id } }

    var body: some View {
        DisclosureGroup {
            ForEach(children) { child in
                LabelSection(label: child, all: all, onDelete: onDelete)
            }
        } label: {
            HStack {
                Circle()
                    .fill(label.swiftUIColor)
                    .frame(width: 10, height: 10)
                Text(label.name)
                Spacer()
                if let count = label.assetCount {
                    Text("\(count)").font(.caption).foregroundStyle(.secondary)
                }
            }
        }
        .swipeActions {
            Button("Löschen", role: .destructive) { onDelete(label.id) }
        }
    }
}

private struct CreateLabelSheet: View {
    let existingLabels: [UserLabel]
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var colorHex = "#6366f1"
    @State private var parentId: String? = nil
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Form {
                Section("Name") {
                    TextField("Label-Name", text: $name)
                }
                Section("Farbe") {
                    ColorPicker("Farbe", selection: Binding(
                        get: { Color(hex: colorHex) ?? .accentColor },
                        set: { colorHex = $0.hexString ?? colorHex }
                    ))
                }
                if !existingLabels.isEmpty {
                    Section("Eltern-Label (optional)") {
                        Picker("Eltern", selection: $parentId) {
                            Text("Keines").tag(String?.none)
                            ForEach(existingLabels) { l in
                                Text(l.name).tag(String?.some(l.id))
                            }
                        }
                    }
                }
                if let error {
                    Section { Text(error).foregroundStyle(.red).font(.caption) }
                }
            }
            .navigationTitle("Neues Label")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Abbrechen") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Erstellen") { Task { await create() } }
                        .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
        }
    }

    private func create() async {
        struct Body: Encodable { let name: String; let color: String; let parentId: String? }
        do {
            let _: UserLabel = try await APIClient.shared.request(
                "/user-labels", method: "POST",
                body: Body(name: name.trimmingCharacters(in: .whitespaces), color: colorHex, parentId: parentId)
            )
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

private extension Color {
    var hexString: String? {
        guard let components = UIColor(self).cgColor.components, components.count >= 3 else { return nil }
        let r = Int(components[0] * 255)
        let g = Int(components[1] * 255)
        let b = Int(components[2] * 255)
        return String(format: "#%02x%02x%02x", r, g, b)
    }
}
