import SwiftUI

struct LoginView: View {
    @EnvironmentObject private var auth: AuthViewModel
    @State private var email = ""
    @State private var password = ""
    @State private var isSubmitting = false
    @State private var showRegister = false

    var body: some View {
        Form {
            Section {
                TextField("E-Mail", text: $email)
                    .textContentType(.username)
                    .keyboardType(.emailAddress)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()

                SecureField("Passwort", text: $password)
                    .textContentType(.password)
            }

            if let error = auth.errorMessage {
                Text(error).foregroundStyle(.red).font(.footnote)
            }

            Section {
                Button {
                    Task {
                        isSubmitting = true
                        await auth.login(email: email, password: password)
                        isSubmitting = false
                    }
                } label: {
                    if isSubmitting {
                        ProgressView().frame(maxWidth: .infinity)
                    } else {
                        Text("Anmelden").frame(maxWidth: .infinity)
                    }
                }

                Button("Noch keinen Account? Registrieren") { showRegister = true }
            }
        }
        // Same title mechanism (large navigation title) as ServerSetupView,
        // so headings sit in the same spot across the setup/auth flow
        // instead of each screen inventing its own layout for it.
        .navigationTitle("Anmelden")
        .sheet(isPresented: $showRegister) {
            RegisterView()
        }
    }
}
