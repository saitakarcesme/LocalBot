import SwiftUI
import AVKit

/// One playback per app launch. Network connection starts behind the splash.
struct LaunchScreen: View {
  var finished: () -> Void
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @State private var player: AVPlayer?
  @State private var ended = false
  var body: some View {
    ZStack {
      Color.black
      if let player { LaunchVideo(player: player).aspectRatio(16/9, contentMode: .fit) }
    }.ignoresSafeArea().accessibilityLabel("LocalBot is opening")
      .task {
        guard !reduceMotion, let url = Bundle.main.url(forResource: "Launch", withExtension: "mp4") else { finish(); return }
        let item = AVPlayerItem(url: url)
        let playback = AVPlayer(playerItem: item); playback.isMuted = true; player = playback; playback.play()
        // A damaged asset must never trap the user on launch.
        try? await Task.sleep(for: .seconds(9))
        if !Task.isCancelled { finish() }
      }
      .onReceive(NotificationCenter.default.publisher(for: .AVPlayerItemDidPlayToEndTime)) { event in
        if let item = event.object as? AVPlayerItem, item === player?.currentItem { finish() }
      }
      .onDisappear { player?.pause(); player = nil }
  }
  private func finish() { guard !ended else { return }; ended = true; player?.pause(); finished() }
}
#if os(iOS)
private struct LaunchVideo: UIViewRepresentable {
  var player: AVPlayer
  func makeUIView(context: Context) -> Surface { let view = Surface(); view.playerLayer.player = player; view.playerLayer.videoGravity = .resizeAspect; return view }
  func updateUIView(_ view: Surface, context: Context) {}
  final class Surface: UIView {
    override class var layerClass: AnyClass { AVPlayerLayer.self }
    var playerLayer: AVPlayerLayer { layer as! AVPlayerLayer }
  }
}
#else
private struct LaunchVideo: NSViewRepresentable {
  var player: AVPlayer
  func makeNSView(context: Context) -> AVPlayerView { let view = AVPlayerView(); view.player = player; view.controlsStyle = .none; view.videoGravity = .resizeAspect; return view }
  func updateNSView(_ view: AVPlayerView, context: Context) {}
}
#endif
