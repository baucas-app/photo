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
    let takenAt: Date?
    let uploadedAt: Date
    let isFavorite: Bool
    let isArchived: Bool

    var isVideo: Bool { mimeType?.hasPrefix("video/") == true }

    static func == (lhs: Asset, rhs: Asset) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }
}

struct AssetPage: Codable {
    let assets: [Asset]
    let nextCursor: String?
}
