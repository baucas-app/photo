import Foundation

enum AlbumSortOrder: String, Codable, CaseIterable {
    case takenAtDesc    = "takenAt_desc"
    case takenAtAsc     = "takenAt_asc"
    case uploadedAtDesc = "uploadedAt_desc"
    case nameAsc        = "name_asc"

    var displayName: String {
        switch self {
        case .takenAtDesc:    return "Aufnahmedatum (neu → alt)"
        case .takenAtAsc:     return "Aufnahmedatum (alt → neu)"
        case .uploadedAtDesc: return "Hochladedatum (neu → alt)"
        case .nameAsc:        return "Dateiname (A → Z)"
        }
    }
}

struct Album: Codable, Identifiable, Equatable, Hashable {
    let id: String
    let name: String
    let description: String?
    let path: String
    let parentId: String?
    let coverAssetId: String?
    let pinned: Bool
    let sortOrder: AlbumSortOrder
    let isLocked: Bool

    // Stable identity and equality by id only - name/pinned/sortOrder can
    // change without affecting which album a NavigationLink points at.
    static func == (lhs: Album, rhs: Album) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }
}

struct AlbumDetail: Codable {
    let id: String
    let name: String
    let description: String?
    let path: String
    let parentId: String?
    let coverAssetId: String?
    let pinned: Bool
    let sortOrder: AlbumSortOrder
    let isLocked: Bool
    let children: [Album]
    let assets: [Asset]
    let nextCursor: String?
}
