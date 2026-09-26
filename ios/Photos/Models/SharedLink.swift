import Foundation

struct SharedLink: Codable, Identifiable {
    let id: String
    let albumId: String
    let token: String
    let expiresAt: Date?
    let createdAt: Date
    let album: AlbumSummary

    struct AlbumSummary: Codable {
        let id: String
        let name: String
        let path: String
    }
}

struct ApiKeyInfo: Codable, Identifiable {
    let id: String
    let name: String
    let createdAt: Date
    let lastUsedAt: Date?
}

struct CreatedApiKey: Codable {
    let id: String
    let name: String
    let createdAt: Date
    let key: String
}
