import SwiftUI

/// Admin-only form that creates a new account directly via
/// `POST /api/admin/users` – the person doesn't need to self-register, the
/// admin hands out the initial password. Layout and submit/disabled logic
/// mirror RegisterView, but errors live in local state (this has nothing to
/// do with the admin's own session in AuthViewModel).
struct CreateUserView: View {
    @Environment(\.dismiss) private var dismiss

    /// Called with the freshly created user so AdminView can refresh its list
    /// and show a confirmation.
    let onCreated: (User) -> Void

    @State private var name = ""
    @State private var email = ""
    @State private var password = ""
    @State private var role: User.Role = .user
    @State private var isSubmitting = false
    @State private var errorMessage: String?

    private struct CreateUserBody: Encodable {
        let email: String
        let password: String
        let name: String?
        let role: String
    }

    private var trimmedEmail: String { email.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var trimmedName: String { name.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var canSubmit: Bool { !trimmedEmail.isEmpty && password.count >= 8 && !isSubmitting }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Name (optional)", text: $name)
                        .textContentType(.name)
                    TextField("E-Mail", text: $email)
                        .keyboardType(.emailAddress)
                        .textContentType(.username)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    SecureField("Passwort (min. 8 Zeichen)", text: $password)
                        .textContentType(.newPassword)
                } footer: {
                    if !password.isEmpty && password.count < 8 {
                        Text("Noch \(8 - password.count) Zeichen bis zur Mindestlänge.")
                    } else {
                        Text("Das Passwort gibst du der Person selbst weiter – eine Selbstregistrierung ist nicht nötig.")
                    }
                }

                Section {
                    Picker("Rolle", selection: $role) {
                        Text("Benutzer").tag(User.Role.user)
                        Text("Admin").tag(User.Role.admin)
                    }
                    .pickerStyle(.segmented)
                } header: {
                    Text("Rolle")
                } footer: {
                    if role == .admin {
                        Text("Admins können Benutzer verwalten, die ML-Verarbeitung steuern und Server-Updates einspielen.")
                    }
                }

                if let errorMessage {
                    Text(errorMessage).foregroundStyle(.red).font(.footnote)
                }
            }
            .navigationTitle("Neuer Benutzer")
            .navigationBarTitleDisplayMode(.inline)
            .interactiveDismissDisabled(isSubmitting)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Abbrechen") { dismiss() }
                        .disabled(isSubmitting)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button {
                        Task { await submit() }
                    } label: {
                        if isSubmitting { ProgressView() } else { Text("Anlegen") }
                    }
                    .disabled(!canSubmit)
                }
            }
        }
    }

    private func submit() async {
        isSubmitting = true
        errorMessage = nil
        defer { isSubmitting = false }
        do {
            let user: User = try await APIClient.shared.request(
                "/admin/users", method: "POST",
                body: CreateUserBody(
                    email: trimmedEmail,
                    password: password,
                    // Backend rejects an empty string (z.string().min(1)), so omit it instead.
                    name: trimmedName.isEmpty ? nil : trimmedName,
                    role: role.rawValue
                )
            )
            onCreated(user)
            dismiss()
        } catch {
            errorMessage = Self.message(for: error)
        }
    }

    /// The backend answers in English; translate the cases an admin will
    /// realistically hit here.
    private static func message(for error: Error) -> String {
        if case APIError.server(let status, let message) = error {
            switch (status, message) {
            case (409, _), (_, "Email already registered"):
                return "Für diese E-Mail-Adresse gibt es bereits einen Account."
            case (400, _):
                return "Bitte eine gültige E-Mail-Adresse und ein Passwort mit mindestens 8 Zeichen angeben."
            case (403, _):
                return "Nur Admins dürfen Benutzer anlegen."
            default:
                break
            }
        }
        return error.localizedDescription
    }
}
