import Foundation

struct Asset: Codable, Identifiable, Equatable, Hashable {
    let id: String
    let filename: String
    let path: String
    let size: Int?
    let mimeType: String?
    let width: Int?
    let height: Int?
    let duration: Int?
    let cameraMake: String?
    let cameraModel: String?
    let lensModel: String?
    let iso: Int?
    let fNumber: Double?
    let exposureTime: Double?
    let focalLength: Double?
    let takenAt: Date?
    let uploadedAt: Date
    let isFavorite: Bool
    let isArchived: Bool
    let latitude: Double?
    let longitude: Double?

    /// Stapel (docs/DONE.md Teil 7): only present on `GET /assets` list
    /// responses (0 = kein Stapel, sonst Anzahl der *weiteren* Mitglieder -
    /// die Kachel selbst ist immer der Anführer). Missing on every other
    /// endpoint that returns a bare asset row (`GET /:id`, `PUT /:id`, the
    /// stack-members endpoint, ...), hence the default in `init(from:)`.
    let stackCount: Int
    /// Set on the (hidden) video half of a Live Photo pair - never true for
    /// anything shown in a list, but decoded anyway since the same `Asset`
    /// type also decodes that upload's own response.
    let isLivePhotoMotion: Bool
    /// Set on the still image of a Live Photo pair; points at the paired
    /// video's id (fetchable like any other asset via `/assets/:id/file`).
    let livePhotoVideoId: String?
    let is360: Bool
    /// OCR-extracted text, if pytesseract is installed in ml-service.
    let ocrText: String?
    /// Raw self-relation column: nil for a stack's leader (or an unstacked
    /// photo), otherwise the leader's id. Only meaningful when decoding
    /// `GET /assets/:id/stack`, which is the one place members ever appear
    /// individually - used there to tell the leader apart from its members.
    let stackParentId: String?

    var isVideo: Bool { mimeType?.hasPrefix("video/") == true }

    /// Camera RAW formats the backend decodes server-side via dcraw
    /// (backend/src/utils/mediaType.ts) - kept in sync with that list.
    private static let rawMimeTypes: Set<String> = [
        "image/x-adobe-dng",
        "image/x-canon-cr2",
        "image/x-canon-cr3",
        "image/x-nikon-nef",
        "image/x-sony-arw",
        "image/x-fuji-raf",
        "image/x-olympus-orf",
        "image/x-panasonic-rw2",
        "image/x-pentax-pef",
        "image/x-samsung-srw",
    ]
    var isRAW: Bool { mimeType.map { Self.rawMimeTypes.contains($0.lowercased()) } ?? false }

    static func == (lhs: Asset, rhs: Asset) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }

    private enum CodingKeys: String, CodingKey {
        case id, filename, path, size, mimeType, width, height, duration
        case cameraMake, cameraModel, lensModel, iso, fNumber, exposureTime, focalLength
        case takenAt, uploadedAt, isFavorite, isArchived, latitude, longitude
        case stackCount, isLivePhotoMotion, livePhotoVideoId, is360, ocrText, stackParentId
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        filename = try container.decode(String.self, forKey: .filename)
        path = try container.decode(String.self, forKey: .path)
        size = try container.decodeIfPresent(Int.self, forKey: .size)
        mimeType = try container.decodeIfPresent(String.self, forKey: .mimeType)
        width = try container.decodeIfPresent(Int.self, forKey: .width)
        height = try container.decodeIfPresent(Int.self, forKey: .height)
        duration = try container.decodeIfPresent(Int.self, forKey: .duration)
        cameraMake = try container.decodeIfPresent(String.self, forKey: .cameraMake)
        cameraModel = try container.decodeIfPresent(String.self, forKey: .cameraModel)
        lensModel = try container.decodeIfPresent(String.self, forKey: .lensModel)
        iso = try container.decodeIfPresent(Int.self, forKey: .iso)
        fNumber = try container.decodeIfPresent(Double.self, forKey: .fNumber)
        exposureTime = try container.decodeIfPresent(Double.self, forKey: .exposureTime)
        focalLength = try container.decodeIfPresent(Double.self, forKey: .focalLength)
        takenAt = try container.decodeIfPresent(Date.self, forKey: .takenAt)
        uploadedAt = try container.decode(Date.self, forKey: .uploadedAt)
        isFavorite = try container.decode(Bool.self, forKey: .isFavorite)
        isArchived = try container.decode(Bool.self, forKey: .isArchived)
        latitude = try container.decodeIfPresent(Double.self, forKey: .latitude)
        longitude = try container.decodeIfPresent(Double.self, forKey: .longitude)
        stackCount = try container.decodeIfPresent(Int.self, forKey: .stackCount) ?? 0
        isLivePhotoMotion = try container.decodeIfPresent(Bool.self, forKey: .isLivePhotoMotion) ?? false
        livePhotoVideoId = try container.decodeIfPresent(String.self, forKey: .livePhotoVideoId)
        is360 = try container.decodeIfPresent(Bool.self, forKey: .is360) ?? false
        ocrText = try container.decodeIfPresent(String.self, forKey: .ocrText)
        stackParentId = try container.decodeIfPresent(String.self, forKey: .stackParentId)
    }
}

struct AssetPage: Codable {
    let assets: [Asset]
    let nextCursor: String?
}
