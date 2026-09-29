import SwiftUI

/// Small format/type indicators for a timeline grid tile (docs/DONE.md Teil
/// 7): RAW, Live Photo, 360°. Top-leading corner, like Apple Photos' own
/// grid badges.
struct TimelineTopBadges: View {
    let asset: Asset

    var body: some View {
        HStack(spacing: 3) {
            if asset.isRAW {
                Text("RAW")
                    .font(.system(size: 9, weight: .bold))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 4)
                    .padding(.vertical, 2)
                    .background(.black.opacity(0.55), in: RoundedRectangle(cornerRadius: 4, style: .continuous))
            }
            if asset.livePhotoVideoId != nil {
                Image(systemName: "livephoto")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(.white)
                    .shadow(color: .black.opacity(0.5), radius: 2)
            }
            if asset.is360 {
                Image(systemName: "pano.fill")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(.white)
                    .shadow(color: .black.opacity(0.5), radius: 2)
            }
        }
        .padding(5)
    }
}

/// Bottom-trailing "N photos in this stack" badge (docs/DONE.md Teil 7),
/// shown on a stack's leader tile - `stackCount` is the number of *other*
/// members, so the badge shows the stack's total size.
struct StackCountBadge: View {
    let count: Int

    var body: some View {
        Label("\(count + 1)", systemImage: "square.stack.fill")
            .font(.system(size: 11, weight: .semibold))
            .labelStyle(.titleAndIcon)
            .foregroundStyle(.white)
            .padding(.horizontal, 6)
            .padding(.vertical, 3)
            .glassEffect(.regular, in: Capsule())
            .padding(5)
    }
}

/// Top-trailing selection checkmark, shown on every tile while the timeline
/// grid's multi-select mode is active.
struct TimelineSelectionMarker: View {
    let isSelected: Bool

    var body: some View {
        Image(systemName: isSelected ? "checkmark.circle.fill" : "circle")
            .symbolRenderingMode(.palette)
            .foregroundStyle(.white, isSelected ? Color.accentColor : .black.opacity(0.35))
            .font(.system(size: 22))
            .shadow(color: .black.opacity(0.4), radius: 1)
            .padding(6)
    }
}
