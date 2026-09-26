import ActivityKit
import SwiftUI
import WidgetKit

struct BackupActivityWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: BackupActivityAttributes.self) { context in
            LockScreenBackupView(state: context.state)
                .activityBackgroundTint(.black.opacity(0.8))
                .activitySystemActionForegroundColor(.white)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Image(systemName: "icloud.and.arrow.up")
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Text("\(context.state.uploadedCount)/\(context.state.totalCount)")
                        .font(.caption.monospacedDigit())
                }
                DynamicIslandExpandedRegion(.bottom) {
                    ProgressView(value: context.state.progress)
                        .tint(.white)
                }
            } compactLeading: {
                Image(systemName: "icloud.and.arrow.up")
            } compactTrailing: {
                Text("\(Int(context.state.progress * 100))%")
                    .font(.caption2.monospacedDigit())
            } minimal: {
                Image(systemName: "icloud.and.arrow.up")
            }
        }
    }
}

private struct LockScreenBackupView: View {
    let state: BackupActivityAttributes.ContentState

    var body: some View {
        HStack {
            Image(systemName: "icloud.and.arrow.up")
                .foregroundStyle(.white)
            VStack(alignment: .leading, spacing: 4) {
                Text("Fotos werden gesichert")
                    .font(.headline)
                    .foregroundStyle(.white)
                ProgressView(value: state.progress)
                    .tint(.white)
            }
            Spacer()
            Text("\(state.uploadedCount)/\(state.totalCount)")
                .font(.caption.monospacedDigit())
                .foregroundStyle(.white.opacity(0.8))
        }
        .padding()
    }
}
