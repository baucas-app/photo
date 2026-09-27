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

    func login(email: String, password: String) async {
        errorMessage = nil
        do {
            struct Body: Encodable { let email: String; let password: String }
            let response: AuthResponse = try await APIClient.shared.request(
                "/auth/login", method: "POST", body: Body(email: email, password: password), authenticated: false
            )
            persist(response)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func register(email: String, password: String, name: String?) async {
        errorMessage = nil
        do {
            struct Body: Encodable { let email: String; let password: String; let name: String? }
            let response: AuthResponse = try await APIClient.shared.request(
                "/auth/register", method: "POST", body: Body(email: email, password: password, name: name),
                authenticated: false
            )
            persist(response)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    /// Signs out of the active account entirely: removes its tokens and its
    /// entry in the account switcher. To just step away and add a different
    /// account without losing this one, use `addAccount()` instead.
    func logout() {
        guard let accountId = AccountsStore.activeAccountId else {
            currentUser = nil
            return
        }
        AccountsStore.remove(accountId)
        savedAccounts = AccountsStore.accounts
        currentUser = nil
    }

    /// Leaves the current account's credentials untouched but clears the
    /// active session, so RootView falls back to the server/login flow for
    /// a second account. Switch back via `switchAccount`.
    func addAccount() {
        AccountsStore.activeAccountId = nil
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
