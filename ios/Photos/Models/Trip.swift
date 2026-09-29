import Foundation

struct Trip: Codable, Identifiable {
    let id: String
    var name: String
    let startDate: Date
    let endDate: Date
    let centerLat: Double?
    let centerLon: Double?
    let locationName: String?
    let coverAssetId: String?
    let count: Count

    struct Count: Codable {
        let assets: Int
    }

    enum CodingKeys: String, CodingKey {
        case id, name, startDate, endDate, centerLat, centerLon, locationName, coverAssetId
        case count = "_count"
    }
}

struct TripDetailResponse: Decodable {
    let trip: Trip
    let assets: [Asset]
    let nextCursor: String?
}
