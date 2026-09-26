import Foundation
import Security

/// Thin wrapper around the Keychain for the handful of secrets the app needs
/// to persist across launches. UserDefaults would leak these into backups
/// and simulator plists, so the Keychain is the only appropriate place.
enum KeychainStore {
    private static let service = "de.baucas.photos"

    enum Key: String {
        case accessToken
        case refreshToken
        case apiKey
        case activeAccountId
    }

    static func set(_ value: String, for key: Key, account: String = "default") {
        let data = Data(value.utf8)
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: "\(account).\(key.rawValue)",
        ]
        SecItemDelete(query as CFDictionary)

        var attributes = query
        attributes[kSecValueData as String] = data
        SecItemAdd(attributes as CFDictionary, nil)
    }

    static func get(_ key: Key, account: String = "default") -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: "\(account).\(key.rawValue)",
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]

        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        guard status == errSecSuccess, let data = result as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    static func remove(_ key: Key, account: String = "default") {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: "\(account).\(key.rawValue)",
        ]
        SecItemDelete(query as CFDictionary)
    }

    static func clearAll(account: String = "default") {
        remove(.accessToken, account: account)
        remove(.refreshToken, account: account)
        remove(.apiKey, account: account)
    }
}
