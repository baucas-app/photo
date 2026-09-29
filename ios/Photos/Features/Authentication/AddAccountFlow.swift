import SwiftUI

private enum AddAccountRoute: Hashable {
    case login
}

/// Sheet-presented "add another account" flow, kept fully separate from
/// RootView's own auth NavigationStack so it never touches the currently
/// active session's `currentUser`/`activeAccountId` unless login/register
/// actually succeeds - see AuthViewModel.login/register's discardable Bool
/// return and SettingsView's "Weiteres Konto hinzufügen" button.
struct AddAccountFlow: View {
    @Environment(\.dismiss) private var dismiss
    @State private var path: [AddAccountRoute] = []
    // Held here rather than written to ServerConfig until the moment
    // login/register actually fires, so the still-active previous session's
    // in-flight requests (e.g. AdminView's ML-status polling) don't get
    // redirected to the not-yet-authenticated new server while this sheet
    // is still being filled in.
    @State private var pendingServerURL: URL?

    let previousServerURL: URL?
    let previousActiveAccountId: String?

    var body: some View {
        NavigationStack(path: $path) {
            ServerSetupView(onCancel: { dismiss() }, onConfigured: { url in
                pendingServerURL = url
                path = [.login]
            })
                .navigationDestination(for: AddAccountRoute.self) { route in
                    switch route {
                    case .login:
                        LoginView(candidateServerURL: pendingServerURL, onSuccess: { dismiss() })
                    }
                }
        }
        .onDisappear {
            // Cancelled, or login/register never completed: undo the
            // server-address edit so the still-active previous account
            // keeps talking to its own server. A successful add already
            // switched `activeAccountId` via AuthViewModel.persist(), so
            // leave ServerConfig pointed at the new account's server then.
            if AccountsStore.activeAccountId == previousActiveAccountId {
                ServerConfig.baseURL = previousServerURL
            }
        }
    }
}
