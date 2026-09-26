import Foundation

@MainActor
final class TimelineViewModel: ObservableObject {
    @Published var assets: [Asset] = []
    @Published var isLoading = false
    @Published var errorMessage: String?

    private var nextCursor: String?
    private var reachedEnd = false

    func loadInitial() async {
        assets = []
        nextCursor = nil
        reachedEnd = false
        await loadMore()
    }

    func loadMore() async {
        guard !isLoading, !reachedEnd else { return }
        isLoading = true
        defer { isLoading = false }

        do {
            let query = nextCursor.map { "?cursor=\($0)" } ?? ""
            let page: AssetPage = try await APIClient.shared.request("/assets\(query)")
            assets.append(contentsOf: page.assets)
            nextCursor = page.nextCursor
            reachedEnd = page.nextCursor == nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func loadMoreIfNeeded(current asset: Asset) async {
        guard let index = assets.firstIndex(of: asset) else { return }
        if index >= assets.count - 12 {
            await loadMore()
        }
    }
}
