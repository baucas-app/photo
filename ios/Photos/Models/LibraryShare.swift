import Foundation

struct LibraryShareUser: Codable, Identifiable {
    let id: String
    let name: String?
    let email: String

    var displayName: String { name?.isEmpty == false ? name! : email }
}

enum LibraryShareStatus: String, Codable {
    case pending
    case accepted
}

struct LibraryShare: Codable, Identifiable {
    let id: String
    let fromUserId: String
    let toUserId: String
    let status: LibraryShareStatus
    let fromUser: LibraryShareUser?
    let toUser: LibraryShareUser?
}

struct PartnerData: Decodable {
    let sent: [LibraryShare]
    let received: [LibraryShare]
}
