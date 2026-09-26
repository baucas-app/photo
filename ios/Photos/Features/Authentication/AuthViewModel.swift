import Foundation
import UIKit

@MainActor
final class AuthViewModel: ObservableObject {
    @Published var currentUser: User?
    @Published var isLoading = true
    @Published var errorMessage: String?

    private struct AuthResponse: Decodable {
        let user: User
        let accessToken: String
        let refreshToken: String
    }

    func bootstrap() async {
        defer { isLoading = false }
        guard ServerConfig.baseURL != nil, KeychainStore.get(.accessToken) != nil else { return }
        do {
            currentUser = try await APIClient.shared.request("/auth/me")
            await ensureApiKey()
        } catch {
            KeychainStore.clearAll()
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

    func logout() {
        KeychainStore.clearAll()
        currentUser = nil
    }

    private func persist(_ response: AuthResponse) {
        KeychainStore.set(response.accessToken, for: .accessToken)
        KeychainStore.set(response.refreshToken, for: .refreshToken)
        currentUser = response.user
        Task { await ensureApiKey() }
    }

    private func ensureApiKey() async {
        guard KeychainStore.get(.apiKey) == nil else { return }
        struct Body: Encodable { let name: String }
        guard let created: CreatedApiKey = try? await APIClient.shared.request(
            "/auth/api-keys", method: "POST", body: Body(name: UIDevice.current.name)
        ) else { return }
        KeychainStore.set(created.key, for: .apiKey)
    }
}
