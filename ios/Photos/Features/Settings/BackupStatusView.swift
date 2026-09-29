import Photos
import SwiftUI

struct BackupStatusView: View {
    @StateObject private var backupEngine = BackupEngine.shared
    @State private var authorizationStatus = PhotoLibraryService.authorizationStatus
    @AppStorage(BackupSettings.autoBackupEnabledKey) private var isAutoBackupEnabled = false

    var body: some View {
        Section("Backup") {
            switch authorizationStatus {
            case .notDetermined:
                Button("Zugriff auf Mediathek erlauben") {
                    Task {
                        authorizationStatus = await PhotoLibraryService.requestAuthorization()
                    }
                }
            case .denied, .restricted:
                Text("Kein Zugriff auf die Mediathek - bitte in den iOS-Einstellungen erlauben.")
                    .foregroundStyle(.secondary)
            default:
                if backupEngine.totalCount > 0 {
                    ProgressView(value: Double(backupEngine.uploadedCount), total: Double(backupEngine.totalCount)) {
                        Text("\(backupEngine.uploadedCount) von \(backupEngine.totalCount) gesichert")
                    }
                }

                if case .error(let message) = backupEngine.status {
                    Text(message).font(.footnote).foregroundStyle(.red)
                }

                Button(backupEngine.status == .running ? "Backup läuft…" : "Backup jetzt starten") {
                    Task { await backupEngine.runBackup() }
                }
                .disabled(backupEngine.status == .running)
            }

            NavigationLink {
                BackupSettingsView()
            } label: {
                LabeledContent("Backup-Einstellungen", value: isAutoBackupEnabled ? "Automatisch an" : "Automatisch aus")
            }
        }
    }
}
