import SwiftUI

struct PhotoViewerView: View {
    /// Local copy: edits replace entries, "In den Papierkorb" removes them.
    @State private var assets: [Asset]
    private let initialAsset: Asset
    /// Hides favourite/archive/trash/edit, e.g. when previewing the trash.
    private let showsLibraryActions: Bool
    @Environment(\.dismiss) private var dismiss
    @State private var controlsVisible = true

    // MARK: Pager state
    //
    // The main pager is a paging ScrollView. Its live content offset, divided
    // by the page width, is the single source of truth (`pagerProgress`) that
    // the filmstrip renders from, so both move as one continuous scroll.
    @State private var scrollPosition: ScrollPosition
    @State private var pagerProgress: CGFloat
    @State private var pageWidth: CGFloat = 0
    @State private var currentIndex: Int

    // MARK: Filmstrip scrub state
    //
    // While the user scrubs the strip (or it is animating towards a tapped /
    // flung target), the strip follows `stripProgress` instead and the main
    // pager jumps live to the photo under the strip's centre.
    @State private var isScrubbing = false
    @State private var stripProgress: CGFloat = 0
    @State private var scrubStartProgress: CGFloat?
    @State private var stripExpansion: CGFloat = 1
    @State private var stripAnimation: Task<Void, Never>?

    @State private var editingAsset: Asset?
    @State private var confirmTrash = false
    @State private var actionError: String?
    @State private var showInfoPanel = false

    init(assets: [Asset], initialAsset: Asset, showsLibraryActions: Bool = true) {
        // Newest known server state, e.g. a favourite toggled on an earlier
        // visit, instead of the (possibly stale) copy the caller holds.
        let changes = AssetChanges.shared
        let current = assets.map { changes.current($0) }
        _assets = State(initialValue: current)
        self.initialAsset = changes.current(initialAsset)
        self.showsLibraryActions = showsLibraryActions
        let index = current.firstIndex(of: initialAsset) ?? 0
        _currentIndex = State(initialValue: index)
        _pagerProgress = State(initialValue: CGFloat(index))
        _scrollPosition = State(initialValue: ScrollPosition(id: initialAsset.id))
    }

    private var currentAsset: Asset {
        assets.indices.contains(currentIndex) ? assets[currentIndex] : initialAsset
    }

    private var isFavorite: Bool { currentAsset.isFavorite }
    private var isArchived: Bool { currentAsset.isArchived }
    private var canEdit: Bool { currentAsset.mimeType?.hasPrefix("image/") == true }

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            pager

            if controlsVisible {
                VStack(spacing: 0) {
                    GlassOverlayBar {
                        GlassIconButton(systemImage: "chevron.left") { dismiss() }
                            .accessibilityLabel("Zurück")
                        Spacer()
                        DateTimePill(date: currentAsset.takenAt)
                        Spacer()
                        AirPlayButton()
                            .accessibilityLabel("AirPlay")
                        moreMenu
                    }
                    .padding(.top, Spacing.sm)

                    Spacer()

                    if assets.count > 1 {
                        FilmstripView(
                            assets: assets,
                            progress: isScrubbing ? stripProgress : pagerProgress,
                            expansion: stripExpansion,
                            onScrubChanged: scrubChanged,
                            onScrubEnded: scrubEnded,
                            onSelect: { animateStrip(to: $0, collapse: false) }
                        )
                    }

                    GlassOverlayBar {
                        GlassIconButton(systemImage: "square.and.arrow.up") { /* share sheet */ }
                            .accessibilityLabel("Teilen")
                        Spacer()
                        if showsLibraryActions {
                            GlassIconButton(systemImage: isFavorite ? "heart.fill" : "heart") {
                                Task { await toggleFavorite() }
                            }
                            .accessibilityLabel(isFavorite ? "Aus Favoriten entfernen" : "Zu Favoriten hinzufügen")
                            Spacer()
                        }
                        GlassIconButton(systemImage: showInfoPanel ? "info.circle.fill" : "info.circle") {
                            showInfoPanel = true
                        }
                        .accessibilityLabel("Information")
                        if showsLibraryActions {
                            Spacer()
                            if canEdit {
                                GlassIconButton(systemImage: "slider.horizontal.3") { editingAsset = currentAsset }
                                    .accessibilityLabel("Bearbeiten")
                            }
                            Spacer()
                            GlassIconButton(systemImage: "trash") { confirmTrash = true }
                                .accessibilityLabel("In den Papierkorb verschieben")
                        }
                    }
                    .padding(.bottom, Spacing.sm)
                }
                .transition(.opacity)
            }
        }
        .toolbar(.hidden, for: .navigationBar)
        .statusBarHidden(!controlsVisible)
        .animation(.easeInOut(duration: 0.2), value: controlsVisible)
        .onDisappear { stripAnimation?.cancel() }
        // Swipe up on the photo to reveal the info panel, like Apple Photos -
        // simultaneous so it never steals the pager's horizontal paging or
        // the image's pinch-to-zoom gesture, and only fires for a clearly
        // vertical, clearly upward drag.
        .simultaneousGesture(
            DragGesture(minimumDistance: 30)
                .onEnded { value in
                    guard !showInfoPanel, abs(value.translation.height) > abs(value.translation.width) else { return }
                    if value.translation.height < -60 { showInfoPanel = true }
                }
        )
        .sheet(isPresented: $showInfoPanel) {
            PhotoInfoView(asset: currentAsset)
        }
        .fullScreenCover(item: $editingAsset) { asset in
            PhotoEditorView(asset: asset) { updated in replace(updated) }
        }
        .confirmationDialog(
            "In den Papierkorb verschieben?",
            isPresented: $confirmTrash,
            titleVisibility: .visible
        ) {
            Button("In den Papierkorb verschieben", role: .destructive) {
                Task { await moveCurrentToTrash() }
            }
        } message: {
            Text("Das Foto bleibt 30 Tage im Papierkorb und kann dort wiederhergestellt werden.")
        }
        .alert("Aktion fehlgeschlagen", isPresented: Binding(
            get: { actionError != nil },
            set: { if !$0 { actionError = nil } }
        )) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(actionError ?? "")
        }
    }

    private var pager: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            LazyHStack(spacing: 0) {
                ForEach(assets) { asset in
                    PhotoViewerPage(
                        asset: asset,
                        revision: AssetChanges.shared.revision(for: asset.id),
                        onTap: { controlsVisible.toggle() }
                    )
                    .containerRelativeFrame([.horizontal, .vertical])
                    .clipped()
                    .contentShape(Rectangle())
                }
            }
            .scrollTargetLayout()
        }
        .scrollTargetBehavior(.paging)
        .scrollPosition($scrollPosition)
        .scrollIndicators(.hidden)
        .ignoresSafeArea()
        .onScrollGeometryChange(for: CGFloat.self) { $0.containerSize.width } action: { _, width in
            pageWidth = width
        }
        .onScrollGeometryChange(for: CGFloat.self) { geo in
            geo.contentOffset.x + geo.contentInsets.leading
        } action: { _, offsetX in
            guard pageWidth > 0 else { return }
            pagerProgress = offsetX / pageWidth
            if !isScrubbing {
                // Like Photos: title / metadata flip once the swipe passes
                // the halfway point, not only after the page settles.
                currentIndex = clampedIndex(Int(pagerProgress.rounded()))
            }
        }
        .onScrollPhaseChange { _, phase in
            // A finger on the main photo takes over from any running
            // filmstrip scrub/animation.
            if phase == .interacting, isScrubbing { endScrub(settleAt: nil) }
        }
    }

    // MARK: - Filmstrip driving

    private func clampedIndex(_ index: Int) -> Int {
        min(max(index, 0), max(assets.count - 1, 0))
    }

    private func clampedProgress(_ progress: CGFloat) -> CGFloat {
        min(max(progress, 0), CGFloat(max(assets.count - 1, 0)))
    }

    private func beginScrubIfNeeded(collapse: Bool) {
        stripAnimation?.cancel()
        stripAnimation = nil
        if !isScrubbing {
            stripProgress = pagerProgress
            isScrubbing = true
        }
        if collapse, stripExpansion != 0 {
            withAnimation(.easeOut(duration: 0.18)) { stripExpansion = 0 }
        }
    }

    private func scrubChanged(_ translation: CGFloat) {
        if scrubStartProgress == nil {
            beginScrubIfNeeded(collapse: true)
            scrubStartProgress = stripProgress
        }
        let start = scrubStartProgress ?? stripProgress
        stripProgress = clampedProgress(start - translation / FilmstripView.stride)
        showPhotoUnderStripCenter()
    }

    private func scrubEnded(_ predictedTranslation: CGFloat) {
        let start = scrubStartProgress ?? stripProgress
        scrubStartProgress = nil
        let projected = clampedProgress(start - predictedTranslation / FilmstripView.stride)
        animateStrip(to: Int(projected.rounded()), collapse: true)
    }

    /// Glides the strip to `target` (deceleration curve) while flipping the
    /// main photo live as each thumbnail passes the centre, then springs the
    /// landing thumbnail open again. Driven frame by frame so the main pager
    /// sees every intermediate position, not just the end state.
    private func animateStrip(to target: Int, collapse: Bool) {
        guard assets.indices.contains(target) else { return }
        beginScrubIfNeeded(collapse: collapse)
        let from = stripProgress
        let to = CGFloat(target)
        let distance = abs(to - from)
        let duration = 0.22 + min(0.45, Double(distance) * 0.04)

        stripAnimation = Task { @MainActor in
            let clock = ContinuousClock()
            let startTime = clock.now
            while !Task.isCancelled {
                let elapsed = startTime.duration(to: clock.now)
                let seconds = Double(elapsed.components.seconds)
                    + Double(elapsed.components.attoseconds) / 1e18
                let t = min(1, seconds / duration)
                let eased = 1 - pow(1 - t, 3) // ease-out cubic
                stripProgress = from + (to - from) * CGFloat(eased)
                showPhotoUnderStripCenter()
                if t >= 1 { break }
                try? await Task.sleep(for: .milliseconds(8))
            }
            guard !Task.isCancelled else { return }
            endScrub(settleAt: target)
        }
    }

    private func endScrub(settleAt target: Int?) {
        stripAnimation?.cancel()
        stripAnimation = nil
        scrubStartProgress = nil
        if let target {
            scrollPager(to: target)
            pagerProgress = CGFloat(target)
        }
        isScrubbing = false
        withAnimation(.spring(duration: 0.35, bounce: 0.2)) { stripExpansion = 1 }
    }

    /// Main photo follows the scrub live (discrete page jumps, no sliding),
    /// just like Photos.
    private func showPhotoUnderStripCenter() {
        let index = clampedIndex(Int(stripProgress.rounded()))
        guard index != currentIndex else { return }
        currentIndex = index
        scrollPager(to: index)
    }

    private func scrollPager(to index: Int) {
        var transaction = Transaction()
        transaction.disablesAnimations = true
        withTransaction(transaction) {
            if pageWidth > 0 {
                scrollPosition.scrollTo(x: CGFloat(index) * pageWidth)
            } else {
                scrollPosition.scrollTo(id: assets[index].id)
            }
        }
    }

    /// "..." menu (top-right, like Apple Photos) - currently just houses
    /// Archive, the one library action that doesn't fit in the bottom
    /// 5-icon row without crowding it past Apple's own layout.
    @ViewBuilder
    private var moreMenu: some View {
        if showsLibraryActions {
            Menu {
                Button {
                    Task { await toggleArchived() }
                } label: {
                    Label(
                        isArchived ? "Aus dem Archiv holen" : "Archivieren",
                        systemImage: isArchived ? "archivebox.fill" : "archivebox"
                    )
                }
            } label: {
                Image(systemName: "ellipsis")
                    .font(.system(size: 17, weight: .medium))
                    .frame(width: 40, height: 40)
                    .glassEffect(.regular, in: Circle())
            }
            .accessibilityLabel("Weitere Optionen")
        } else {
            Color.clear.frame(width: 40, height: 40)
        }
    }

    private func toggleFavorite() async {
        struct Body: Encodable { let isFavorite: Bool }
        let asset = currentAsset
        let newValue = !isFavorite
        if let updated = try? await APIClient.shared.request(
            "/assets/\(asset.id)", method: "PUT",
            body: Body(isFavorite: newValue)
        ) as Asset {
            AssetChanges.shared.update(updated)
            replace(updated)
        }
    }

    /// Stays on the photo (the button just flips); the list the viewer was
    /// opened from reconciles once the viewer is closed.
    private func toggleArchived() async {
        let asset = currentAsset
        do {
            let updated = try await AssetChanges.shared.setArchived(asset, !asset.isArchived)
            replace(updated)
        } catch {
            actionError = error.localizedDescription
        }
    }

    /// Like Photos: the photo disappears and the next one slides in; the
    /// viewer closes when nothing is left.
    private func moveCurrentToTrash() async {
        let asset = currentAsset
        do {
            try await AssetChanges.shared.moveToTrash(asset.id)
        } catch {
            actionError = error.localizedDescription
            return
        }
        guard let index = assets.firstIndex(of: asset) else { return }
        stripAnimation?.cancel()
        isScrubbing = false
        assets.remove(at: index)
        guard !assets.isEmpty else {
            dismiss()
            return
        }
        let newIndex = clampedIndex(index)
        currentIndex = newIndex
        pagerProgress = CGFloat(newIndex)
        scrollPager(to: newIndex)
    }

    private func replace(_ updated: Asset) {
        guard let index = assets.firstIndex(of: updated) else { return }
        assets[index] = updated
    }
}

/// Top-center date/time pill, styled like Apple Photos' own (which is
/// actually a button that opens a date scrubber - ours is display-only for
/// now, so it isn't given button chrome that would falsely promise that).
private struct DateTimePill: View {
    let date: Date?

    private static let germanLocale = Locale(identifier: "de_DE")

    var body: some View {
        VStack(spacing: 0) {
            Text(dayMonth).font(.system(size: 13, weight: .semibold))
            Text(time).font(.system(size: 11)).foregroundStyle(.secondary)
        }
        .padding(.horizontal, Spacing.md)
        .padding(.vertical, 6)
        .glassEffect(.regular, in: Capsule())
        .opacity(date == nil ? 0 : 1)
    }

    private var dayMonth: String {
        guard let date else { return "" }
        return date.formatted(.dateTime.day().month(.wide).locale(Self.germanLocale))
    }

    private var time: String {
        guard let date else { return "" }
        return date.formatted(.dateTime.hour().minute().locale(Self.germanLocale))
    }
}

private struct PhotoViewerPage: View {
    let asset: Asset
    /// Bumped after an edit - part of the URL so AsyncImage refetches.
    let revision: Int
    /// A plain tap (as opposed to a Live Photo press-and-hold) - toggles the
    /// viewer chrome. Handled here rather than by an ancestor `.onTapGesture`
    /// so the Live Photo long-press below can unambiguously decide, for the
    /// very same touch, whether it was a tap or a hold (see `onLongPressGesture`).
    let onTap: () -> Void

    @State private var zoom: CGFloat = 1
    /// Raw touch-down state (true for the whole duration a finger is down).
    @State private var isPressingLive = false
    /// True once the hold has lasted long enough to start Live Photo playback.
    @State private var isPlayingLive = false

    private var fileURL: URL? {
        AssetChanges.shared.versionedURL(APIClient.fileURL(for: asset), assetId: asset.id)
    }

    private var liveVideoURL: URL? {
        asset.livePhotoVideoId.flatMap { APIClient.imageURL(path: "/assets/\($0)/file") }
    }

    var body: some View {
        GeometryReader { _ in
            Group {
                if asset.isVideo {
                    VideoPlayerView(url: APIClient.fileURL(for: asset))
                        .contentShape(Rectangle())
                        .onTapGesture { onTap() }
                } else if asset.is360 {
                    Panorama360View(asset: asset)
                } else {
                    photoContent
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }

    @ViewBuilder
    private var photoContent: some View {
        ZStack {
            AsyncImage(url: fileURL) { phase in
                switch phase {
                case .success(let image):
                    image
                        .resizable()
                        .scaledToFit()
                        .scaleEffect(zoom)
                        .opacity(isPlayingLive ? 0 : 1)
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

            if isPlayingLive, let liveVideoURL {
                LivePhotoLoopPlayerView(url: liveVideoURL)
            }

            VStack {
                HStack {
                    formatBadge
                    Spacer()
                }
                Spacer()
            }
            .padding(Spacing.md)
            .allowsHitTesting(false)
        }
        .contentShape(Rectangle())
        // Single gesture recognizer for both "tap to toggle chrome" and
        // "press and hold to play the Live Photo", like Apple's own gesture:
        // `perform` only fires after the hold threshold, so a quick tap never
        // starts playback, and releasing early after a genuine hold (once
        // `isPlayingLive` is true) stops the video instead of also toggling
        // the chrome underneath it.
        .onLongPressGesture(minimumDuration: 0.35, maximumDistance: 30, pressing: { pressing in
            isPressingLive = pressing
            guard !pressing else { return }
            if isPlayingLive {
                isPlayingLive = false
            } else {
                onTap()
            }
        }, perform: {
            guard asset.livePhotoVideoId != nil, isPressingLive else { return }
            isPlayingLive = true
        })
        .sensoryFeedback(.impact(weight: .medium), trigger: isPlayingLive) { _, isNowPlaying in isNowPlaying }
    }

    @ViewBuilder
    private var formatBadge: some View {
        if asset.livePhotoVideoId != nil, !isPlayingLive {
            Label("LIVE", systemImage: "livephoto")
                .font(.system(size: 12, weight: .semibold))
                .labelStyle(.titleAndIcon)
                .foregroundStyle(.white)
                .padding(.horizontal, Spacing.sm)
                .padding(.vertical, 6)
                .glassEffect(.regular, in: Capsule())
        } else if asset.isRAW {
            Text("RAW")
                .font(.system(size: 12, weight: .bold))
                .foregroundStyle(.white)
                .padding(.horizontal, Spacing.sm)
                .padding(.vertical, 6)
                .glassEffect(.regular, in: Capsule())
        }
    }
}
