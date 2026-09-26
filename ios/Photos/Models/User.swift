import Foundation

struct User: Codable, Identifiable, Equatable {
    let id: String
    let email: String
    let name: String?
    let role: Role

    enum Role: String, Codable {
        case user
        case admin
    }
}
