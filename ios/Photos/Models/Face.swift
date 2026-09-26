import Foundation

struct Face: Codable, Identifiable, Hashable {
    let id: String
    let personName: String?
    let sampleAsset: Asset?
    let assetCount: Int

    static func == (lhs: Face, rhs: Face) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }
}
