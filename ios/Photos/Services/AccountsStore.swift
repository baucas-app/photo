import Foundation

/// A device can hold several signed-in accounts (possibly on different
/// servers) at once - Gmail-style quick switching, not just single
/// login/logout. `id` is the backend's own User.id, which doubles as the
/// KeychainStore `account` namespace for that account's tokens.
struct SavedAccount: Codable, Identifiable, Equatable {
    let id: String
    let email: String
    let serverURL: URL
}

/// Non-secret account metadata (id/email/server) lives in UserDefaults;
/// the actual tokens for each account stay in KeychainStore, namespaced by
/// SavedAccount.id.
enum AccountsStore {
    private static let accountsKey = "photos.accounts"
    private static let activeAccountIdKey = "photos.activeAccountId"

    static var accounts: [SavedAccount] {
        get {
            guard let data = UserDefaults.standard.data(forKey: accountsKey),
                  let decoded = try? JSONDecoder().decode([SavedAccount].self, from: data)
            else { return [] }
            return decoded
        }
        set {
            let data = try? JSONEncoder().encode(newValue)
            UserDefaults.standard.set(data, forKey: accountsKey)
        }
    }

    static var activeAccountId: String? {
        get { UserDefaults.standard.string(forKey: activeAccountIdKey) }
        set { UserDefaults.standard.set(newValue, forKey: activeAccountIdKey) }
    }

    static var activeAccount: SavedAccount? {
        guard let id = activeAccountId else { return nil }
        return accounts.first { $0.id == id }
    }

    static func upsert(_ account: SavedAccount) {
        var all = accounts
        if let index = all.firstIndex(where: { $0.id == account.id }) {
            all[index] = account
        } else {
            all.append(account)
        }
        accounts = all
    }

    /// Fully removes an account from the device: its saved metadata and
    /// every Keychain entry under its namespace. If it was the active one,
    /// there's no active account left until something else is chosen.
    static func remove(_ id: String) {
        accounts.removeAll { $0.id == id }
        KeychainStore.clearAll(account: id)
        if activeAccountId == id {
            activeAccountId = nil
        }
    }
}
