import SwiftUI

/// Bottom thumbnail strip of the full-screen viewer, modelled on the one in
/// Apple's Photos app:
///
/// - Neighbour thumbnails are narrow, portrait-cropped slivers packed almost
///   edge to edge (1–2 pt gap).
/// - The item in the centre is expanded to its real aspect ratio and gets a
///   little extra breathing room on both sides.
/// - The strip holds no scroll state of its own. It is a pure function of a
///   fractional `progress` (2.4 = 40 % of the way from photo 2 to photo 3),
///   so while the main pager is being swiped, the width of the outgoing item
///   shrinks and the incoming one grows in lock-step with the finger.
/// - While the user scrubs the strip itself, every item collapses to the
///   narrow size (`expansion` → 0). The parent then flips the main photo
///   live to whatever sits under the centre, and on release the landing
///   thumbnail springs back open.
///
/// `expansion` is `Animatable`, so SwiftUI re-runs the layout maths for every
/// animation frame instead of just cross-fading between two end frames.
struct FilmstripView: View, Animatable {
    let assets: [Asset]
    /// Fractional index of the item that sits in the centre of the strip.
    let progress: CGFloat
    /// 1 = centre item shown at full aspect ratio, 0 = all items narrow.
    var expansion: CGFloat

    /// Called with the drag translation (in points) while the user scrubs.
    var onScrubChanged: (_ translation: CGFloat) -> Void
    /// Called when the user lifts their finger, with the predicted end
    /// translation (for momentum).
    var onScrubEnded: (_ predictedTranslation: CGFloat) -> Void
    /// Tap on a single thumbnail.
    var onSelect: (_ index: Int) -> Void

    nonisolated var animatableData: CGFloat {
        get { expansion }
        set { expansion = newValue }
    }

    static let itemHeight: CGFloat = 40
    static let narrowWidth: CGFloat = 22
    static let spacing: CGFloat = 2
    static let focusGap: CGFloat = 8
    static let maxWidth: CGFloat = 80
    static let cornerRadius: CGFloat = 3
    /// Distance the finger has to travel to move the strip by one item.
    static var stride: CGFloat { narrowWidth + spacing }

    @State private var isDragging = false

    var body: some View {
        GeometryReader { geo in
            let layout = StripLayout(assets: assets, progress: progress, expansion: expansion)
            let range = layout.visibleRange(width: geo.size.width)
            ZStack(alignment: .topLeading) {
                ForEach(range, id: \.self) { index in
                    let asset = assets[index]
                    CachedThumbnail(assetId: asset.id, url: APIClient.thumbnailURL(for: asset))
                        .frame(width: layout.width(of: index), height: Self.itemHeight)
                        .clipShape(RoundedRectangle(cornerRadius: Self.cornerRadius))
                        .position(
                            x: layout.screenCenter(of: index, stripWidth: geo.size.width),
                            y: geo.size.height / 2
                        )
                        .id(asset.id)
                }
            }
            .frame(width: geo.size.width, height: geo.size.height)
            .contentShape(Rectangle())
            .gesture(scrubGesture(layout: layout, stripWidth: geo.size.width))
        }
        .frame(height: Self.itemHeight + Spacing.sm * 2)
        .accessibilityElement()
        .accessibilityLabel("Filmstreifen")
        .accessibilityValue("Foto \(Int(progress.rounded()) + 1) von \(assets.count)")
        .accessibilityAdjustableAction { direction in
            let current = Int(progress.rounded())
            switch direction {
            case .increment: onSelect(min(current + 1, assets.count - 1))
            case .decrement: onSelect(max(current - 1, 0))
            @unknown default: break
            }
        }
    }

    /// One gesture for both tap and scrub: a scrub only starts after a few
    /// points of horizontal travel, so a plain tap never collapses the strip.
    private func scrubGesture(layout: StripLayout, stripWidth: CGFloat) -> some Gesture {
        DragGesture(minimumDistance: 0)
            .onChanged { value in
                if !isDragging, abs(value.translation.width) > 4 {
                    isDragging = true
                }
                if isDragging { onScrubChanged(value.translation.width) }
            }
            .onEnded { value in
                if isDragging {
                    isDragging = false
                    onScrubEnded(value.predictedEndTranslation.width)
                } else if let index = layout.index(atScreenX: value.location.x, stripWidth: stripWidth) {
                    onSelect(index)
                }
            }
    }
}

/// Pure layout maths for the strip, see `FilmstripView` for the behaviour.
private struct StripLayout {
    let assets: [Asset]
    let expansion: CGFloat
    /// Lower / upper neighbour of the fractional progress and the blend
    /// factor between them.
    let lower: Int
    let upper: Int
    let fraction: CGFloat

    init(assets: [Asset], progress: CGFloat, expansion: CGFloat) {
        self.assets = assets
        self.expansion = expansion
        let maxIndex = CGFloat(max(assets.count - 1, 0))
        let clamped = min(max(progress, 0), maxIndex)
        lower = Int(clamped.rounded(.down))
        upper = min(lower + 1, max(assets.count - 1, 0))
        fraction = upper == lower ? 0 : clamped - CGFloat(lower)
    }

    private typealias S = FilmstripView

    /// Width of the item when fully expanded, i.e. its real aspect ratio.
    private func fullWidth(of index: Int) -> CGFloat {
        let asset = assets[index]
        guard let w = asset.width, let h = asset.height, w > 0, h > 0 else { return S.itemHeight }
        return min(max(S.itemHeight * CGFloat(w) / CGFloat(h), S.narrowWidth), S.maxWidth)
    }

    /// How "open" an item is (0...1). Only the two items around the current
    /// progress can be open; their weights cross-fade with the progress.
    private func weight(of index: Int) -> CGFloat {
        var w: CGFloat = 0
        if index == lower { w += 1 - fraction }
        if index == upper, upper != lower { w += fraction }
        return w * expansion
    }

    func width(of index: Int) -> CGFloat {
        S.narrowWidth + (fullWidth(of: index) - S.narrowWidth) * weight(of: index)
    }

    private func gapExtra(of index: Int) -> CGFloat {
        (S.focusGap - S.spacing) * weight(of: index)
    }

    /// Centre of an item in content coordinates (item 0 starts at x = 0).
    private func contentCenter(of index: Int) -> CGFloat {
        var extraBefore: CGFloat = 0
        for j in Set([lower, upper]) where j < index {
            extraBefore += (width(of: j) - S.narrowWidth) + 2 * gapExtra(of: j)
        }
        let left = CGFloat(index) * S.stride + extraBefore + gapExtra(of: index)
        return left + width(of: index) / 2
    }

    /// The content x that is pinned to the middle of the screen: blends
    /// between the centres of the two neighbouring items.
    private var focus: CGFloat {
        guard !assets.isEmpty else { return 0 }
        return contentCenter(of: lower) * (1 - fraction) + contentCenter(of: upper) * fraction
    }

    func screenCenter(of index: Int, stripWidth: CGFloat) -> CGFloat {
        stripWidth / 2 + contentCenter(of: index) - focus
    }

    func visibleRange(width: CGFloat) -> [Int] {
        guard !assets.isEmpty else { return [] }
        let half = Int(width / 2 / S.stride) + 3
        return Array(max(0, lower - half)...min(assets.count - 1, upper + half))
    }

    func index(atScreenX x: CGFloat, stripWidth: CGFloat) -> Int? {
        let candidates = visibleRange(width: stripWidth)
        return candidates.min { a, b in
            abs(screenCenter(of: a, stripWidth: stripWidth) - x) < abs(screenCenter(of: b, stripWidth: stripWidth) - x)
        }
    }
}
