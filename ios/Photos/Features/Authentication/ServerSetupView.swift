import SwiftUI

struct ServerSetupView: View {
    @State private var serverURL: String = ServerConfig.baseURL?.absoluteString ?? "https://"
    let onConfigured: () -> Void

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("https://photos.meinnas.de", text: $serverURL)
                        .keyboardType(.URL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                } header: {
                    Text("Server-Adresse")
                } footer: {
                    Text("Die Adresse deines Photos-Servers, z.B. https://photos.meinnas.de oder http://192.168.1.10:8080")
                }
            }
            .navigationTitle("Server einrichten")
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Weiter") {
                        guard let url = URL(string: serverURL) else { return }
                        ServerConfig.baseURL = url
                        onConfigured()
                    }
                    .disabled(URL(string: serverURL) == nil)
                }
            }
        }
    }
}
