import AppKit
import SwiftUI

/// Use the same native glass family as the navigation sidebar, with a vibrancy fallback.
struct PanelGlass: ViewModifier {
  func body(content: Content) -> some View {
    if #available(macOS 26.0, *) {
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
