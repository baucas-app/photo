import SwiftUI
import Network

/// Which network interfaces the backup is allowed to use.
enum NetworkUploadPreference: String, CaseIterable {
    case wifiOnly       = "wifiOnly"
    case cellularOnly   = "cellularOnly"
    case wifiAndCellular = "wifiAndCellular"
    case wifiPreferred  = "wifiPreferred"

    var label: String {
        switch self {
        case .wifiOnly:         return "Nur WLAN"
        case .cellularOnly:     return "Nur Mobilfunk"
        case .wifiAndCellular:  return "WLAN & Mobilfunk"
        case .wifiPreferred:    return "WLAN, sonst Mobilfunk"
        }
    }

    var description: String {
        switch self {
        case .wifiOnly:         return "Uploads nur über WLAN."
        case .cellularOnly:     return "Uploads nur über Mobilfunk."
        case .wifiAndCellular:  return "Uploads über jede verfügbare Verbindung."
        case .wifiPreferred:    return "WLAN wenn verfügbar, sonst automatisch Mobilfunk."
        }
    }
}

/// Persisted backup preferences (UserDefaults, shared with @AppStorage in
/// BackupSettingsView) plus the pure helpers BackupEngine and
/// PhotoLibraryService need to apply them.
enum BackupSettings {
    static let autoBackupEnabledKey = "photos.backup.autoEnabled"
    static let targetAlbumNameKey = "photos.backup.targetAlbumName"
    static let targetAlbumIdKey = "photos.backup.targetAlbumId"
    static let sortByMonthKey = "photos.backup.sortByMonth"
    static let fileNameTemplateKey = "photos.backup.fileNameTemplate"
    static let deleteAfterUploadKey = "photos.backup.deleteAfterUpload"
    static let networkPreferenceKey = "photos.backup.networkPreference"

    static let defaultTargetAlbumName = "iPhone Backup"
    static let defaultFileNameTemplate = "{title}"

    static var isAutoBackupEnabled: Bool {
        UserDefaults.standard.object(forKey: autoBackupEnabledKey) as? Bool ?? false
    }

    /// Empty name means "no target album": the backend then files uploads
    /// by EXIF date under /YYYY/MM/ on its own.
    static var targetAlbumName: String {
        (UserDefaults.standard.string(forKey: targetAlbumNameKey) ?? defaultTargetAlbumName)
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }

    static var targetAlbumId: String? {
        UserDefaults.standard.string(forKey: targetAlbumIdKey)
    }

    static var sortByMonth: Bool {
        UserDefaults.standard.bool(forKey: sortByMonthKey)
    }

    static var fileNameTemplate: String {
        UserDefaults.standard.string(forKey: fileNameTemplateKey) ?? defaultFileNameTemplate
    }

    static var deleteAfterUpload: Bool {
        UserDefaults.standard.bool(forKey: deleteAfterUploadKey)
    }

    static var networkPreference: NetworkUploadPreference {
        let raw = UserDefaults.standard.string(forKey: networkPreferenceKey) ?? ""
        return NetworkUploadPreference(rawValue: raw) ?? .wifiAndCellular
    }

    static let placeholders = ["{title}", "{yyyy}", "{mm}", "{dd}", "{hh}", "{min}", "{ss}"]

    /// Renders `template` into a file name (without extension). Falls back to
    /// the original title if the template renders to nothing usable.
    static func renderFileName(template: String, title: String, date: Date) -> String {
        let c = Calendar.current.dateComponents([.year, .month, .day, .hour, .minute, .second], from: date)
        func pad(_ value: Int?) -> String { String(format: "%02d", value ?? 0) }

        var result = template
        let replacements: [(String, String)] = [
            ("{title}", title),
            ("{yyyy}", String(format: "%04d", c.year ?? 0)),
            ("{mm}", pad(c.month)),
            ("{dd}", pad(c.day)),
            ("{hh}", pad(c.hour)),
            ("{min}", pad(c.minute)),
            ("{ss}", pad(c.second)),
        ]
        for (placeholder, value) in replacements {
            result = result.replacingOccurrences(of: placeholder, with: value)
        }

        // Path separators / reserved characters would break the multipart
        // filename or the server-side path.
        let forbidden = CharacterSet(charactersIn: "/\\:\"*?<>|\n\r\t")
        result = result.components(separatedBy: forbidden).joined(separator: "_")
            .trimmingCharacters(in: .whitespaces)
        while result.hasPrefix(".") { result.removeFirst() }

        return result.isEmpty ? title : result
    }

    /// Child-album name used when "Nach Monat sortieren" is on.
    static func monthAlbumName(for date: Date) -> String {
        let c = Calendar.current.dateComponents([.year, .month], from: date)
        return String(format: "%04d-%02d", c.year ?? 0, c.month ?? 0)
    }
}

struct BackupSettingsView: View {
    @AppStorage(BackupSettings.autoBackupEnabledKey) private var isAutoBackupEnabled = false
    @AppStorage(BackupSettings.targetAlbumNameKey) private var targetAlbumName = BackupSettings.defaultTargetAlbumName
    @AppStorage(BackupSettings.targetAlbumIdKey) private var targetAlbumId = ""
    @AppStorage(BackupSettings.sortByMonthKey) private var sortByMonth = false
    @AppStorage(BackupSettings.fileNameTemplateKey) private var fileNameTemplate = BackupSettings.defaultFileNameTemplate
    @AppStorage(BackupSettings.deleteAfterUploadKey) private var deleteAfterUpload = false
    @AppStorage(BackupSettings.networkPreferenceKey) private var networkPreferenceRaw = NetworkUploadPreference.wifiAndCellular.rawValue

    private var networkPreference: NetworkUploadPreference {
        NetworkUploadPreference(rawValue: networkPreferenceRaw) ?? .wifiAndCellular
    }

    @State private var albums: [Album] = []
    @State private var albumsError: String?

    var body: some View {
        Form {
            Section {
                Toggle("Automatisches Backup", isOn: $isAutoBackupEnabled)
                    .onChange(of: isAutoBackupEnabled) { _, _ in
                        BackupEngine.shared.scheduleNextBackgroundRun()
                    }
                Toggle("Nach Upload löschen", isOn: $deleteAfterUpload)
            } footer: {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Sichert neue Fotos regelmäßig im Hintergrund, sobald iOS es zulässt. Manuelles Backup funktioniert immer.")
                    if deleteAfterUpload {
                        Text("Achtung: Fotos werden nach erfolgreichem Upload dauerhaft aus der iPhone-Bibliothek geloescht.")
                            .foregroundStyle(.orange)
                    }
                }
            }

            Section {
                NavigationLink(destination: NetworkPreferencePickerView(selection: $networkPreferenceRaw)) {
                    LabeledContent("Netzwerk") {
                        Text(networkPreference.label)
                            .foregroundStyle(.secondary)
                    }
                }
            } header: {
                Text("Upload-Netzwerk")
            } footer: {
                Text(networkPreference.description)
            }

            Section {
                TextField("Album-Name", text: $targetAlbumName)
                    .autocorrectionDisabled()
                    .onChange(of: targetAlbumName) { _, newValue in
                        // Typing a name detaches any previously picked album,
                        // unless it's still the same album.
                        if let picked = albums.first(where: { $0.id == targetAlbumId }), picked.name != newValue {
                            targetAlbumId = ""
                        }
                    }

                if !albums.isEmpty {
                    Menu {
                        ForEach(albums) { album in
                            Button(album.path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))) {
                                targetAlbumId = album.id
                                targetAlbumName = album.name
                            }
                        }
                    } label: {
                        Label("Bestehendes Album wählen", systemImage: "rectangle.stack")
                    }
                }

                if let albumsError {
                    Text(albumsError).font(.footnote).foregroundStyle(.red)
                }
            } header: {
                Text("Ziel-Album")
            } footer: {
                Text(targetAlbumFooter)
            }

            Section {
                Toggle("Nach Monat sortieren", isOn: $sortByMonth)
                    .disabled(trimmedTargetName.isEmpty)
            } footer: {
                Text(sortByMonth
                     ? "Fotos landen in Unteralben pro Aufnahmemonat, z.B. „\(trimmedTargetName.isEmpty ? "…" : trimmedTargetName) / \(BackupSettings.monthAlbumName(for: .now))“."
                     : "Alle Fotos landen direkt im Ziel-Album.")
            }

            Section {
                TextField("Template", text: $fileNameTemplate)
                    .autocorrectionDisabled()
                    .textInputAutocapitalization(.never)
                    .font(.body.monospaced())

                ScrollView(.horizontal, showsIndicators: false) {
                    HStack {
                        ForEach(BackupSettings.placeholders, id: \.self) { placeholder in
                            Button(placeholder) { fileNameTemplate += placeholder }
                                .buttonStyle(.bordered)
                                .font(.caption.monospaced())
                        }
                    }
                }

                ForEach(previewExamples, id: \.self) { example in
                    LabeledContent("Vorschau") {
                        Text(example).font(.footnote.monospaced())
                    }
                }

                Button("Zurücksetzen") { fileNameTemplate = BackupSettings.defaultFileNameTemplate }
            } header: {
                Text("Dateiname")
            } footer: {
                Text("{title} = Original-Dateiname ohne Endung, {yyyy}/{mm}/{dd} = Aufnahmedatum, {hh}/{min}/{ss} = Uhrzeit. Die Original-Endung wird automatisch angehängt.")
            }
        }
        .navigationTitle("Backup-Einstellungen")
        .navigationBarTitleDisplayMode(.inline)
        .task { await loadAlbums() }
    }

    private var trimmedTargetName: String {
        targetAlbumName.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var targetAlbumFooter: String {
        if trimmedTargetName.isEmpty {
            return "Kein Ziel-Album: der Server sortiert automatisch nach /JJJJ/MM/."
        }
        if !targetAlbumId.isEmpty, albums.contains(where: { $0.id == targetAlbumId }) {
            return "Bestehendes Album wird verwendet."
        }
        if albums.contains(where: { $0.parentId == nil && $0.name == trimmedTargetName }) {
            return "Bestehendes Album „\(trimmedTargetName)“ wird verwendet."
        }
        return "Album „\(trimmedTargetName)“ wird beim ersten Backup angelegt."
    }

    private var previewExamples: [String] {
        let calendar = Calendar.current
        let sampleA = calendar.date(from: DateComponents(year: 2026, month: 9, day: 14, hour: 18, minute: 42, second: 7)) ?? .now
        let sampleB = calendar.date(from: DateComponents(year: 2025, month: 12, day: 24, hour: 9, minute: 5, second: 30)) ?? .now
        return [
            BackupSettings.renderFileName(template: fileNameTemplate, title: "IMG_4821", date: sampleA) + ".HEIC",
            BackupSettings.renderFileName(template: fileNameTemplate, title: "IMG_0133", date: sampleB) + ".MOV",
        ]
    }

    private func loadAlbums() async {
        do {
            albums = try await APIClient.shared.request("/albums")
            albumsError = nil
        } catch {
            albumsError = "Alben konnten nicht geladen werden: \(error.localizedDescription)"
        }
    }
}

private struct NetworkPreferencePickerView: View {
    @Binding var selection: String

    var body: some View {
        List {
            ForEach(NetworkUploadPreference.allCases, id: \.rawValue) { option in
                Button {
                    selection = option.rawValue
                } label: {
                    HStack(alignment: .center, spacing: 12) {
                        VStack(alignment: .leading, spacing: 3) {
                            Text(option.label)
                                .foregroundStyle(.primary)
                            Text(option.description)
                                .font(.footnote)
                                .foregroundStyle(.secondary)
                        }
                        Spacer()
                        if selection == option.rawValue {
                            Image(systemName: "checkmark")
                                .foregroundStyle(Color.accentColor)
                                .fontWeight(.semibold)
                        }
                    }
                    .padding(.vertical, 4)
                }
            }
        }
        .navigationTitle("Upload-Netzwerk")
        .navigationBarTitleDisplayMode(.inline)
    }
}
