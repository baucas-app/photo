import AVFoundation
import SwiftUI

/// Muted, seamlessly looping playback of a Live Photo's paired video - shown
/// while the user holds down "press and hold" on a photo with
/// `livePhotoVideoId` set, mirroring Apple Photos' own Live Photo gesture.
/// `AVPlayerLooper` (queue player + template item) is Apple's recommended
/// gapless-loop API, so there's no manual seek-to-zero/replay bookkeeping.
struct LivePhotoLoopPlayerView: UIViewRepresentable {
    let url: URL

    func makeUIView(context: Context) -> LoopingPlayerUIView {
        LoopingPlayerUIView(url: url)
    }

    func updateUIView(_ uiView: LoopingPlayerUIView, context: Context) {}
}

final class LoopingPlayerUIView: UIView {
    private let queuePlayer = AVQueuePlayer()
    private var playerLooper: AVPlayerLooper?

    override static var layerClass: AnyClass { AVPlayerLayer.self }
    private var playerLayer: AVPlayerLayer { layer as! AVPlayerLayer }

    init(url: URL) {
        super.init(frame: .zero)
        let item = AVPlayerItem(url: url)
        playerLayer.player = queuePlayer
        playerLayer.videoGravity = .resizeAspect
        queuePlayer.isMuted = true
        playerLooper = AVPlayerLooper(player: queuePlayer, templateItem: item)
        queuePlayer.play()
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    deinit {
        queuePlayer.pause()
    }
}
