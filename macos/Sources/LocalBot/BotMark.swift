import SwiftUI
import AppKit

/// Original supplied artwork, decoded once. Agent identity changes only its displayed tint.
struct BotMark: View {
  var tint: Color = .white
  private static let artwork: NSImage = {
    let url = Bundle.main.url(forResource: "LocalBotMark", withExtension: "png")
      ?? Bundle.module.url(forResource: "LocalBotMark", withExtension: "png")!
    return NSImage(contentsOf: url)!
  }()
  var body: some View {
    Canvas { context, size in
      context.addFilter(.colorMultiply(tint))
      context.draw(Image(nsImage: Self.artwork), in: CGRect(origin: .zero, size: size))
    }
  }
}
