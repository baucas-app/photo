import AVKit
import SwiftUI

struct VideoPlayerView: View {
    let url: URL?

    var body: some View {
        if let url {
            VideoPlayer(player: AVPlayer(url: url))
        } else {
            ProgressView().tint(.white)
        }
    }
}
