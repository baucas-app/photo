import MapKit
import SwiftUI

/// Metadata sheet for the photo viewer, styled after Apple Photos' own
/// swipe-up info panel: a date/time card, camera + format, lens + size,
/// a row of shooting parameters, and a small location map when there's GPS
/// data. Presented as a resizable sheet (`.medium`/`.large` detents) so it
/// gets the same drag-to-grow/drag-to-dismiss feel as Apple's for free.
struct PhotoInfoView: View {
    let asset: Asset

    @State private var assignedLabels: [UserLabel] = []
    @State private var allLabels: [UserLabel] = []
    @State private var showLabelPicker = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: Spacing.md) {
                    dateCard
                    cameraCard
                    lensAndSizeCard
                    specsRow
                    if let coordinate {
                        locationCard(coordinate)
                    }
                    if let text = asset.ocrText, !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                        ocrCard(text)
                    }
                    labelsCard
                }
                .padding(Spacing.md)
            }
            .background(Color(.systemGroupedBackground))
            .navigationTitle("Information")
            .navigationBarTitleDisplayMode(.inline)
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .task {
            assignedLabels = (try? await APIClient.shared.request("/assets/\(asset.id)/labels")) ?? []
            allLabels = (try? await APIClient.shared.request("/user-labels")) ?? []
        }
    }

    private var labelsCard: some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            HStack {
                Label("Labels", systemImage: "tag")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                Spacer()
                if !allLabels.isEmpty {
                    Button { showLabelPicker.toggle() } label: {
                        Image(systemName: "plus.circle")
                            .font(.caption)
                    }
                }
            }

            if assignedLabels.isEmpty {
                Text("Noch keine Labels").font(.caption).foregroundStyle(.secondary)
            } else {
                FlowLayout(spacing: 6) {
                    ForEach(assignedLabels) { label in
                        HStack(spacing: 4) {
                            Circle().fill(label.swiftUIColor).frame(width: 8, height: 8)
                            Text(label.name).font(.caption)
                            Button {
                                Task { await removeLabel(label.id) }
                            } label: {
                                Image(systemName: "xmark").font(.system(size: 8))
                            }
                        }
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(.secondary.opacity(0.12), in: Capsule())
                    }
                }
            }

            if showLabelPicker {
                let unassigned = allLabels.filter { l in !assignedLabels.contains(where: { $0.id == l.id }) }
                if unassigned.isEmpty {
                    Text("Alle Labels bereits zugewiesen").font(.caption).foregroundStyle(.secondary)
                } else {
                    FlowLayout(spacing: 6) {
                        ForEach(unassigned) { label in
                            Button {
                                Task {
                                    await assignLabel(label.id)
                                    showLabelPicker = false
                                }
                            } label: {
                                HStack(spacing: 4) {
                                    Circle().fill(label.swiftUIColor).frame(width: 8, height: 8)
                                    Text(label.name).font(.caption)
                                }
                                .padding(.horizontal, 8)
                                .padding(.vertical, 4)
                                .background(.secondary.opacity(0.08), in: Capsule())
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(Spacing.md)
        .background(card, in: cardShape)
    }

    private func assignLabel(_ labelId: String) async {
        struct Body: Encodable { let labelId: String }
        try? await APIClient.shared.requestVoid(
            "/assets/\(asset.id)/labels", method: "POST", body: Body(labelId: labelId)
        )
        assignedLabels = (try? await APIClient.shared.request("/assets/\(asset.id)/labels")) ?? []
    }

    private func removeLabel(_ labelId: String) async {
        try? await APIClient.shared.requestVoid("/assets/\(asset.id)/labels/\(labelId)", method: "DELETE")
        assignedLabels.removeAll { $0.id == labelId }
    }

    private var coordinate: CLLocationCoordinate2D? {
        guard let latitude = asset.latitude, let longitude = asset.longitude else { return nil }
        return CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
    }

    private var card: some ShapeStyle { .thinMaterial }
    private var cardShape: RoundedRectangle { RoundedRectangle(cornerRadius: Radius.md, style: .continuous) }

    private var dateCard: some View {
        HStack {
            Text(fullDateText)
                .font(.subheadline.weight(.medium))
            Spacer()
        }
        .padding(Spacing.md)
        .background(card, in: cardShape)
    }

    private var cameraCard: some View {
        HStack {
            Text(cameraText)
                .font(.subheadline)
                .foregroundStyle(cameraText == noCameraText ? .secondary : .primary)
            Spacer()
            Text(formatBadge)
                .font(.caption.weight(.semibold))
                .padding(.horizontal, Spacing.sm)
                .padding(.vertical, 4)
                .background(.secondary.opacity(0.15), in: Capsule())
        }
        .padding(Spacing.md)
        .background(card, in: cardShape)
    }

    private var lensAndSizeCard: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(lensText)
                .font(.subheadline)
                .foregroundStyle(lensText == noLensText ? .secondary : .primary)
            Text(sizeText)
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(Spacing.md)
        .background(card, in: cardShape)
    }

    private var specsRow: some View {
        HStack(spacing: 0) {
            specColumn("Brennweite", focalLengthText)
            Divider()
            specColumn("Blende", fNumberText)
            Divider()
            specColumn("Belichtung", exposureTimeText)
            Divider()
            specColumn("ISO", isoText)
        }
        .padding(.vertical, Spacing.sm)
        .background(card, in: cardShape)
    }

    private func specColumn(_ label: String, _ value: String) -> some View {
        VStack(spacing: 2) {
            Text(value).font(.subheadline.weight(.medium))
            Text(label).font(.caption2).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
    }

    private func ocrCard(_ text: String) -> some View {
        VStack(alignment: .leading, spacing: Spacing.xs) {
            Label("Erkannter Text", systemImage: "doc.text.magnifyingglass")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
            Text(text)
                .font(.subheadline)
                .textSelection(.enabled)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(Spacing.md)
        .background(card, in: cardShape)
    }

    private func locationCard(_ coordinate: CLLocationCoordinate2D) -> some View {
        Map(position: .constant(.region(
            MKCoordinateRegion(center: coordinate, latitudinalMeters: 1200, longitudinalMeters: 1200)
        ))) {
            Marker("", coordinate: coordinate)
        }
        .allowsHitTesting(false)
        .frame(height: 150)
        .clipShape(cardShape)
    }

    // MARK: - Formatting

    private var germanLocale: Locale { Locale(identifier: "de_DE") }

    private var fullDateText: String {
        guard let takenAt = asset.takenAt else { return "Kein Aufnahmedatum" }
        return takenAt.formatted(
            .dateTime.weekday(.wide).day().month(.wide).year().hour().minute()
                .locale(germanLocale)
        )
    }

    private let noCameraText = "Keine Kamerainformationen"
    private var cameraText: String {
        let parts = [asset.cameraMake, asset.cameraModel].compactMap { $0 }
        return parts.isEmpty ? noCameraText : parts.joined(separator: " ")
    }

    private let noLensText = "Keine Objektivinformationen"
    private var lensText: String { asset.lensModel ?? noLensText }

    private var sizeText: String {
        var parts: [String] = []
        if let width = asset.width, let height = asset.height {
            let megapixels = Double(width * height) / 1_000_000
            parts.append(String(format: "%.0f MP", megapixels))
            parts.append("\(width) × \(height)")
        }
        if let size = asset.size {
            let formatter = ByteCountFormatter()
            formatter.countStyle = .file
            parts.append(formatter.string(fromByteCount: Int64(size)))
        }
        return parts.joined(separator: " · ")
    }

    private var formatBadge: String {
        if asset.isRAW { return "RAW" }
        guard let mimeType = asset.mimeType, let subtype = mimeType.split(separator: "/").last else { return "-" }
        switch subtype {
        case "quicktime": return "MOV"
        case "jpeg": return "JPEG"
        default: return subtype.uppercased()
        }
    }

    private var focalLengthText: String {
        asset.focalLength.map { "\(Int($0))mm" } ?? "-"
    }

    private var fNumberText: String {
        asset.fNumber.map { "f/\($0)" } ?? "-"
    }

    private var exposureTimeText: String {
        guard let exposureTime = asset.exposureTime else { return "-" }
        return exposureTime >= 1 ? "\(exposureTime)s" : "1/\(Int((1 / exposureTime).rounded()))s"
    }

    private var isoText: String {
        asset.iso.map { "\($0)" } ?? "-"
    }
}
