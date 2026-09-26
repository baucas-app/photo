import SwiftUI

struct PhotoViewerView: View {
    let assets: [Asset]
    @State private var currentAsset: Asset
    @Environment(\.dismiss) private var dismiss
    @State private var controlsVisible = true

    init(assets: [Asset], initialAsset: Asset) {
        self.assets = assets
        _currentAsset = State(initialValue: initialAsset)
    }

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            TabView(selection: $currentAsset) {
                ForEach(assets) { asset in
                    PhotoViewerPage(asset: asset)
                        .tag(asset)
                        .onTapGesture { controlsVisible.toggle() }
                }
            }
            .tabViewStyle(.page(indexDisplayMode: .never))
            .ignoresSafeArea()

            if controlsVisible {
                VStack {
                    GlassOverlayBar {
                        GlassIconButton(systemImage: "xmark") { dismiss() }
                        Spacer()
                        GlassIconButton(systemImage: currentAsset.isFavorite ? "heart.fill" : "heart") {
                            Task { await toggleFavorite() }
                        }
                        GlassIconButton(systemImage: "square.and.arrow.up") { /* share sheet */ }
                    }
                    .padding(.top, Spacing.sm)

                    Spacer()

                    GlassOverlayBar {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(currentAsset.filename).font(.footnote.bold())
                            Text(metadataLine).font(.caption).foregroundStyle(.secondary)
                        }
                        Spacer()
                    }
                    .padding(.bottom, Spacing.sm)
                }
                .transition(.opacity)
            }
        }
        .toolbar(.hidden, for: .navigationBar)
        .statusBarHidden(!controlsVisible)
        .animation(.easeInOut(duration: 0.2), value: controlsVisible)
    }

    private var metadataLine: String {
        var parts: [String] = []
        if let takenAt = currentAsset.takenAt {
            parts.append(takenAt.formatted(date: .abbreviated, time: .shortened))
        }
        if let width = currentAsset.width, let height = currentAsset.height {
            parts.append("\(width)×\(height)")
        }
        if let model = currentAsset.cameraModel {
            parts.append(model)
        }
        return parts.joined(separator: " · ")
    }

    private func toggleFavorite() async {
        struct Body: Encodable { let isFavorite: Bool }
        _ = try? await APIClient.shared.request(
            "/assets/\(currentAsset.id)", method: "PUT",
            body: Body(isFavorite: !currentAsset.isFavorite)
        ) as Asset
    }
}

private struct PhotoViewerPage: View {
    let asset: Asset
    @State private var zoom: CGFloat = 1

    var body: some View {
        GeometryReader { _ in
            if asset.isVideo {
                VideoPlayerView(url: APIClient.fileURL(for: asset))
            } else {
                AsyncImage(url: APIClient.fileURL(for: asset)) { phase in
                    switch phase {
                    case .success(let image):
                        image
                            .resizable()
                            .scaledToFit()
                            .scaleEffect(zoom)
                            .gesture(
                                MagnificationGesture()
                                    .onChanged { zoom = max(1, $0) }
                                    .onEnded { _ in if zoom < 1.05 { withAnimation { zoom = 1 } } }
                            )
                    case .failure:
                        Image(systemName: "exclamationmark.triangle").foregroundStyle(.white)
                    default:
                        ProgressView().tint(.white)
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
    }
}
