import AuthenticationServices
import SwiftUI

struct LoginView: View {
    @EnvironmentObject private var auth: AuthViewModel
    @Environment(\.dismiss) private var dismiss

    var candidateServerURL: URL? = nil
    var onSuccess: (() -> Void)? = nil

    // When provided by RootView, credentials survive navigating back to fix
    // the server URL. When nil (e.g. "add account" sheet), local state is used.
    var emailBinding: Binding<String>?
    var passwordBinding: Binding<String>?

    @State private var localEmail = ""
    @State private var localPassword = ""
    @State private var showPassword = false
    @State private var isSubmitting = false
    @State private var showRegister = false
    @State private var oauthError: String?

    init(
        candidateServerURL: URL? = nil,
        onSuccess: (() -> Void)? = nil,
        email: Binding<String>? = nil,
        password: Binding<String>? = nil
    ) {
        self.candidateServerURL = candidateServerURL
        self.onSuccess = onSuccess
        self.emailBinding = email
        self.passwordBinding = password
    }

    private var email: Binding<String> { emailBinding ?? $localEmail }
    private var password: Binding<String> { passwordBinding ?? $localPassword }

    var body: some View {
        Form {
            Section {
                TextField("E-Mail", text: email)
                    .textContentType(.username)
                    .keyboardType(.emailAddress)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()

                HStack {
                    Group {
                        if showPassword {
                            TextField("Passwort", text: password)
                        } else {
                            SecureField("Passwort", text: password)
                        }
                    }
                    .textContentType(.password)

                    Button {
                        showPassword.toggle()
                    } label: {
                        Image(systemName: showPassword ? "eye.slash" : "eye")
                            .foregroundStyle(.secondary)
                    }
                    .buttonStyle(.borderless)
                }
            }

            if let error = auth.errorMessage ?? oauthError {
                Text(error).foregroundStyle(.red).font(.footnote)
            }

            Section {
                Button {
                    Task {
                        isSubmitting = true
                        if let candidateServerURL { ServerConfig.baseURL = candidateServerURL }
                        let success = await auth.login(email: email.wrappedValue, password: password.wrappedValue)
                        isSubmitting = false
                        if success { onSuccess?() ?? dismiss() }
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

            // ── OAuth ──────────────────────────────────────────────────────
            Section("Oder anmelden mit") {
                SignInWithAppleButton(.signIn) { request in
                    request.requestedScopes = [.fullName, .email]
                } onCompletion: { result in
                    Task {
                        oauthError = nil
                        switch result {
                        case .success(let auth):
                            guard let cred = auth.credential as? ASAuthorizationAppleIDCredential else { return }
                            if let candidateServerURL { ServerConfig.baseURL = candidateServerURL }
                            let success = await self.auth.loginWithApple(credential: cred)
                            if success { onSuccess?() ?? dismiss() }
                        case .failure(let err):
                            // ASAuthorizationError.canceled is a normal user tap "Abbrechen"
                            if (err as NSError).code != ASAuthorizationError.canceled.rawValue {
                                oauthError = err.localizedDescription
                            }
                        }
                    }
                }
                .signInWithAppleButtonStyle(.black)
                .frame(height: 44)
                .cornerRadius(8)

                GoogleSignInButton {
                    Task {
                        oauthError = nil
                        if let candidateServerURL { ServerConfig.baseURL = candidateServerURL }
                        guard let window = UIApplication.shared.connectedScenes
                            .compactMap({ $0 as? UIWindowScene })
                            .first?.windows.first else { return }
                        let success = await auth.loginWithGoogle(presentationAnchor: window)
                        if success { onSuccess?() ?? dismiss() }
                    }
                }
                .frame(height: 44)
            }
        }
        .navigationTitle("Anmelden")
        .sheet(isPresented: $showRegister) {
            RegisterView(candidateServerURL: candidateServerURL)
        }
    }
}

/// A plain "Mit Google anmelden" button matching the Sign-in-with-Apple look.
private struct GoogleSignInButton: View {
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 10) {
                GoogleLogoShape()
                    .frame(width: 20, height: 20)
                Text("Mit Google anmelden")
                    .font(.body.weight(.medium))
            }
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(.bordered)
        .tint(.primary)
        .cornerRadius(8)
    }
}

/// Renders the Google "G" logo using SwiftUI paths (no image asset needed).
private struct GoogleLogoShape: View {
    var body: some View {
        Canvas { ctx, size in
            let w = size.width, h = size.height
            // Blue
            var path = Path()
            path.move(to: CGPoint(x: w * 0.97, y: h * 0.51))
            path.addCurve(to: CGPoint(x: w * 0.50, y: h * 1.0),
                          control1: CGPoint(x: w * 0.97, y: h * 0.76),
                          control2: CGPoint(x: w * 0.76, y: h * 1.0))
            path.addCurve(to: CGPoint(x: w * 0.03, y: h * 0.50),
                          control1: CGPoint(x: w * 0.24, y: h * 1.0),
                          control2: CGPoint(x: w * 0.03, y: h * 0.76))
            path.addCurve(to: CGPoint(x: w * 0.50, y: h * 0.0),
                          control1: CGPoint(x: w * 0.03, y: h * 0.24),
                          control2: CGPoint(x: w * 0.24, y: h * 0.0))
            path.addCurve(to: CGPoint(x: w * 0.74, y: h * 0.09),
                          control1: CGPoint(x: w * 0.60, y: h * 0.0),
                          control2: CGPoint(x: w * 0.67, y: h * 0.03))
            path.addLine(to: CGPoint(x: w * 0.60, y: h * 0.24))
            path.addCurve(to: CGPoint(x: w * 0.50, y: h * 0.20),
                          control1: CGPoint(x: w * 0.57, y: h * 0.21),
                          control2: CGPoint(x: w * 0.54, y: h * 0.20))
            path.addCurve(to: CGPoint(x: w * 0.22, y: h * 0.50),
                          control1: CGPoint(x: w * 0.35, y: h * 0.20),
                          control2: CGPoint(x: w * 0.22, y: h * 0.34))
            path.addCurve(to: CGPoint(x: w * 0.50, y: h * 0.80),
                          control1: CGPoint(x: w * 0.22, y: h * 0.66),
                          control2: CGPoint(x: w * 0.35, y: h * 0.80))
            path.addCurve(to: CGPoint(x: w * 0.72, y: h * 0.65),
                          control1: CGPoint(x: w * 0.62, y: h * 0.80),
                          control2: CGPoint(x: w * 0.68, y: h * 0.74))
            path.addLine(to: CGPoint(x: w * 0.50, y: h * 0.65))
            path.addLine(to: CGPoint(x: w * 0.50, y: h * 0.51))
            path.addLine(to: CGPoint(x: w * 0.97, y: h * 0.51))
            path.closeSubpath()
            ctx.fill(path, with: .color(Color(hex: "#4285F4") ?? .blue))
        }
    }
}
