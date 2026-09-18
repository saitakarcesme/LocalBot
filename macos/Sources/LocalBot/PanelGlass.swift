import AppKit
import SwiftUI

/// One continuous backing beneath navigation, conversation and workspace glass.
struct WindowBackdrop: View {
  var body: some View {
    Color(nsColor: .textBackgroundColor)
      .ignoresSafeArea()
      .allowsHitTesting(false)
      .accessibilityHidden(true)
  }
}

/// Use the same native glass family as the navigation sidebar, with a vibrancy fallback.
struct PanelGlass: ViewModifier {
  @Environment(\.accessibilityReduceTransparency) private var reduceTransparency
  func body(content: Content) -> some View {
    surface(content)
      .overlay {
        RoundedRectangle(cornerRadius: 22, style: .continuous)
          .strokeBorder(LinearGradient(colors: [.white.opacity(0.24), .white.opacity(0.04), .white.opacity(0.10)], startPoint: .topLeading, endPoint: .bottomTrailing), lineWidth: 0.5)
          .allowsHitTesting(false)
      }
      .shadow(color: .black.opacity(0.08), radius: 12, y: 4)
  }
  @ViewBuilder private func surface(_ content: Content) -> some View {
    if reduceTransparency {
      content.background(Color(nsColor: .windowBackgroundColor), in: RoundedRectangle(cornerRadius: 22))
    } else if #available(macOS 26.0, *) {
      content.glassEffect(.regular, in: RoundedRectangle(cornerRadius: 22))
    } else {
      content.background(.regularMaterial, in: RoundedRectangle(cornerRadius: 22))
    }
  }
}
struct PanelResizeHandle: NSViewRepresentable {
  var resize: (Double) -> Void
  func makeNSView(context: Context) -> ResizeRegion { ResizeRegion() }
  func updateNSView(_ view: ResizeRegion, context: Context) { view.resize = resize }
}
final class ResizeRegion: NSView {
  var resize: ((Double) -> Void)?
  private var lastX: CGFloat = 0
  override func resetCursorRects() { addCursorRect(bounds, cursor: .resizeLeftRight) }
  override func mouseDown(with event: NSEvent) { lastX = event.locationInWindow.x }
  override func mouseDragged(with event: NSEvent) {
    let x = event.locationInWindow.x
    resize?(Double(x - lastX)); lastX = x
  }
}

struct PanelButtonStyle: ButtonStyle {
  func makeBody(configuration: Configuration) -> some View {
    if #available(macOS 15.0, *) {
      configuration.label.opacity(configuration.isPressed ? 0.55 : 1).pointerStyle(.link)
    } else { configuration.label.opacity(configuration.isPressed ? 0.55 : 1) }
  }
}
