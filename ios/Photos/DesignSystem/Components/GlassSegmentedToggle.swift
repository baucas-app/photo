import SwiftUI

/// Compact icon-only segmented control rendered as one floating Liquid
/// Glass capsule (same family as GlassIconButton / GlassFloatingActionButton
/// in GlassOverlayBar.swift). The selected segment gets a tinted glass pill
/// that slides between segments via matchedGeometryEffect instead of the
/// flat look of a stock `.segmented` Picker.
struct GlassSegmentedToggle<Option: Hashable>: View {
    let options: [Option]
    @Binding var selection: Option
    let systemImage: (Option) -> String
    let accessibilityLabel: (Option) -> String

    @Namespace private var selectionNamespace

    var body: some View {
        GlassEffectContainer(spacing: Spacing.xs) {
            HStack(spacing: 0) {
                ForEach(options, id: \.self) { option in
                    segment(for: option)
                }
            }
            .padding(Spacing.xs)
            .glassEffect(.regular.interactive(), in: Capsule())
        }
        // Pinned to the same 44pt as GlassFloatingActionButton (see the
        // comment there) so the two controls line up exactly when shown
        // side by side, regardless of either one's internal padding.
        .frame(height: 44)
        .sensoryFeedback(.selection, trigger: selection)
        .accessibilityElement(children: .contain)
    }

    private func segment(for option: Option) -> some View {
        let isSelected = option == selection
        return Button {
            withAnimation(.snappy(duration: 0.3)) { selection = option }
        } label: {
            Image(systemName: systemImage(option))
                .font(.system(size: 15, weight: .semibold))
                .symbolRenderingMode(.hierarchical)
                .foregroundStyle(isSelected ? Color.accentColor : Color.secondary)
                .frame(width: 44, height: 36)
                .contentShape(Capsule())
                .background {
                    if isSelected {
                        Capsule()
                            .fill(Color.accentColor.opacity(0.16))
                            .matchedGeometryEffect(id: "selection", in: selectionNamespace)
                    }
                }
        }
        .buttonStyle(.plain)
        .accessibilityLabel(accessibilityLabel(option))
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }
}
