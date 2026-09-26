import Foundation

struct CameraStat: Codable, Identifiable {
    let cameraMake: String?
    let cameraModel: String?
    let count: Int
    var id: String { "\(cameraMake ?? "")-\(cameraModel ?? "")" }
}

@MainActor
final class SearchViewModel: ObservableObject {
    @Published var query = ""
    @Published var results: [Asset]?
    @Published var isLoading = false
    @Published var cameraStats: [CameraStat] = []

    private struct SearchHit: Decodable { let asset: Asset; let score: Double }
    private struct SearchResponse: Decodable { let results: [SearchHit] }

    func loadCameraStats() async {
        cameraStats = (try? await APIClient.shared.request("/stats/cameras")) ?? []
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
        isLoading = true
        defer { isLoading = false }
        query = model
        let encoded = model.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? model
        let page: AssetPage? = try? await APIClient.shared.request("/assets?cameraModel=\(encoded)")
        results = page?.assets
    }
}
