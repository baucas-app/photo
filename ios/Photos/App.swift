import SwiftUI

@main
struct PhotosApp: App {
    @StateObject private var auth = AuthViewModel()

    init() {
        BackupEngine.shared.registerBackgroundTask()
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(auth)
                .onAppear { BackupEngine.shared.scheduleNextBackgroundRun() }
        }
    }
}
