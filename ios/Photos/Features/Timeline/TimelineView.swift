import SwiftUI

struct TimelineView: View {
    @StateObject private var viewModel = TimelineViewModel()
    @State private var selectedAsset: Asset?
    @State private var showSearch = false
    @State private var showSlideshow = false
    @State private var showPartner = false
    @State private var partnerAssets: [Asset] = []

    private var displayAssets: [Asset] {
        guard showPartner, !partnerAssets.isEmpty else { return viewModel.assets }
        let ownIds = Set(viewModel.assets.map { $0.id })
        let merged = viewModel.assets + partnerAssets.filter { !ownIds.contains($0.id) }
        return merged.sorted {
            let a = $0.takenAt ?? $0.uploadedAt
            let b = $1.takenAt ?? $1.uploadedAt
            return a > b
        }
    }

    // MARK: Multi-select (Stapeln - docs/DONE.md Teil 7)
    @State private var isSelecting = false
    @State private var selectedIds: Set<String> = []
    @State private var isStacking = false
    @State private var stackError: String?
    /// Set when tapping an already-stacked tile (`stackCount > 0`), opens the
    /// stack's member sheet instead of the normal viewer.
    @State private var stackToShow: Asset?

    /// Persisted zoom level (column count); 0 = automatic.
    @AppStorage("timeline.gridColumns") private var storedColumns = 0
    @State private var gridWidth: CGFloat = 0
    @State private var pinch: TimelinePinchSession?
    @State private var scrollPosition = ScrollPosition(edge: .top)
    @State private var scrollBox = TimelineScrollBox()
    /// `AssetChanges.additionsVersion` the list was last loaded with.
    @State private var seenAdditions = AssetChanges.shared.additionsVersion

    private let spacing = TimelineGridTiers.spacing

    /// Column count the real grid is showing (always one of the tiers).
    private var columns: Int {
        let tiers = TimelineGridTiers.tiers(forWidth: gridWidth)
        return tiers[TimelineGridTiers.tierIndex(forColumns: storedColumns, width: gridWidth)]
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                zoomableGrid

                if viewModel.isLoading {
                    ProgressView().padding()
                }
            }
            .scrollPosition($scrollPosition)
            .onGeometryChange(for: CGRect.self) { $0.frame(in: .global) } action: { frame in
                scrollBox.viewportFrame = frame
                reapplyHandBackIfNeeded()
            }
            .scrollDisabled(pinch != nil)
            .onScrollGeometryChange(for: TimelineScrollSnapshot.self) { geometry in
                TimelineScrollSnapshot(geometry)
            } action: { _, snapshot in
                scrollBox.snapshot = snapshot
            }
            .navigationTitle("Mediathek")
            .toolbar {
                if isSelecting {
                    ToolbarItem(placement: .topBarLeading) {
                        Button("Abbrechen") { exitSelection() }
                    }
                    ToolbarItem(placement: .principal) {
                        Text(selectedIds.isEmpty ? "Auswählen" : "\(selectedIds.count) ausgewählt")
                            .font(.headline)
                    }
                    ToolbarItem(placement: .topBarTrailing) {
                        if isStacking {
                            ProgressView()
                        } else {
                            Button("Stapeln") { Task { await stackSelected() } }
                                .disabled(selectedIds.count < 2)
                        }
                    }
                } else {
                    ToolbarItem(placement: .topBarTrailing) {
                        Menu {
                            NavigationLink(destination: CollectionsView()) {
                                Label("Sammlungen", systemImage: "square.stack")
                            }
                            NavigationLink(destination: MemoriesView()) {
                                Label("Erinnerungen", systemImage: "clock.arrow.circlepath")
                            }
                            NavigationLink(destination: PhotoMapView()) {
                                Label("Karte", systemImage: "map")
                            }
                            NavigationLink(destination: DuplicatesView()) {
                                Label("Duplikate", systemImage: "square.on.square")
                            }
                            Button { showSlideshow = true } label: {
                                Label("Diashow", systemImage: "play.rectangle")
                            }
                            .disabled(viewModel.assets.isEmpty)
                            Divider()
                            Button {
                                showPartner.toggle()
                            } label: {
                                Label(
                                    showPartner ? "Partner ausblenden" : "Partner-Fotos einblenden",
                                    systemImage: showPartner ? "person.2.fill" : "person.2"
                                )
                            }
                            Divider()
                            NavigationLink(destination: ArchiveView()) {
                                Label("Archiv", systemImage: "archivebox")
                            }
                            NavigationLink(destination: TrashView()) {
                                Label("Papierkorb", systemImage: "trash")
                            }
                        } label: {
                            Image(systemName: showPartner ? "person.2.square.stack" : "square.stack.3d.up")
                        }
                    }
                    ToolbarItem(placement: .topBarTrailing) {
                        Button { showSearch = true } label: {
                            Image(systemName: "magnifyingglass")
                        }
                    }
                    ToolbarItem(placement: .topBarTrailing) {
                        Button("Auswählen") { isSelecting = true }
                            .disabled(viewModel.assets.isEmpty)
                    }
                }
            }
            .task { if viewModel.assets.isEmpty { await viewModel.loadInitial() } }
            .task(id: showPartner) {
                if showPartner {
                    let page: AssetPage? = try? await APIClient.shared.request("/partner/assets")
                    partnerAssets = page?.assets ?? []
                } else {
                    partnerAssets = []
                }
            }
            .refreshable {
                seenAdditions = AssetChanges.shared.additionsVersion
                await viewModel.loadInitial()
                if showPartner {
                    let page: AssetPage? = try? await APIClient.shared.request("/partner/assets")
                    partnerAssets = page?.assets ?? []
                }
            }
            .onChange(of: AssetChanges.shared.libraryVersion) {
                // Never reshuffle the list under an open viewer - it would
                // shift the pages; catch up when it closes instead.
                if selectedAsset == nil { reconcileLibraryChanges() }
            }
            .onChange(of: viewModel.assets.count) { _, count in
                // A refresh emptied the list mid-pinch: drop the overlay.
                if count == 0 { pinch = nil }
            }
            .fullScreenCover(item: $selectedAsset, onDismiss: reconcileLibraryChanges) { asset in
                PhotoViewerView(assets: displayAssets, initialAsset: asset)
            }
            .sheet(isPresented: $showSearch) {
                SearchView()
            }
            .sheet(item: $stackToShow, onDismiss: { Task { await viewModel.loadInitial() } }) { asset in
                StackDetailView(leaderId: asset.id)
            }
            .fullScreenCover(isPresented: $showSlideshow) {
                SlideshowView(assets: displayAssets)
            }
            .sensoryFeedback(.selection, trigger: isSelecting)
            .alert("Aktion fehlgeschlagen", isPresented: Binding(
                get: { stackError != nil },
                set: { if !$0 { stackError = nil } }
            )) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(stackError ?? "")
            }
            .overlay {
                if displayAssets.isEmpty && !viewModel.isLoading {
                    ContentUnavailableView(
                        "Noch keine Fotos",
                        systemImage: "photo.on.rectangle",
                        description: Text("Fotos werden hier angezeigt, sobald das Backup läuft oder du welche hochlädst.")
                    )
                }
            }
        }
    }

    /// Archived/trashed photos drop out in place (scroll position kept);
    /// restored/un-archived ones need a reload since their slot is unknown.
    private func reconcileLibraryChanges() {
        let changes = AssetChanges.shared
        if changes.additionsVersion != seenAdditions {
            seenAdditions = changes.additionsVersion
            pinch = nil
            Task { await viewModel.loadInitial() }
        } else {
            viewModel.removeAssets(in: changes.hiddenFromLibrary)
        }
    }

    // MARK: - Multi-select / Stapeln

    private func toggleSelection(_ asset: Asset) {
        if selectedIds.contains(asset.id) {
            selectedIds.remove(asset.id)
        } else {
            selectedIds.insert(asset.id)
        }
    }

    private func exitSelection() {
        isSelecting = false
        selectedIds.removeAll()
    }

    /// `POST /assets/stack` - the backend rejects it (400) if any chosen
    /// photo is already stacked (either as a member or as another stack's
    /// leader), surfaced here via the same alert the viewer uses.
    private func stackSelected() async {
        guard selectedIds.count >= 2 else { return }
        isStacking = true
        defer { isStacking = false }
        struct Body: Encodable { let assetIds: [String] }
        do {
            try await APIClient.shared.requestVoid(
                "/assets/stack", method: "POST", body: Body(assetIds: Array(selectedIds))
            )
            exitSelection()
            await viewModel.loadInitial()
        } catch {
            stackError = error.localizedDescription
        }
    }

    // MARK: - Grid

    /// The real lazy grid plus, while pinching, an overlay that draws the
    /// visible slice with interpolated frames. Both share one coordinate
    /// space (the grid's), which is also where the pinch is measured.
    private var zoomableGrid: some View {
        ZStack(alignment: .topLeading) {
            LazyVGrid(
                columns: Array(repeating: GridItem(.flexible(), spacing: spacing), count: columns),
                spacing: spacing
            ) {
                ForEach(displayAssets) { asset in
                    Button {
                        guard pinch == nil else { return }
                        if isSelecting {
                            toggleSelection(asset)
                        } else if asset.stackCount > 0 {
                            stackToShow = asset
                        } else {
                            selectedAsset = asset
                        }
                    } label: {
                        Color.clear
                            .aspectRatio(1, contentMode: .fit)
                            .overlay { TimelineThumbnail(asset: asset) }
                            .overlay(alignment: .topLeading) { TimelineTopBadges(asset: asset) }
                            .overlay(alignment: .bottomTrailing) {
                                if asset.stackCount > 0 { StackCountBadge(count: asset.stackCount) }
                            }
                            .overlay(alignment: .topTrailing) {
                                if isSelecting { TimelineSelectionMarker(isSelected: selectedIds.contains(asset.id)) }
                            }
                            .opacity(isSelecting && !selectedIds.contains(asset.id) ? 0.75 : 1)
                            .clipped()
                    }
                    .simultaneousGesture(
                        LongPressGesture(minimumDuration: 0.4).onEnded { _ in
                            guard pinch == nil, !isSelecting else { return }
                            isSelecting = true
                            selectedIds = [asset.id]
                        }
                    )
                    .task { await viewModel.loadMoreIfNeeded(current: asset) }
                }
            }
            .opacity(pinch == nil ? 1 : 0)
            .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { width in
                if width != gridWidth {
                    pinch = nil
                    gridWidth = width
                }
            }

            if let pinch {
                PinchOverlay(
                    session: pinch,
                    assets: displayAssets,
                    visibleRect: overlayCullRect
                )
            }
        }
        .contentShape(Rectangle())
        .gesture(TimelinePinchGesture { phase, scale, location, velocity in
            switch phase {
            case .began: pinchBegan(at: location)
            case .changed: pinchChanged(scale: scale, location: location)
            case .ended: pinchEnded(velocity: velocity)
            }
        })
    }

    /// Visible part of the scroll content (grid coordinates), generously
    /// padded so tiles under the bars and rubber-banding never pop.
    private var overlayCullRect: CGRect {
        let rect = scrollBox.snapshot?.visibleRect ?? CGRect(x: 0, y: 0, width: gridWidth, height: 1000)
        return rect.insetBy(dx: 0, dy: -200)
    }

    // MARK: - Pinch handling

    private func pinchBegan(at location: CGPoint) {
        guard pinch == nil,
              let session = TimelinePinchSession(
                location: location,
                columns: columns,
                count: displayAssets.count,
                width: gridWidth
              )
        else { return }
        pinch = session
    }

    private func pinchChanged(scale: CGFloat, location: CGPoint) {
        guard var session = pinch, !session.isSettling else { return }
        let point = location.x.isNaN ? session.anchor : location
        session.update(scale: scale, location: point)
        pinch = session
    }

    private func pinchEnded(velocity: CGFloat) {
        guard var session = pinch, !session.isSettling else { return }
        let count = displayAssets.count
        guard count > 0, let scroll = scrollBox.snapshot else {
            pinch = nil
            return
        }

        let target = session.settleTarget(velocity: velocity)
        let targetColumns = session.tiers[target]

        // Where the focal photo would like to end up, clamped to the scroll
        // range the grid will have at the new column count. Works in
        // ScrollPosition's y space (0 = content top at the safe-area top).
        var final = session
        final.position = CGFloat(target)
        final.rubber = 1
        let desiredShift = final.focalShift()
        let metrics = session.metrics
        let newContentHeight = scroll.contentHeight
            - metrics.contentHeight(count: count, columns: columns)
            + metrics.contentHeight(count: count, columns: targetColumns)
        let currentY = scroll.contentOffsetY + scroll.insetTop
        let maxY = max(0, newContentHeight - scrollBox.viewportFrame.height)
        let targetY = min(max(currentY - desiredShift, 0), maxY)
        final.shiftY = currentY - targetY

        // Freeze the drawn slice to everything visible at either end of the
        // settle animation so no tile pops in or out mid-spring.
        let rect = overlayCullRect
        let now = session.visibleRange(in: rect, count: count)
        let then = final.visibleRange(in: rect, count: count)
        session.settleRange = min(now.lowerBound, then.lowerBound)..<max(now.upperBound, then.upperBound)
        session.isSettling = true
        pinch = session

        let finalShift = final.shiftY
        // Screen position of the grid's top edge once settled.
        let gridTopOnScreen = scrollBox.viewportFrame.minY - currentY + finalShift
        Task { @MainActor in
            withAnimation(.spring(response: 0.36, dampingFraction: 0.86), completionCriteria: .removed) {
                pinch?.position = CGFloat(target)
                pinch?.shiftY = finalShift
                pinch?.rubber = 1
            } completion: {
                handBack(columns: targetColumns, gridTopOnScreen: gridTopOnScreen, contentHeight: newContentHeight)
            }
        }
    }

    /// Swap the overlay for the real grid at the new column count, scrolled so
    /// that every tile sits exactly where the overlay last drew it.
    private func handBack(columns newColumns: Int, gridTopOnScreen: CGFloat, contentHeight: CGFloat) {
        scrollBox.pendingHandBack = .init(gridTopOnScreen: gridTopOnScreen, contentHeight: contentHeight)
        var transaction = Transaction()
        transaction.disablesAnimations = true
        withTransaction(transaction) {
            storedColumns = newColumns
            pinch = nil
            reapplyHandBackIfNeeded()
        }
    }

    /// Scrolls so the grid's top edge lands at the pending on-screen position.
    /// Runs again if the viewport moves right after the hand-back, which
    /// happens when the new offset collapses/expands the large title.
    private func reapplyHandBackIfNeeded() {
        guard let pending = scrollBox.pendingHandBack else { return }
        guard Date() < pending.deadline else {
            scrollBox.pendingHandBack = nil
            return
        }
        let viewport = scrollBox.viewportFrame
        let maxY = max(0, pending.contentHeight - viewport.height)
        let y = min(max(viewport.minY - pending.gridTopOnScreen, 0), maxY)
        var transaction = Transaction()
        transaction.disablesAnimations = true
        withTransaction(transaction) {
            scrollPosition.scrollTo(y: y)
        }
    }
}

/// Draws the visible slice of the grid at interpolated frames.
private struct PinchOverlay: View {
    let session: TimelinePinchSession
    let assets: [Asset]
    let visibleRect: CGRect

    private struct Item: Identifiable {
        let index: Int
        let asset: Asset
        var id: String { asset.id }
    }

    var body: some View {
        let items = session.visibleIndices(in: visibleRect, count: assets.count)
            .map { Item(index: $0, asset: assets[$0]) }

        ZStack(alignment: .topLeading) {
            ForEach(items) { item in
                let frame = session.displayFrame(index: item.index)
                TimelineThumbnail(asset: item.asset)
                    .frame(width: frame.width, height: frame.height)
                    .offset(x: frame.minX, y: frame.minY)
            }
        }
        // Zero-height so the overlay never changes the scroll content size;
        // tiles simply draw past the frame.
        .frame(width: session.metrics.width, height: 0, alignment: .topLeading)
        // Rubber band around the finger centroid.
        .scaleEffect(
            session.rubber,
            anchor: UnitPoint(
                x: session.metrics.width > 0 ? session.anchor.x / session.metrics.width : 0.5,
                y: 0
            )
        )
        .offset(y: session.anchor.y * (1 - session.rubber))
        .allowsHitTesting(false)
    }
}
