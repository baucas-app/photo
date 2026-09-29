import SwiftUI
import UIKit

/// Basic photo editor: rotate in 90° steps, free crop with draggable
/// corner/edge handles, brightness and contrast.
///
/// Everything is previewed locally (SwiftUI `.brightness()` / `.contrast()`
/// on a downscaled copy - close to, not pixel-identical with, the server's
/// sharp pipeline). "Fertig" sends one `POST /assets/:id/edit` with all
/// values; the backend renders it from the pristine original, so editing
/// again never compounds quality loss. "Original wiederherstellen" calls
/// `/revert`.
struct PhotoEditorView: View {
    let asset: Asset
    /// Called with the server's updated asset after a save or revert.
    let onFinish: (Asset) -> Void

    @Environment(\.dismiss) private var dismiss

    private enum LoadState {
        case loading
        case loaded(EditorImage)
        case failed(String)
    }

    enum Mode: Hashable { case crop, adjust }

    @State private var loadState: LoadState = .loading
    @State private var baseRecord: PhotoEditRecord?

    @State private var mode: Mode = .crop
    /// Clockwise quarter turns added in this session.
    @State private var quarterTurns = 0
    /// Crop in unit coordinates of the image *as displayed* (after rotation).
    @State private var crop = NormalizedRect.full
    @State private var brightness: Double = 0
    @State private var contrast: Double = 0

    @State private var dragStartCrop: CGRect?
    @State private var isSaving = false
    @State private var errorMessage: String?
    @State private var confirmRevert = false
    @State private var confirmDiscard = false

    private var hasChanges: Bool {
        quarterTurns != 0 || !NormalizedRect.isFull(crop) || brightness != 0 || contrast != 0
    }

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            VStack(spacing: Spacing.md) {
                topBar

                switch loadState {
                case .loading:
                    ProgressView().tint(.white).frame(maxWidth: .infinity, maxHeight: .infinity)
                case .failed(let message):
                    ContentUnavailableView("Foto konnte nicht geladen werden", systemImage: "exclamationmark.triangle", description: Text(message))
                        .frame(maxHeight: .infinity)
                case .loaded(let image):
                    canvas(image)
                    controls(image)
                }
            }
            .padding(.bottom, Spacing.sm)

            if isSaving {
                ProgressView("Wird gespeichert …")
                    .padding(Spacing.lg)
                    .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: Radius.md))
            }
        }
        .preferredColorScheme(.dark)
        .statusBarHidden()
        .task { await load() }
        .confirmationDialog("Original wiederherstellen?", isPresented: $confirmRevert, titleVisibility: .visible) {
            Button("Original wiederherstellen", role: .destructive) { Task { await revert() } }
        } message: {
            Text("Alle Bearbeitungen an diesem Foto werden entfernt.")
        }
        .confirmationDialog("Änderungen verwerfen?", isPresented: $confirmDiscard, titleVisibility: .visible) {
            Button("Änderungen verwerfen", role: .destructive) { dismiss() }
        }
        .alert("Bearbeitung fehlgeschlagen", isPresented: Binding(
            get: { errorMessage != nil },
            set: { if !$0 { errorMessage = nil } }
        )) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(errorMessage ?? "")
        }
    }

    // MARK: - Top bar

    private var topBar: some View {
        GlassEffectContainer(spacing: Spacing.sm) {
            HStack(spacing: Spacing.sm) {
                Button("Abbrechen") {
                    if hasChanges { confirmDiscard = true } else { dismiss() }
                }
                .buttonStyle(.glass)

                Spacer()

                Button {
                    confirmRevert = true
                } label: {
                    Label("Original", systemImage: "arrow.uturn.backward")
                }
                .buttonStyle(.glass)
                .accessibilityLabel("Original wiederherstellen")

                Button("Fertig") { Task { await save() } }
                    .buttonStyle(.glassProminent)
                    .disabled(!hasChanges)
            }
            .padding(.horizontal, Spacing.md)
            .padding(.top, Spacing.sm)
        }
        .disabled(isSaving)
    }

    // MARK: - Canvas

    private func canvas(_ image: EditorImage) -> some View {
        GeometryReader { geo in
            let bounds = CGRect(origin: .zero, size: geo.size).insetBy(dx: Spacing.lg, dy: Spacing.md)
            let imageAspect = image.displayAspect(quarterTurns: quarterTurns)
            let layout = EditorLayout(bounds: bounds, imageAspect: imageAspect, crop: crop, zoomToCrop: mode == .adjust)

            ZStack(alignment: .topLeading) {
                Image(uiImage: image.displayImage(quarterTurns: quarterTurns))
                    .resizable()
                    .brightness(brightness / 200)
                    .contrast(1 + contrast / 100)
                    .frame(width: layout.imageFrame.width, height: layout.imageFrame.height)
                    .position(x: layout.imageFrame.midX, y: layout.imageFrame.midY)

                // Outside the crop: dimmed while cropping, black (= cropped
                // away) while adjusting.
                CropDimShape(outer: CGRect(origin: .zero, size: geo.size), hole: layout.cropFrame)
                    .fill(Color.black.opacity(mode == .crop ? 0.6 : 1), style: FillStyle(eoFill: true))
                    .allowsHitTesting(false)

                if mode == .crop {
                    CropOverlay(
                        cropFrame: layout.cropFrame,
                        showsGrid: dragStartCrop != nil,
                        gesture: { handle in cropGesture(handle, imageFrame: layout.imageFrame) }
                    )
                    .transition(.opacity)
                }
            }
            .frame(width: geo.size.width, height: geo.size.height)
        }
        .clipped()
    }

    private func cropGesture(_ handle: CropHandle, imageFrame: CGRect) -> some Gesture {
        DragGesture(minimumDistance: 0)
            .onChanged { value in
                if dragStartCrop == nil { dragStartCrop = crop }
                guard let start = dragStartCrop, imageFrame.width > 0, imageFrame.height > 0 else { return }
                crop = handle.adjust(
                    start,
                    dx: value.translation.width / imageFrame.width,
                    dy: value.translation.height / imageFrame.height,
                    minWidth: 56 / imageFrame.width,
                    minHeight: 56 / imageFrame.height
                )
            }
            .onEnded { _ in dragStartCrop = nil }
    }

    // MARK: - Controls

    @ViewBuilder
    private func controls(_ image: EditorImage) -> some View {
        VStack(spacing: Spacing.md) {
            Group {
                switch mode {
                case .crop: cropControls(image)
                case .adjust: adjustControls
                }
            }
            .frame(height: 104)

            VStack(spacing: Spacing.xs) {
                Text(mode == .crop ? "ZUSCHNEIDEN" : "ANPASSEN")
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(.secondary)
                GlassSegmentedToggle(
                    options: [Mode.crop, Mode.adjust],
                    selection: Binding(
                        get: { mode },
                        set: { newMode in withAnimation(.snappy(duration: 0.35)) { mode = newMode } }
                    ),
                    systemImage: { $0 == .crop ? "crop.rotate" : "slider.horizontal.3" },
                    accessibilityLabel: { $0 == .crop ? "Zuschneiden und Drehen" : "Helligkeit und Kontrast" }
                )
            }
        }
        .padding(.horizontal, Spacing.md)
        .disabled(isSaving)
    }

    private func cropControls(_ image: EditorImage) -> some View {
        GlassEffectContainer(spacing: Spacing.sm) {
            HStack(spacing: Spacing.sm) {
                GlassIconButton(systemImage: "rotate.left") { rotate(by: -1) }
                    .accessibilityLabel("Nach links drehen")
                GlassIconButton(systemImage: "rotate.right") { rotate(by: 1) }
                    .accessibilityLabel("Nach rechts drehen")

                Spacer()

                Menu {
                    Button("Original") { setAspect(nil, image: image) }
                    ForEach(AspectPreset.allCases) { preset in
                        Button(preset.title) { setAspect(preset, image: image) }
                    }
                } label: {
                    Image(systemName: "aspectratio")
                        .font(.system(size: 17, weight: .medium))
                        .frame(width: 40, height: 40)
                }
                .buttonStyle(.glass)
                .accessibilityLabel("Seitenverhältnis")

                GlassIconButton(systemImage: "arrow.counterclockwise") {
                    withAnimation(.snappy) {
                        quarterTurns = 0
                        crop = NormalizedRect.full
                    }
                }
                .accessibilityLabel("Zuschnitt zurücksetzen")
                .disabled(quarterTurns == 0 && NormalizedRect.isFull(crop))
            }
        }
    }

    private var adjustControls: some View {
        VStack(spacing: Spacing.sm) {
            AdjustmentSlider(title: "Helligkeit", systemImage: "sun.max", value: $brightness)
            AdjustmentSlider(title: "Kontrast", systemImage: "circle.lefthalf.filled", value: $contrast)
        }
    }

    private func rotate(by turns: Int) {
        quarterTurns = ((quarterTurns + turns) % 4 + 4) % 4
        crop = NormalizedRect.rotated(crop, clockwiseTurns: turns)
    }

    private func setAspect(_ preset: AspectPreset?, image: EditorImage) {
        withAnimation(.snappy) {
            guard let preset else {
                crop = NormalizedRect.full
                return
            }
            let imageAspect = image.displayAspect(quarterTurns: quarterTurns)
            // Follow the photo's orientation: 4:3 on a portrait photo is 3:4.
            let aspect = imageAspect >= 1 ? preset.ratio : 1 / preset.ratio
            crop = NormalizedRect.centered(aspect: aspect, imageAspect: imageAspect)
        }
    }

    // MARK: - Networking

    private func load() async {
        guard let url = AssetChanges.shared.versionedURL(APIClient.fileURL(for: asset), assetId: asset.id) else {
            loadState = .failed("Keine Server-Verbindung konfiguriert.")
            return
        }
        do {
            let (data, response) = try await URLSession.shared.data(from: url)
            if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
                loadState = .failed("Serverfehler (\(http.statusCode))")
                return
            }
            guard let image = await EditorImage.decode(data) else {
                loadState = .failed("Das Bildformat wird nicht unterstützt.")
                return
            }
            // Only trust a remembered earlier edit if it still explains the
            // file we just downloaded (it may have been edited/reverted on
            // another device since).
            if let record = PhotoEditRecord.load(assetId: asset.id) {
                let expected = record.resultSize
                if abs(expected.width - image.pixelSize.width) <= 2, abs(expected.height - image.pixelSize.height) <= 2 {
                    baseRecord = record
                } else {
                    PhotoEditRecord.remove(assetId: asset.id)
                }
            }
            loadState = .loaded(image)
        } catch {
            loadState = .failed(error.localizedDescription)
        }
    }

    private func save() async {
        guard case .loaded(let image) = loadState else { return }
        let base = baseRecord ?? .identity(width: image.pixelSize.width, height: image.pixelSize.height)
        let composed = base.composing(
            sourceCrop: NormalizedRect.rotated(crop, clockwiseTurns: -quarterTurns),
            turns: quarterTurns,
            brightness: brightness,
            contrast: contrast
        )
        guard composed != base else {
            dismiss()
            return
        }
        // Edits that cancel each other out (e.g. four rotations) = original.
        if composed.isIdentity {
            await revert()
            return
        }

        isSaving = true
        defer { isSaving = false }
        do {
            let updated: Asset = try await APIClient.shared.request(
                "/assets/\(asset.id)/edit", method: "POST", body: composed.request
            )
            composed.save(assetId: asset.id)
            await finish(with: updated)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func revert() async {
        isSaving = true
        defer { isSaving = false }
        do {
            let updated: Asset = try await APIClient.shared.request("/assets/\(asset.id)/revert", method: "POST")
            PhotoEditRecord.remove(assetId: asset.id)
            await finish(with: updated)
        } catch APIError.server(status: 400, _) {
            PhotoEditRecord.remove(assetId: asset.id)
            errorMessage = "Dieses Foto wurde noch nicht bearbeitet – es ist bereits das Original."
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func finish(with updated: Asset) async {
        await AssetChanges.shared.pixelsChanged(updated)
        onFinish(updated)
        dismiss()
    }
}

// MARK: - Image

/// Upright, downscaled copy of the photo for on-screen editing, plus the
/// real pixel size (crop coordinates are sent in real pixels).
struct EditorImage: @unchecked Sendable {
    let cgImage: CGImage
    let pixelSize: CGSize

    func displayImage(quarterTurns: Int) -> UIImage {
        // Changing only the orientation flag rotates for free - no redraw.
        let orientations: [UIImage.Orientation] = [.up, .right, .down, .left]
        return UIImage(cgImage: cgImage, scale: 1, orientation: orientations[quarterTurns])
    }

    func displayAspect(quarterTurns: Int) -> CGFloat {
        guard pixelSize.width > 0, pixelSize.height > 0 else { return 1 }
        let aspect = pixelSize.width / pixelSize.height
        return quarterTurns % 2 == 0 ? aspect : 1 / aspect
    }

    static func decode(_ data: Data) async -> EditorImage? {
        await Task.detached(priority: .userInitiated) { () -> EditorImage? in
            guard let image = UIImage(data: data) else { return nil }
            // UIImage applies EXIF orientation, so this is the upright size -
            // the same space the server crops in (sharp `.rotate()` first).
            let size = CGSize(width: image.size.width * image.scale, height: image.size.height * image.scale)
            let scale = min(1, 2048 / max(size.width, size.height))
            let target = CGSize(width: (size.width * scale).rounded(), height: (size.height * scale).rounded())
            let format = UIGraphicsImageRendererFormat()
            format.scale = 1
            let rendered = UIGraphicsImageRenderer(size: target, format: format).image { _ in
                image.draw(in: CGRect(origin: .zero, size: target))
            }
            guard let cgImage = rendered.cgImage else { return nil }
            return EditorImage(cgImage: cgImage, pixelSize: size)
        }.value
    }
}

// MARK: - Layout

/// Where the image and the crop rect sit on screen. While cropping the
/// whole image is fitted; while adjusting, the crop itself is fitted so the
/// preview shows the final framing.
private struct EditorLayout {
    let imageFrame: CGRect
    let cropFrame: CGRect

    init(bounds: CGRect, imageAspect: CGFloat, crop: CGRect, zoomToCrop: Bool) {
        if zoomToCrop, crop.width > 0, crop.height > 0 {
            let cropAspect = imageAspect * crop.width / crop.height
            let fitted = Self.fit(aspect: cropAspect, in: bounds)
            let width = fitted.width / crop.width
            let height = fitted.height / crop.height
            imageFrame = CGRect(x: fitted.minX - crop.minX * width, y: fitted.minY - crop.minY * height, width: width, height: height)
            cropFrame = fitted
        } else {
            let fitted = Self.fit(aspect: imageAspect, in: bounds)
            imageFrame = fitted
            cropFrame = CGRect(
                x: fitted.minX + crop.minX * fitted.width,
                y: fitted.minY + crop.minY * fitted.height,
                width: crop.width * fitted.width,
                height: crop.height * fitted.height
            )
        }
    }

    static func fit(aspect: CGFloat, in bounds: CGRect) -> CGRect {
        guard bounds.width > 0, bounds.height > 0, aspect > 0 else { return bounds }
        var size = CGSize(width: bounds.width, height: bounds.width / aspect)
        if size.height > bounds.height {
            size = CGSize(width: bounds.height * aspect, height: bounds.height)
        }
        return CGRect(x: bounds.midX - size.width / 2, y: bounds.midY - size.height / 2, width: size.width, height: size.height)
    }
}

// MARK: - Crop overlay

enum CropHandle: CaseIterable {
    case move
    case top, bottom, left, right
    case topLeft, topRight, bottomLeft, bottomRight

    private var movesLeft: Bool { [.left, .topLeft, .bottomLeft].contains(self) }
    private var movesRight: Bool { [.right, .topRight, .bottomRight].contains(self) }
    private var movesTop: Bool { [.top, .topLeft, .topRight].contains(self) }
    private var movesBottom: Bool { [.bottom, .bottomLeft, .bottomRight].contains(self) }

    /// Anchor point of the handle in unit coordinates of the crop rect.
    var unitPoint: UnitPoint {
        switch self {
        case .move: return .center
        case .top: return .top
        case .bottom: return .bottom
        case .left: return .leading
        case .right: return .trailing
        case .topLeft: return .topLeading
        case .topRight: return .topTrailing
        case .bottomLeft: return .bottomLeading
        case .bottomRight: return .bottomTrailing
        }
    }

    /// New crop (unit coordinates) after dragging this handle by (dx, dy).
    func adjust(_ start: CGRect, dx: CGFloat, dy: CGFloat, minWidth: CGFloat, minHeight: CGFloat) -> CGRect {
        if self == .move {
            let x = min(max(start.minX + dx, 0), 1 - start.width)
            let y = min(max(start.minY + dy, 0), 1 - start.height)
            return CGRect(x: x, y: y, width: start.width, height: start.height)
        }
        var minX = start.minX, maxX = start.maxX, minY = start.minY, maxY = start.maxY
        let minW = min(minWidth, start.width), minH = min(minHeight, start.height)
        if movesLeft { minX = min(max(minX + dx, 0), maxX - minW) }
        if movesRight { maxX = max(min(maxX + dx, 1), minX + minW) }
        if movesTop { minY = min(max(minY + dy, 0), maxY - minH) }
        if movesBottom { maxY = max(min(maxY + dy, 1), minY + minH) }
        return CGRect(x: minX, y: minY, width: maxX - minX, height: maxY - minY)
    }
}

private struct CropOverlay<G: Gesture>: View {
    let cropFrame: CGRect
    let showsGrid: Bool
    let gesture: (CropHandle) -> G

    private let hitSize: CGFloat = 44

    var body: some View {
        ZStack(alignment: .topLeading) {
            if showsGrid {
                ThirdsGrid(rect: cropFrame)
                    .stroke(.white.opacity(0.5), lineWidth: 0.5)
            }
            Rectangle()
                .path(in: cropFrame)
                .stroke(.white.opacity(0.9), lineWidth: 1)
            CropCorners(rect: cropFrame)
                .stroke(.white, style: StrokeStyle(lineWidth: 3, lineCap: .square))

            // Interior first so the edge/corner targets win where they overlap.
            Color.clear
                .contentShape(Rectangle())
                .frame(width: max(cropFrame.width - hitSize, 1), height: max(cropFrame.height - hitSize, 1))
                .position(x: cropFrame.midX, y: cropFrame.midY)
                .gesture(gesture(.move))
                .accessibilityHidden(true)

            ForEach(CropHandle.allCases.filter { $0 != .move }, id: \.self) { handle in
                let point = CGPoint(
                    x: cropFrame.minX + handle.unitPoint.x * cropFrame.width,
                    y: cropFrame.minY + handle.unitPoint.y * cropFrame.height
                )
                Color.clear
                    .contentShape(Rectangle())
                    .frame(width: hitSize, height: hitSize)
                    .position(point)
                    .gesture(gesture(handle))
                    .accessibilityHidden(true)
            }
        }
    }
}

/// Full rect minus the crop hole (even-odd fill). Animatable so the hole
/// glides when switching between crop and adjust mode.
private struct CropDimShape: Shape {
    var outer: CGRect
    var hole: CGRect

    var animatableData: AnimatablePair<AnimatablePair<CGFloat, CGFloat>, AnimatablePair<CGFloat, CGFloat>> {
        get { .init(.init(hole.minX, hole.minY), .init(hole.width, hole.height)) }
        set { hole = CGRect(x: newValue.first.first, y: newValue.first.second, width: newValue.second.first, height: newValue.second.second) }
    }

    func path(in rect: CGRect) -> Path {
        var path = Path()
        path.addRect(outer.insetBy(dx: -2000, dy: -2000))
        path.addRect(hole)
        return path
    }
}

private struct CropCorners: Shape {
    let rect: CGRect

    func path(in _: CGRect) -> Path {
        let length = min(20, rect.width / 3, rect.height / 3)
        var path = Path()
        let r = rect.insetBy(dx: -1.5, dy: -1.5)
        path.move(to: CGPoint(x: r.minX, y: r.minY + length)); path.addLine(to: CGPoint(x: r.minX, y: r.minY)); path.addLine(to: CGPoint(x: r.minX + length, y: r.minY))
        path.move(to: CGPoint(x: r.maxX - length, y: r.minY)); path.addLine(to: CGPoint(x: r.maxX, y: r.minY)); path.addLine(to: CGPoint(x: r.maxX, y: r.minY + length))
        path.move(to: CGPoint(x: r.maxX, y: r.maxY - length)); path.addLine(to: CGPoint(x: r.maxX, y: r.maxY)); path.addLine(to: CGPoint(x: r.maxX - length, y: r.maxY))
        path.move(to: CGPoint(x: r.minX + length, y: r.maxY)); path.addLine(to: CGPoint(x: r.minX, y: r.maxY)); path.addLine(to: CGPoint(x: r.minX, y: r.maxY - length))
        return path
    }
}

private struct ThirdsGrid: Shape {
    let rect: CGRect

    func path(in _: CGRect) -> Path {
        var path = Path()
        for i in 1...2 {
            let x = rect.minX + rect.width * CGFloat(i) / 3
            let y = rect.minY + rect.height * CGFloat(i) / 3
            path.move(to: CGPoint(x: x, y: rect.minY)); path.addLine(to: CGPoint(x: x, y: rect.maxY))
            path.move(to: CGPoint(x: rect.minX, y: y)); path.addLine(to: CGPoint(x: rect.maxX, y: y))
        }
        return path
    }
}

private enum AspectPreset: String, CaseIterable, Identifiable {
    case square, fourThree, threeTwo, sixteenNine

    var id: String { rawValue }

    var title: String {
        switch self {
        case .square: return "Quadratisch"
        case .fourThree: return "4:3"
        case .threeTwo: return "3:2"
        case .sixteenNine: return "16:9"
        }
    }

    var ratio: CGFloat {
        switch self {
        case .square: return 1
        case .fourThree: return 4.0 / 3.0
        case .threeTwo: return 3.0 / 2.0
        case .sixteenNine: return 16.0 / 9.0
        }
    }
}

// MARK: - Adjustment slider

private struct AdjustmentSlider: View {
    let title: String
    let systemImage: String
    @Binding var value: Double

    var body: some View {
        VStack(spacing: 2) {
            HStack {
                Label(title, systemImage: systemImage)
                    .font(.footnote.weight(.medium))
                Spacer()
                if value != 0 {
                    Button("Zurücksetzen") { withAnimation { value = 0 } }
                        .font(.caption)
                }
                Text(value == 0 ? "0" : value.formatted(.number.sign(strategy: .always()).precision(.fractionLength(0))))
                    .font(.footnote.monospacedDigit())
                    .foregroundStyle(.secondary)
                    .frame(minWidth: 36, alignment: .trailing)
            }
            Slider(value: $value, in: -100...100, step: 1)
                .accessibilityLabel(title)
                .accessibilityValue(Text("\(Int(value))"))
        }
    }
}
