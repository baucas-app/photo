import SwiftUI
import UserNotifications

@main
struct PhotosApp: App {
    @StateObject private var auth = AuthViewModel()
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate

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

// AppDelegate handles APNs token registration and foreground notification display.
// UIApplicationDelegate is @MainActor in iOS 26; UNUserNotificationCenterDelegate is not.
// Splitting the conformances with @preconcurrency suppresses the Swift 6 isolation error
// while keeping both delegates on the same object.
final class AppDelegate: NSObject, UIApplicationDelegate {
    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions _: [UIApplication.LaunchOptionsKey: Any]?
    ) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { granted, _ in
            guard granted else { return }
            DispatchQueue.main.async { application.registerForRemoteNotifications() }
        }
        return true
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        let token = deviceToken.map { String(format: "%02x", $0) }.joined()
        Task { await PushService.register(token: token) }
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        // Simulator kann sich nicht bei APNs registrieren – kein Fehler
    }
}

// @preconcurrency suppresses the actor-isolation cross-conformance error in Swift 6 –
// these delegate methods are always delivered on the main thread by UNUserNotificationCenter.
extension AppDelegate: @preconcurrency UNUserNotificationCenterDelegate {
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        completionHandler([.banner, .sound])
    }
}
