import SwiftUI

private enum SetupRoute: Hashable {
    case login
}

struct RootView: View {
    @EnvironmentObject private var auth: AuthViewModel
    // ServerSetupView is always the root of this stack; Login is pushed on
    // top of it so the standard back button lets people return and change
    // the server address - including on later launches, not just the first.
    @State private var path: [SetupRoute] = ServerConfig.baseURL != nil ? [.login] : []

    var body: some View {
        Group {
            if auth.isLoading {
                ProgressView()
            } else if auth.currentUser != nil {
                MainTabView()
            } else {
                NavigationStack(path: $path) {
                    ServerSetupView { path = [.login] }
                        .navigationDestination(for: SetupRoute.self) { route in
                            switch route {
                            case .login:
                                LoginView()
                            }
                        }
                }
            }
        }
        .task { await auth.bootstrap() }
    }
}

struct MainTabView: View {
    var body: some View {
        TabView {
            Tab("Mediathek", systemImage: "photo.on.rectangle.angled") {
                TimelineView()
            }
            Tab("Alben", systemImage: "rectangle.stack") {
                AlbumsView()
            }
            Tab("Suche", systemImage: "magnifyingglass") {
                SearchView()
            }
            Tab("Personen", systemImage: "person.crop.circle") {
                FacesView()
            }
            Tab("Einstellungen", systemImage: "gearshape") {
                SettingsView()
            }
        }
    }
}
