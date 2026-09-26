import SwiftUI

struct LoginView: View {
    @EnvironmentObject private var auth: AuthViewModel
    @State private var email = ""
    @State private var password = ""
    @State private var isSubmitting = false
    @State private var showRegister = false

    var body: some View {
        NavigationStack {
            VStack(spacing: Spacing.md) {
                Spacer()
                Text("Photos").font(.largeTitle.bold())

                TextField("E-Mail", text: $email)
                    .textContentType(.username)
                    .keyboardType(.emailAddress)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .textFieldStyle(.roundedBorder)

                SecureField("Passwort", text: $password)
                    .textContentType(.password)
                    .textFieldStyle(.roundedBorder)

                if let error = auth.errorMessage {
                    Text(error).foregroundStyle(.red).font(.footnote)
                }

                Button {
                    Task {
                        isSubmitting = true
                        await auth.login(email: email, password: password)
                        isSubmitting = false
                    }
                } label: {
                    if isSubmitting {
                        ProgressView()
                    } else {
                        Text("Anmelden").frame(maxWidth: .infinity)
                    }
                }
                .buttonStyle(.borderedProminent)

                Button("Noch keinen Account? Registrieren") { showRegister = true }
                    .font(.footnote)

                Spacer()
                Spacer()
            }
            .padding(Spacing.lg)
            .sheet(isPresented: $showRegister) {
                RegisterView()
            }
        }
    }
}
