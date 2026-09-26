import SwiftUI

struct RegisterView: View {
    @EnvironmentObject private var auth: AuthViewModel
    @Environment(\.dismiss) private var dismiss

    @State private var name = ""
    @State private var email = ""
    @State private var password = ""
    @State private var isSubmitting = false

    var body: some View {
        NavigationStack {
            Form {
                TextField("Name (optional)", text: $name)
                TextField("E-Mail", text: $email)
                    .keyboardType(.emailAddress)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                SecureField("Passwort (min. 8 Zeichen)", text: $password)

                if let error = auth.errorMessage {
                    Text(error).foregroundStyle(.red).font(.footnote)
                }
            }
            .navigationTitle("Account erstellen")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Abbrechen") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button {
                        Task {
                            isSubmitting = true
                            await auth.register(email: email, password: password, name: name.isEmpty ? nil : name)
                            isSubmitting = false
                            if auth.currentUser != nil { dismiss() }
                        }
                    } label: {
                        if isSubmitting { ProgressView() } else { Text("Erstellen") }
                    }
                    .disabled(email.isEmpty || password.count < 8)
                }
            }
        }
    }
}
