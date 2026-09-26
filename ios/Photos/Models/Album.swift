import Foundation

struct Album: Codable, Identifiable, Equatable, Hashable {
    let id: String
    let name: String
    let description: String?
    let path: String
    let parentId: String?
    let coverAssetId: String?

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
    let children: [Album]
    let assets: [Asset]
    let nextCursor: String?
}
