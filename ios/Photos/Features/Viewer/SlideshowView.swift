import SwiftUI

/// Full-screen, hands-free slideshow (docs/DONE.md Teil 7): cycles through
/// `assets` on a timer with play/pause and an adjustable interval. Reuses
/// plain `AsyncImage` rendering rather than the full interactive
/// `PhotoViewerView` - none of its pager/zoom/library-action chrome applies
/// to an auto-advancing show.
struct SlideshowView: View {
    let assets: [Asset]

    @Environment(\.dismiss) private var dismiss
    @State private var currentIndex: Int
    @State private var isPlaying = true
    @State private var intervalSeconds: Double = 4
    @State private var showControls = true
    @State private var timerTask: Task<Void, Never>?

    init(assets: [Asset], startIndex: Int = 0) {
        self.assets = assets
        _currentIndex = State(initialValue: assets.indices.contains(startIndex) ? startIndex : 0)
    }

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            if assets.indices.contains(currentIndex) {
                SlideshowImage(asset: assets[currentIndex])
                    .id(assets[currentIndex].id)
                    .transition(.opacity)
            }

            if showControls {
                VStack {
                    HStack {
                        GlassIconButton(systemImage: "xmark") { dismiss() }
                            .accessibilityLabel("Diashow beenden")
                        Spacer()
                    }
                    .padding(.top, Spacing.sm)
                    .padding(.horizontal, Spacing.md)

                    Spacer()

                    VStack(spacing: Spacing.md) {
                        GlassOverlayBar {
                            GlassIconButton(systemImage: "backward.fill") { step(by: -1) }
                                .accessibilityLabel("Vorheriges Foto")
                            Spacer()
                            GlassIconButton(systemImage: isPlaying ? "pause.fill" : "play.fill") {
                                isPlaying.toggle()
                            }
                            .accessibilityLabel(isPlaying ? "Pausieren" : "Fortsetzen")
                            Spacer()
                            GlassIconButton(systemImage: "forward.fill") { step(by: 1) }
                                .accessibilityLabel("Nächstes Foto")
                        }

                        HStack(spacing: Spacing.sm) {
                            Image(systemName: "hare")
                            Slider(value: $intervalSeconds, in: 2...10, step: 1)
                            Image(systemName: "tortoise")
                        }
                        .tint(.white)
                        .foregroundStyle(.white)
                        .padding(.horizontal, Spacing.lg)
                    }
                    .padding(.bottom, Spacing.md)
                }
                .transition(.opacity)
            }
        }
        .statusBarHidden(!showControls)
        .toolbar(.hidden, for: .navigationBar)
        .animation(.easeInOut(duration: 0.2), value: showControls)
        .contentShape(Rectangle())
        .onTapGesture { showControls.toggle() }
        .task { await runTimer() }
        .onChange(of: isPlaying) { restartTimer() }
        .onChange(of: intervalSeconds) { restartTimer() }
        .onDisappear { timerTask?.cancel() }
    }

    private func step(by delta: Int) {
        guard !assets.isEmpty else { return }
        withAnimation { currentIndex = (currentIndex + delta + assets.count) % assets.count }
        restartTimer()
    }

    private func restartTimer() {
        timerTask?.cancel()
        timerTask = Task { await runTimer() }
    }

    private func runTimer() async {
        while !Task.isCancelled {
            try? await Task.sleep(for: .seconds(Int(intervalSeconds.rounded())))
            guard !Task.isCancelled, isPlaying, !assets.isEmpty else { continue }
            withAnimation { currentIndex = (currentIndex + 1) % assets.count }
        }
    }
}

/// One slide - a plain image for photos, the server-rendered poster frame
/// for videos (a fixed-interval slideshow has no natural place to play a
/// video's own audio/length, so it's shown like a still here).
private struct SlideshowImage: View {
    let asset: Asset

    private var url: URL? {
        asset.isVideo ? APIClient.previewURL(for: asset) : APIClient.fileURL(for: asset)
    }

    var body: some View {
        AsyncImage(url: url) { phase in
            switch phase {
            case .success(let image):
                image.resizable().scaledToFit()
            case .failure:
                Image(systemName: "exclamationmark.triangle").foregroundStyle(.white)
            default:
                ProgressView().tint(.white)
            }
        }
    }
}
