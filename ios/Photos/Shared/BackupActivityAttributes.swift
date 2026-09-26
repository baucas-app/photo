import ActivityKit

/// Compiled into both the app and the PhotosWidgets extension (see
/// project.yml) - ActivityKit requires the same type on both sides to
/// decode the Live Activity's content state.
struct BackupActivityAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        var uploadedCount: Int
        var totalCount: Int
    }
}

extension BackupActivityAttributes.ContentState {
    var progress: Double {
        guard totalCount > 0 else { return 0 }
        return Double(uploadedCount) / Double(totalCount)
    }
}
