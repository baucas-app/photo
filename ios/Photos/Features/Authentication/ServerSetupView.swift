import SwiftUI

struct ServerSetupView: View {
    @State private var scheme: String
    @State private var hostInput: String
    let onConfigured: () -> Void

    init(onConfigured: @escaping () -> Void) {
        self.onConfigured = onConfigured
        if let existing = ServerConfig.baseURL, let host = existing.host {
            let port = existing.port.map { ":\($0)" } ?? ""
            _scheme = State(initialValue: existing.scheme ?? "https")
            _hostInput = State(initialValue: "\(host)\(port)")
        } else {
            _scheme = State(initialValue: "https")
            _hostInput = State(initialValue: "")
        }
    }

    // Users just type the host (and optional port) - no more remembering to
    // type "https://" themselves; the scheme comes from the picker instead.
    private var composedURL: URL? {
        let trimmed = hostInput
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: #"^https?://"#, with: "", options: .regularExpression)
        guard !trimmed.isEmpty else { return nil }
        return URL(string: "\(scheme)://\(trimmed)")
    }

    var body: some View {
        Form {
            Section {
                HStack(spacing: 8) {
                    Menu {
                        Button("https://") { scheme = "https" }
                        Button("http://") { scheme = "http" }
                    } label: {
                        Text("\(scheme)://")
                            .foregroundStyle(.primary)
                    }
                    .menuIndicator(.hidden)
                    .fixedSize()

                    TextField("photos.meinnas.de", text: $hostInput)
                        .keyboardType(.URL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                }
            } header: {
                Text("Server-Adresse")
            } footer: {
                Text("Die Adresse deines Photos-Servers, z.B. photos.meinnas.de oder 192.168.1.10:8080")
            }
        }
        .navigationTitle("Server einrichten")
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                Button("Weiter") {
                    guard let url = composedURL else { return }
                    ServerConfig.baseURL = url
                    onConfigured()
                }
                .disabled(composedURL == nil)
            }
        }
    }
}
