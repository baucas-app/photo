import AuthenticationServices
import Foundation
import UIKit

@MainActor
final class AuthViewModel: ObservableObject {
    @Published var currentUser: User?
    @Published var isLoading = true
    @Published var errorMessage: String?
    @Published var savedAccounts: [SavedAccount] = AccountsStore.accounts

    private struct AuthResponse: Decodable {
        let user: User
        let accessToken: String
        let refreshToken: String
    }

    /// Loads whichever account is currently marked active (if any) - the
    /// normal cold-start path, and also what a fresh `login`/`switchAccount`
    /// call re-runs to confirm the token it just stored actually works.
    func bootstrap() async {
        defer { isLoading = false }
        guard let accountId = AccountsStore.activeAccountId,
              ServerConfig.baseURL != nil,
              KeychainStore.get(.accessToken, account: accountId) != nil
        else { return }
        do {
            currentUser = try await APIClient.shared.request("/auth/me")
            await ensureApiKey(account: accountId)
        } catch {
            AccountsStore.remove(accountId)
        }
    }

    /// Returns whether this specific call succeeded - callers that present
    /// login/register inside a sheet (adding a second account) need that to
    /// decide whether to dismiss, since `currentUser` alone can't tell them:
    /// it's already non-nil from the account they're adding *to*.
    @discardableResult
    func login(email: String, password: String) async -> Bool {
        errorMessage = nil
        do {
            struct Body: Encodable { let email: String; let password: String }
            let response: AuthResponse = try await APIClient.shared.request(
                "/auth/login", method: "POST", body: Body(email: email, password: password), authenticated: false
            )
            persist(response)
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    @discardableResult
    func register(email: String, password: String, name: String?) async -> Bool {
        errorMessage = nil
        do {
            struct Body: Encodable { let email: String; let password: String; let name: String? }
            let response: AuthResponse = try await APIClient.shared.request(
                "/auth/register", method: "POST", body: Body(email: email, password: password, name: name),
                authenticated: false
            )
            persist(response)
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    /// Signs out of the active account entirely: removes its tokens and its
    /// entry in the account switcher. To just step away and add a different
    /// account without losing this one, use the "Weiteres Konto hinzufügen"
    /// sheet (`AddAccountFlow`, from SettingsView) instead.
    func logout() {
        guard let accountId = AccountsStore.activeAccountId else {
            currentUser = nil
            return
        }
        AccountsStore.remove(accountId)
        savedAccounts = AccountsStore.accounts
        currentUser = nil
    }

    func switchAccount(to account: SavedAccount) async {
        guard account.id != AccountsStore.activeAccountId else { return }
        isLoading = true
        AccountsStore.activeAccountId = account.id
        ServerConfig.baseURL = account.serverURL
        await bootstrap()
    }

    func removeAccount(_ account: SavedAccount) {
        AccountsStore.remove(account.id)
        savedAccounts = AccountsStore.accounts
        if AccountsStore.activeAccountId == nil {
            currentUser = nil
        }
    }

    // MARK: - OAuth – Apple Sign In

    @discardableResult
    func loginWithApple(credential: ASAuthorizationAppleIDCredential) async -> Bool {
        errorMessage = nil
        guard let tokenData = credential.identityToken,
              let identityToken = String(data: tokenData, encoding: .utf8) else {
            errorMessage = "Apple Sign In: Kein Identity Token erhalten."
            return false
        }
        let email = credential.email
        let fullName = credential.fullName
        let name: String? = [fullName?.givenName, fullName?.familyName]
            .compactMap { $0 }.joined(separator: " ").nonEmpty

        do {
            struct Body: Encodable { let identityToken: String; let email: String?; let name: String? }
            let response: AuthResponse = try await APIClient.shared.request(
                "/auth/oauth/apple/token", method: "POST",
                body: Body(identityToken: identityToken, email: email, name: name),
                authenticated: false
            )
            persist(response)
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    // MARK: - OAuth – Google (ASWebAuthenticationSession)

    @discardableResult
    func loginWithGoogle(presentationAnchor: ASPresentationAnchor) async -> Bool {
        errorMessage = nil
        guard let base = ServerConfig.baseURL else {
            errorMessage = "Kein Server konfiguriert."
            return false
        }
        let url = URL(string: "\(base)/api/auth/oauth/google?platform=ios")!
        return await withCheckedContinuation { continuation in
            let session = ASWebAuthenticationSession(
                url: url, callbackURLScheme: "photosapp"
            ) { [weak self] callbackURL, error in
                guard let self else { continuation.resume(returning: false); return }
                guard let callbackURL, error == nil else {
                    // User cancelled or error – not a hard failure
                    continuation.resume(returning: false)
                    return
                }
                let components = URLComponents(url: callbackURL, resolvingAgainstBaseURL: false)
                func param(_ name: String) -> String? {
                    components?.queryItems?.first(where: { $0.name == name })?.value
                }
                guard let accessToken = param("accessToken"),
                      let refreshToken = param("refreshToken"),
                      let userId = param("userId"),
                      let email = param("email") else {
                    self.errorMessage = "Google-Anmeldung: Ungültige Antwort."
                    continuation.resume(returning: false)
                    return
                }
                let name = param("name")?.nonEmpty
                let user = User(id: userId, email: email, name: name, role: .user)
                let fakeResponse = AuthResponse(user: user, accessToken: accessToken, refreshToken: refreshToken)
                self.persist(fakeResponse)
                continuation.resume(returning: true)
            }
            session.presentationContextProvider = PresentationAnchorProvider(anchor: presentationAnchor)
            session.prefersEphemeralWebBrowserSession = false
            session.start()
        }
    }

    private func persist(_ response: AuthResponse) {
        let accountId = response.user.id
        KeychainStore.set(response.accessToken, for: .accessToken, account: accountId)
        KeychainStore.set(response.refreshToken, for: .refreshToken, account: accountId)

        if let serverURL = ServerConfig.baseURL {
            AccountsStore.upsert(SavedAccount(id: accountId, email: response.user.email, serverURL: serverURL))
        }
        AccountsStore.activeAccountId = accountId
        savedAccounts = AccountsStore.accounts

        currentUser = response.user
        Task { await ensureApiKey(account: accountId) }
    }

    private func ensureApiKey(account: String) async {
        guard KeychainStore.get(.apiKey, account: account) == nil else { return }
        struct Body: Encodable { let name: String }
        guard let created: CreatedApiKey = try? await APIClient.shared.request(
            "/auth/api-keys", method: "POST", body: Body(name: UIDevice.current.name)
        ) else { return }
        KeychainStore.set(created.key, for: .apiKey, account: account)
    }
}

// Adapts a UIWindow to ASWebAuthenticationPresentationContextProviding.
private final class PresentationAnchorProvider: NSObject, ASWebAuthenticationPresentationContextProviding {
    private let anchor: ASPresentationAnchor
    init(anchor: ASPresentationAnchor) { self.anchor = anchor }
    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor { anchor }
}

private extension String {
    var nonEmpty: String? { isEmpty ? nil : self }
}
