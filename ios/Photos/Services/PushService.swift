import Foundation

enum PushService {
    private struct TokenBody: Encodable {
        let token: String
        let platform: String
    }

    static func register(token: String) async {
        try? await APIClient.shared.requestVoid(
            "/push/register",
            method: "POST",
            body: TokenBody(token: token, platform: "ios")
        )
    }

    static func unregister(token: String) async {
        try? await APIClient.shared.requestVoid(
            "/push/register",
            method: "DELETE",
            body: TokenBody(token: token, platform: "ios")
        )
    }
}
