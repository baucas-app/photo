import SwiftUI

struct ServerSetupView: View {
    @State private var scheme: String
    @State private var hostInput: String
    let onCancel: (() -> Void)?
    let onConfigured: (URL) -> Void

    /// `onCancel` stays before `onConfigured` so existing trailing-closure
    /// call sites (`ServerSetupView { ... }`) keep binding to `onConfigured`
    /// - the last parameter - without needing to change.
    init(onCancel: (() -> Void)? = nil, onConfigured: @escaping (URL) -> Void) {
        self.onCancel = onCancel
        self.onConfigured = onConfigured
        if let existing = ServerConfig.baseURL, let host = existing.host {
            let port = existing.port.map { ":\($0)" } ?? ""
            _scheme = State(initialValue: existing.scheme ?? "https")
            _hostInput = State(initialValue: "\(host)\(port)")
        } else {
            _scheme = State(initialValue: "http")
            _hostInput = State(initialValue: "")
        }
    }

    // Users just type the host (and optional port) - no more remembering to
    // type "https://" themselves; the scheme comes from the picker instead.
    private var composedURL: URL? {
        let raw = hostInput.trimmingCharacters(in: .whitespacesAndNewlines)
        var effectiveScheme = scheme
        var host = raw
        if raw.hasPrefix("https://") {
            effectiveScheme = "https"
            host = String(raw.dropFirst("https://".count))
        } else if raw.hasPrefix("http://") {
            effectiveScheme = "http"
            host = String(raw.dropFirst("http://".count))
        }
        guard !host.isEmpty else { return nil }
        return URL(string: "\(effectiveScheme)://\(host)")
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
                        .onChange(of: hostInput) { _, new in
                            // Strip any pasted scheme prefix and sync the picker.
                            if new.hasPrefix("https://") {
                                scheme = "https"
                                hostInput = String(new.dropFirst("https://".count))
                            } else if new.hasPrefix("http://") {
                                scheme = "http"
                                hostInput = String(new.dropFirst("http://".count))
                            }
                        }
                }
            } header: {
                Text("Server-Adresse")
            } footer: {
                Text("Die Adresse deines Photos-Servers, z.B. photos.meinnas.de oder 192.168.1.10:8080")
            }
        }
        .navigationTitle("Server einrichten")
        .toolbar {
            if let onCancel {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Abbrechen", action: onCancel)
                }
            }
            ToolbarItem(placement: .confirmationAction) {
                Button("Weiter") {
                    guard let url = composedURL else { return }
                    // Standalone/first-run flow (no onCancel, no other
                    // session active): safe to commit immediately, LoginView
                    // needs it set. In the "add another account" flow, the
                    // caller holds onto the URL instead and sets it right
                    // before the login/register call, so the active
                    // session's requests aren't briefly redirected to the
                    // new server while the sheet is still being filled in.
                    if onCancel == nil {
                        ServerConfig.baseURL = url
                    }
                    onConfigured(url)
                }
                .disabled(composedURL == nil)
            }
        }
    }
}
