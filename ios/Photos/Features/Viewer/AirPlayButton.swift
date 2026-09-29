import AVKit
import SwiftUI

/// Native AirPlay route picker (system-rendered - lists nearby receivers,
/// e.g. an Apple TV, and mirrors on tap) wrapped for SwiftUI and styled to
/// match `GlassIconButton`'s 40×40 glass circle.
struct AirPlayButton: View {
    var body: some View {
        AirPlayRoutePickerView()
            .frame(width: 20, height: 20)
            .frame(width: 40, height: 40)
            .glassEffect(.regular, in: Circle())
    }
}

private struct AirPlayRoutePickerView: UIViewRepresentable {
    func makeUIView(context: Context) -> AVRoutePickerView {
        let view = AVRoutePickerView()
        view.tintColor = .white
        view.activeTintColor = .systemBlue
        view.prioritizesVideoDevices = true
        view.backgroundColor = .clear
        return view
    }

    func updateUIView(_ uiView: AVRoutePickerView, context: Context) {}
}
