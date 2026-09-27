import Foundation

struct CameraStat: Codable, Identifiable {
    let cameraMake: String?
    let cameraModel: String?
    let count: Int
    var id: String { "\(cameraMake ?? "")-\(cameraModel ?? "")" }
}

struct TagStat: Codable, Identifiable {
    let label: String
    let count: Int
    var id: String { label }
}

@MainActor
final class SearchViewModel: ObservableObject {
    @Published var query = ""
    @Published var results: [Asset]?
    @Published var isLoading = false
    @Published var cameraStats: [CameraStat] = []
    @Published var tagStats: [TagStat] = []

    private struct SearchHit: Decodable { let asset: Asset; let score: Double }
    private struct SearchResponse: Decodable { let results: [SearchHit] }

    func loadFacets() async {
        async let cameras: [CameraStat] = (try? await APIClient.shared.request("/stats/cameras")) ?? []
        async let tags: [TagStat] = (try? await APIClient.shared.request("/tags")) ?? []
        cameraStats = await cameras
        tagStats = await tags
    }

    func search() async {
        guard !query.trimmingCharacters(in: .whitespaces).isEmpty else { return }
        isLoading = true
        defer { isLoading = false }
        let encoded = query.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? query
        let response: SearchResponse? = try? await APIClient.shared.request("/search?q=\(encoded)")
        results = response?.results.map(\.asset)
    }

    func filterByCamera(_ model: String?) async {
        guard let model else { return }
        await filterByAssetsQuery(displayLabel: model, queryItem: "cameraModel=\(model)")
    }

    func filterByTag(_ label: String) async {
        await filterByAssetsQuery(displayLabel: label, queryItem: "tag=\(label)")
    }

    private func filterByAssetsQuery(displayLabel: String, queryItem: String) async {
        isLoading = true
        defer { isLoading = false }
        query = displayLabel
        let encoded = queryItem.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? queryItem
        let page: AssetPage? = try? await APIClient.shared.request("/assets?\(encoded)")
        results = page?.assets
    }
}
