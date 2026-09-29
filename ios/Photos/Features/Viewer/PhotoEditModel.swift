import CoreGraphics
import Foundation

/// Body of `POST /assets/:id/edit`. nil fields are omitted by the synthesized
/// `Encodable` (encodeIfPresent), which is what the backend expects.
struct PhotoEditRequest: Encodable, Equatable {
    struct Crop: Encodable, Equatable {
        let left: Int
        let top: Int
        let width: Int
        let height: Int
    }

    var rotate: Int?
    var crop: Crop?
    var brightness: Int?
    var contrast: Int?

    var isEmpty: Bool { rotate == nil && crop == nil && brightness == nil && contrast == nil }
}

/// The edit the server currently has applied to an asset, remembered per
/// device and account.
///
/// Why this exists: the backend always re-renders from the untouched
/// original ("nicht kumulativ"), but the app can only download the *current*
/// (already edited) file. When a photo is edited a second time, the editor
/// shows the edited image and the user's new crop/rotation are relative to
/// *that* - so they are composed with this record into one operation set
/// against the original before being sent. Without a record (never edited on
/// this device) the downloaded file is treated as the original.
struct PhotoEditRecord: Codable, Equatable {
    /// Upright pixel size of the original file.
    var originalWidth: Double
    var originalHeight: Double
    /// Crop in original upright pixels, applied before the rotation.
    var crop: CGRect?
    /// Clockwise quarter turns (0...3), applied after the crop.
    var quarterTurns: Int
    var brightness: Double
    var contrast: Double

    static func identity(width: Double, height: Double) -> PhotoEditRecord {
        PhotoEditRecord(originalWidth: width, originalHeight: height, crop: nil, quarterTurns: 0, brightness: 0, contrast: 0)
    }

    var isIdentity: Bool { crop == nil && quarterTurns == 0 && brightness == 0 && contrast == 0 }

    /// Pixel size of the image this record produces.
    var resultSize: CGSize {
        let base = crop?.size ?? CGSize(width: originalWidth, height: originalHeight)
        return quarterTurns % 2 == 0 ? base : CGSize(width: base.height, height: base.width)
    }

    /// Stacks an edit made on the *rendered* image on top of this one.
    ///
    /// - Parameters:
    ///   - sourceCrop: normalized crop within the rendered image, before
    ///     `turns` (nil / full rect = no crop).
    ///   - turns: additional clockwise quarter turns.
    ///   - brightness, contrast: -100...100 relative to the rendered image.
    func composing(sourceCrop: CGRect?, turns: Int, brightness: Double, contrast: Double) -> PhotoEditRecord {
        var result = self
        let region = crop ?? CGRect(x: 0, y: 0, width: originalWidth, height: originalHeight)

        if let sourceCrop, !NormalizedRect.isFull(sourceCrop) {
            // Rendered image = region rotated by `quarterTurns`; undo that
            // rotation to express the new crop inside `region`.
            let inRegion = NormalizedRect.rotated(sourceCrop, clockwiseTurns: -quarterTurns)
            var pixels = CGRect(
                x: region.minX + inRegion.minX * region.width,
                y: region.minY + inRegion.minY * region.height,
                width: inRegion.width * region.width,
                height: inRegion.height * region.height
            ).integral
            pixels = pixels.intersection(CGRect(x: 0, y: 0, width: originalWidth, height: originalHeight))
            if pixels.width >= 1, pixels.height >= 1 { result.crop = pixels }
        }
        if let crop = result.crop,
           crop.minX <= 0.5, crop.minY <= 0.5,
           crop.width >= originalWidth - 1, crop.height >= originalHeight - 1 {
            result.crop = nil
        }

        result.quarterTurns = ((quarterTurns + turns) % 4 + 4) % 4
        // brightness is a lightness multiplier (1 + b/100) and contrast a
        // factor around mid-grey (1 + c/100) - both compose by multiplying.
        result.brightness = Self.composeFactor(self.brightness, brightness)
        result.contrast = Self.composeFactor(self.contrast, contrast)
        return result
    }

    private static func composeFactor(_ a: Double, _ b: Double) -> Double {
        let factor = (1 + a / 100) * (1 + b / 100)
        let value = ((factor - 1) * 100).rounded()
        return min(max(value, -100), 100)
    }

    var request: PhotoEditRequest {
        PhotoEditRequest(
            rotate: [nil, 90, 180, 270][quarterTurns],
            crop: crop.map { .init(left: Int($0.minX), top: Int($0.minY), width: Int($0.width), height: Int($0.height)) },
            brightness: brightness == 0 ? nil : Int(brightness),
            contrast: contrast == 0 ? nil : Int(contrast)
        )
    }

    // MARK: Persistence

    private static func key(_ assetId: String) -> String {
        "photos.edit.\(AccountsStore.activeAccountId ?? "default").\(assetId)"
    }

    static func load(assetId: String) -> PhotoEditRecord? {
        guard let data = UserDefaults.standard.data(forKey: key(assetId)) else { return nil }
        return try? JSONDecoder().decode(PhotoEditRecord.self, from: data)
    }

    func save(assetId: String) {
        guard let data = try? JSONEncoder().encode(self) else { return }
        UserDefaults.standard.set(data, forKey: Self.key(assetId))
    }

    static func remove(assetId: String) {
        UserDefaults.standard.removeObject(forKey: key(assetId))
    }
}

/// Helpers for rects in unit coordinates (0...1 on both axes).
enum NormalizedRect {
    static let full = CGRect(x: 0, y: 0, width: 1, height: 1)

    static func isFull(_ rect: CGRect, tolerance: CGFloat = 0.002) -> Bool {
        rect.minX <= tolerance && rect.minY <= tolerance
            && rect.maxX >= 1 - tolerance && rect.maxY >= 1 - tolerance
    }

    /// The same region after the whole image is rotated clockwise by
    /// `turns` quarter turns (negative = counter-clockwise).
    static func rotated(_ rect: CGRect, clockwiseTurns turns: Int) -> CGRect {
        var result = rect
        for _ in 0..<((turns % 4 + 4) % 4) {
            // (x, y) -> (1 - y, x)
            result = CGRect(x: 1 - result.maxY, y: result.minX, width: result.height, height: result.width)
        }
        return result
    }

    /// Largest centred rect with the given pixel aspect ratio inside an image
    /// of pixel aspect `imageAspect`.
    static func centered(aspect: CGFloat, imageAspect: CGFloat) -> CGRect {
        if aspect > imageAspect {
            let height = imageAspect / aspect
            return CGRect(x: 0, y: (1 - height) / 2, width: 1, height: height)
        } else {
            let width = aspect / imageAspect
            return CGRect(x: (1 - width) / 2, y: 0, width: width, height: 1)
        }
    }
}
