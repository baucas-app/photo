import SwiftUI

// Pinch-to-zoom for the Mediathek grid, modelled on Apple's Photos app:
//
// * The grid has a few discrete zoom tiers (1/3/5/7 columns on iPhone).
// * While pinching, every visible cell's frame is interpolated between the
//   two tiers bracketing the current pinch scale, so tiles grow/shrink and
//   re-flow continuously under the fingers. The row under the fingers stays
//   put vertically (the grid itself stays edge-to-edge horizontally).
// * On release the grid springs to the nearest tier (a small pinch is enough
//   to move one tier in the pinch direction), then hands back to the real
//   LazyVGrid with the scroll offset shifted by exactly what the focal photo
//   moved, so the switch is invisible.
//
// A LazyVGrid cannot animate a column-count change, so during the gesture it
// is hidden and a lightweight overlay draws only the visible slice.

/// Pure layout math for a square-cell grid of a given width.
struct TimelineGridMetrics: Equatable {
    var width: CGFloat
    var spacing: CGFloat

    func cellSize(columns: Int) -> CGFloat {
        let n = CGFloat(max(columns, 1))
        return max(1, (width - (n - 1) * spacing) / n)
    }

    func pitch(columns: Int) -> CGFloat {
        cellSize(columns: columns) + spacing
    }

    func frame(index: Int, columns: Int) -> CGRect {
        let n = max(columns, 1)
        let size = cellSize(columns: n)
        let pitch = size + spacing
        return CGRect(
            x: CGFloat(index % n) * pitch,
            y: CGFloat(index / n) * pitch,
            width: size,
            height: size
        )
    }

    func contentHeight(count: Int, columns: Int) -> CGFloat {
        guard count > 0 else { return 0 }
        let n = max(columns, 1)
        let rows = (count + n - 1) / n
        return CGFloat(rows) * pitch(columns: n) - spacing
    }
}

enum TimelineGridTiers {
    static let spacing: CGFloat = 2

    /// Column counts, ascending (index 0 = biggest tiles).
    static func tiers(forWidth width: CGFloat) -> [Int] {
        width < 600 ? [1, 3, 5, 7] : [3, 5, 7, 9, 12]
    }

    /// Tier index for a stored column count; 0 means "automatic".
    static func tierIndex(forColumns columns: Int, width: CGFloat) -> Int {
        let tiers = tiers(forWidth: width)
        let wanted = columns > 0 ? columns : max(1, Int(width / 110))
        let fallback = columns > 0 ? 0 : tiers.firstIndex(of: 3) ?? 0
        guard width > 0 || columns > 0 else { return fallback }
        return tiers.indices.min { abs(tiers[$0] - wanted) < abs(tiers[$1] - wanted) } ?? fallback
    }
}

/// State of one pinch, from the first touch until the hand-back to the grid.
struct TimelinePinchSession {
    let tiers: [Int]
    let metrics: TimelineGridMetrics
    let startTier: Int
    let focalIndex: Int
    /// Where inside the focal cell (0...1, vertically) the fingers started.
    let focalUnitY: CGFloat

    /// Current finger centroid, in grid coordinates.
    var anchor: CGPoint
    /// Fractional tier index (e.g. 1.4 = 40 % of the way from tier 1 to 2).
    var position: CGFloat
    /// Vertical translation of the whole interpolated grid.
    var shiftY: CGFloat = 0
    /// Rubber-band scale when pinching past the first/last tier.
    var rubber: CGFloat = 1
    var isSettling = false
    var settleRange: Range<Int>?

    init?(location: CGPoint, columns: Int, count: Int, width: CGFloat) {
        guard count > 0, width > 0 else { return nil }
        let tiers = TimelineGridTiers.tiers(forWidth: width)
        let metrics = TimelineGridMetrics(width: width, spacing: TimelineGridTiers.spacing)
        let start = tiers.firstIndex(of: columns) ?? TimelineGridTiers.tierIndex(forColumns: columns, width: width)
        let n = tiers[start]
        let pitch = metrics.pitch(columns: n)
        let column = min(max(Int(location.x / pitch), 0), n - 1)
        let row = max(Int((location.y / pitch).rounded(.down)), 0)
        let focal = min(row * n + column, count - 1)
        let focalFrame = metrics.frame(index: focal, columns: n)

        self.tiers = tiers
        self.metrics = metrics
        self.startTier = start
        self.focalIndex = focal
        self.focalUnitY = (location.y - focalFrame.minY) / focalFrame.height
        self.anchor = location
        self.position = CGFloat(start)
    }

    private var lowerTier: Int { min(Int(position.rounded(.down)), tiers.count - 1) }
    private var upperTier: Int { min(lowerTier + 1, tiers.count - 1) }
    private var progress: CGFloat { position - CGFloat(lowerTier) }

    /// Unshifted frame of `index`, interpolated between the bracketing tiers.
    func interpolatedFrame(index: Int) -> CGRect {
        let a = metrics.frame(index: index, columns: tiers[lowerTier])
        let b = metrics.frame(index: index, columns: tiers[upperTier])
        let t = progress
        return CGRect(
            x: a.minX + (b.minX - a.minX) * t,
            y: a.minY + (b.minY - a.minY) * t,
            width: a.width + (b.width - a.width) * t,
            height: a.height + (b.height - a.height) * t
        )
    }

    /// Frame to draw `index` at in the overlay (grid coordinates).
    func displayFrame(index: Int) -> CGRect {
        interpolatedFrame(index: index).offsetBy(dx: 0, dy: shiftY)
    }

    /// Feed a new pinch scale (1 = unchanged) and finger centroid.
    mutating func update(scale: CGFloat, location: CGPoint) {
        anchor = location
        let desired = metrics.cellSize(columns: tiers[startTier]) * max(scale, 0.01)
        let biggest = metrics.cellSize(columns: tiers[0])
        let smallest = metrics.cellSize(columns: tiers[tiers.count - 1])

        if desired >= biggest {
            position = 0
            rubber = min(pow(desired / biggest, 0.2), 1.12)
        } else if desired <= smallest {
            position = CGFloat(tiers.count - 1)
            rubber = max(pow(desired / smallest, 0.2), 0.9)
        } else {
            rubber = 1
            for k in 0..<(tiers.count - 1) {
                let ca = metrics.cellSize(columns: tiers[k])
                let cb = metrics.cellSize(columns: tiers[k + 1])
                if desired <= ca && desired >= cb {
                    position = CGFloat(k) + (ca - desired) / (ca - cb)
                    break
                }
            }
        }
        shiftY = focalShift()
    }

    /// Translation that keeps the focal photo's pinch point under the fingers.
    func focalShift() -> CGFloat {
        let f = interpolatedFrame(index: focalIndex)
        return anchor.y - (f.minY + focalUnitY * f.height)
    }

    /// Tier to settle on after release. Always one of the two bracketing
    /// tiers, so the spring interpolates exactly along the pinch path.
    func settleTarget(velocity: CGFloat) -> Int {
        let lower = Int(position.rounded(.down))
        let upper = min(Int(position.rounded(.up)), tiers.count - 1)
        var target = Int(position.rounded())
        if target == startTier {
            if position < CGFloat(startTier) - 0.12 { target = startTier - 1 }
            if position > CGFloat(startTier) + 0.12 { target = startTier + 1 }
        }
        // Flicks: velocity > 0 = fingers spreading = bigger tiles.
        if velocity > 1.2 { target = lower }
        if velocity < -1.2 { target = upper }
        return min(max(target, lower), upper)
    }

    /// Contiguous index range whose (interpolated) frames can touch `rect`.
    func visibleRange(in rect: CGRect, count: Int) -> Range<Int> {
        guard count > 0 else { return 0..<0 }
        var first = Int.max
        var last = Int.min
        for columns in [tiers[lowerTier], tiers[upperTier]] {
            let pitch = metrics.pitch(columns: columns)
            let top = rect.minY - shiftY
            let bottom = rect.maxY - shiftY
            let firstRow = max(Int((top / pitch).rounded(.down)), 0)
            let lastRow = max(Int((bottom / pitch).rounded(.down)), 0)
            first = min(first, firstRow * columns)
            last = max(last, (lastRow + 1) * columns - 1)
        }
        let lo = min(max(first, 0), count)
        let hi = min(max(last + 1, lo), count)
        return lo..<hi
    }

    func visibleIndices(in rect: CGRect, count: Int) -> [Int] {
        if let settleRange {
            return Array(settleRange.clamped(to: 0..<count))
        }
        return visibleRange(in: rect, count: count).filter { displayFrame(index: $0).intersects(rect) }
    }
}

/// Holds the latest scroll metrics without invalidating the view on every
/// scroll frame (only the pinch code reads them).
@MainActor
final class TimelineScrollBox {
    struct PendingHandBack {
        /// Where the grid's top edge must sit, in global coordinates.
        var gridTopOnScreen: CGFloat
        var contentHeight: CGFloat
        let deadline = Date().addingTimeInterval(0.5)
    }

    var snapshot: TimelineScrollSnapshot?
    /// The ScrollView's own (safe-area) frame in global coordinates.
    var viewportFrame: CGRect = .zero
    var pendingHandBack: PendingHandBack?
}

struct TimelineScrollSnapshot: Equatable {
    var contentOffsetY: CGFloat
    var insetTop: CGFloat
    var insetBottom: CGFloat
    var contentHeight: CGFloat
    var containerHeight: CGFloat
    var visibleRect: CGRect

    init(_ geometry: ScrollGeometry) {
        contentOffsetY = geometry.contentOffset.y
        insetTop = geometry.contentInsets.top
        insetBottom = geometry.contentInsets.bottom
        contentHeight = geometry.contentSize.height
        containerHeight = geometry.containerSize.height
        visibleRect = geometry.visibleRect
    }
}

/// UIKit pinch recognizer bridged into SwiftUI so we get a continuous finger
/// centroid and can recognise alongside the scroll view's own gestures.
struct TimelinePinchGesture: UIGestureRecognizerRepresentable {
    enum Phase { case began, changed, ended }

    /// (phase, scale, centroid in the attached view's local space, velocity)
    let action: (Phase, CGFloat, CGPoint, CGFloat) -> Void

    func makeCoordinator(converter: CoordinateSpaceConverter) -> Coordinator {
        Coordinator()
    }

    func makeUIGestureRecognizer(context: Context) -> UIPinchGestureRecognizer {
        let recognizer = UIPinchGestureRecognizer()
        recognizer.delegate = context.coordinator
        return recognizer
    }

    func handleUIGestureRecognizerAction(_ recognizer: UIPinchGestureRecognizer, context: Context) {
        let location = context.converter.localLocation
        switch recognizer.state {
        case .began:
            action(.began, recognizer.scale, location, 0)
        case .changed:
            // With one finger lifted the centroid jumps; keep the last one.
            action(.changed, recognizer.scale, recognizer.numberOfTouches >= 2 ? location : CGPoint(x: CGFloat.nan, y: CGFloat.nan), recognizer.velocity)
        case .ended, .cancelled, .failed:
            action(.ended, recognizer.scale, location, recognizer.velocity)
        default:
            break
        }
    }

    final class Coordinator: NSObject, UIGestureRecognizerDelegate {
        func gestureRecognizer(
            _ gestureRecognizer: UIGestureRecognizer,
            shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer
        ) -> Bool { true }
    }
}
