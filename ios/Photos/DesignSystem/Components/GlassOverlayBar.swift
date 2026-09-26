import SwiftUI

/// A row of icon buttons floating over media content (photo viewer top/bottom
/// bars), rendered as Liquid Glass per Apple's iOS 26 HIG: glass is reserved
/// for controls that float over content, not for backgrounds or full panels.
/// GlassEffectContainer lets the individual buttons morph together instead of
/// each one being computed as an isolated glass layer.
struct GlassOverlayBar<Content: View>: View {
    @ViewBuilder var content: Content

    var body: some View {
        GlassEffectContainer(spacing: Spacing.sm) {
            HStack(spacing: Spacing.sm) {
                content
            }
            .padding(.horizontal, Spacing.md)
            .padding(.vertical, Spacing.sm)
        }
    }
}

struct GlassIconButton: View {
    let systemImage: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: systemImage)
                .font(.system(size: 17, weight: .medium))
                .frame(width: 40, height: 40)
        }
        .buttonStyle(.glass)
    }
}

/// Floating action button (e.g. "new album") using the interactive glass
/// variant so it visibly responds to touch, as Apple recommends for
/// tappable floating controls.
struct GlassFloatingActionButton: View {
    let systemImage: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: systemImage)
                .font(.system(size: 20, weight: .semibold))
                .frame(width: 56, height: 56)
        }
        .buttonStyle(.glass)
        .tint(.accentColor)
    }
}
