import Foundation

@MainActor
final class TimelineViewModel: ObservableObject {
    @Published var assets: [Asset] = []
    @Published var isLoading = false
    @Published var errorMessage: String?

    private var nextCursor: String?
    private var reachedEnd = false
    /// Extra query items, e.g. `archived=true` for the archive screen.
    private let filter: [URLQueryItem]

    init(filter: [URLQueryItem] = []) {
        self.filter = filter
    }

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
            var items = filter
            if let nextCursor { items.append(URLQueryItem(name: "cursor", value: nextCursor)) }
            var components = URLComponents()
            components.queryItems = items.isEmpty ? nil : items
            let page: AssetPage = try await APIClient.shared.request("/assets\(components.string ?? "")")
            assets.append(contentsOf: page.assets)
            nextCursor = page.nextCursor
            reachedEnd = page.nextCursor == nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    /// Drops assets that were archived / moved to the trash elsewhere in the
    /// app, without reloading (keeps the scroll position).
    func removeAssets(in ids: Set<String>) {
        assets.removeAll { ids.contains($0.id) }
    }

    func loadMoreIfNeeded(current asset: Asset) async {
        guard let index = assets.firstIndex(of: asset) else { return }
        if index >= assets.count - 12 {
            await loadMore()
        }
    }
}
