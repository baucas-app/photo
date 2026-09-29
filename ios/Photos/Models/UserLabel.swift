import Foundation
import SwiftUI

struct UserLabel: Codable, Identifiable, Hashable {
    let id: String
    let userId: String
    let name: String
    let color: String?
    let parentId: String?
    let createdAt: Date
    var assetCount: Int?

    var swiftUIColor: Color {
        guard let hex = color else { return .accentColor }
        return Color(hex: hex) ?? .accentColor
    }
}

extension Color {
    init?(hex: String) {
        var h = hex.trimmingCharacters(in: .whitespacesAndNewlines)
        if h.hasPrefix("#") { h.removeFirst() }
        guard h.count == 6, let value = UInt64(h, radix: 16) else { return nil }
        let r = Double((value >> 16) & 0xFF) / 255
        let g = Double((value >> 8) & 0xFF) / 255
        let b = Double(value & 0xFF) / 255
        self.init(red: r, green: g, blue: b)
    }
}
