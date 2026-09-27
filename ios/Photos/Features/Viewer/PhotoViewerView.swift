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

                    if assets.count > 1 {
                        FilmstripView(assets: assets, currentAsset: $currentAsset)
                    }

                    GlassOverlayBar {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(currentAsset.filename).font(.footnote.bold())
                            Text(metadataLine).font(.caption).foregroundStyle(.secondary)
                            if !exifLine.isEmpty {
                                Text(exifLine).font(.caption2).foregroundStyle(.tertiary)
                            }
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
        return parts.joined(separator: " · ")
    }

    private var exifLine: String {
        var parts: [String] = []
        if let model = currentAsset.cameraModel {
            parts.append([currentAsset.cameraMake, model].compactMap { $0 }.joined(separator: " "))
        }
        if let lens = currentAsset.lensModel { parts.append(lens) }
        if let focalLength = currentAsset.focalLength { parts.append("\(Int(focalLength))mm") }
        if let fNumber = currentAsset.fNumber { parts.append("f/\(fNumber)") }
        if let exposureTime = currentAsset.exposureTime {
            parts.append(exposureTime >= 1 ? "\(exposureTime)s" : "1/\(Int((1 / exposureTime).rounded()))s")
        }
        if let iso = currentAsset.iso { parts.append("ISO \(iso)") }
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

/// Horizontal thumbnail strip for quickly jumping between photos without
/// swiping through every one - matches the original spec's "Filmstreifen"
/// requirement for the full-screen viewer.
private struct FilmstripView: View {
    let assets: [Asset]
    @Binding var currentAsset: Asset

    private let thumbnailSize: CGFloat = 44

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 4) {
                    ForEach(assets) { asset in
                        Button {
                            withAnimation { currentAsset = asset }
                        } label: {
                            CachedThumbnail(assetId: asset.id, url: APIClient.thumbnailURL(for: asset))
                                .frame(width: thumbnailSize, height: thumbnailSize)
                                .clipShape(RoundedRectangle(cornerRadius: 6))
                                .overlay(
                                    RoundedRectangle(cornerRadius: 6)
                                        .stroke(.white, lineWidth: asset.id == currentAsset.id ? 2 : 0)
                                )
                        }
                        .id(asset.id)
                    }
                }
                .padding(.horizontal, Spacing.md)
                .padding(.vertical, Spacing.sm)
            }
            .onChange(of: currentAsset.id) { _, newId in
                withAnimation { proxy.scrollTo(newId, anchor: .center) }
            }
            .task { proxy.scrollTo(currentAsset.id, anchor: .center) }
        }
        .frame(height: thumbnailSize + Spacing.sm * 2)
        .background(.ultraThinMaterial)
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
