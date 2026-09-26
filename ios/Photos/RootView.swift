import SwiftUI

struct RootView: View {
    @EnvironmentObject private var auth: AuthViewModel
    @State private var serverConfigured = ServerConfig.baseURL != nil

    var body: some View {
        Group {
            if !serverConfigured {
                ServerSetupView { serverConfigured = true }
            } else if auth.isLoading {
                ProgressView()
            } else if auth.currentUser == nil {
                LoginView()
            } else {
                MainTabView()
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
