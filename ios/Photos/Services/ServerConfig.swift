import Foundation

/// The server is self-hosted on the user's own NAS, so unlike a typical app
/// there's no fixed backend domain baked into the binary - the user enters
/// it once (Settings / onboarding) and it's kept in UserDefaults (not
/// secret, unlike the tokens in KeychainStore).
enum ServerConfig {
    private static let key = "photos.serverBaseURL"

    static var baseURL: URL? {
        get {
            guard let raw = UserDefaults.standard.string(forKey: key) else { return nil }
            return URL(string: raw)
        }
        set {
            UserDefaults.standard.set(newValue?.absoluteString, forKey: key)
        }
    }
}
