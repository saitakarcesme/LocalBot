import AppKit
import SwiftUI

/// Use the same native glass family as the navigation sidebar, with a vibrancy fallback.
struct PanelGlass: NSViewRepresentable {
  func makeNSView(context: Context) -> NSView {
    if #available(macOS 26.0, *) {
      let view = NSGlassEffectView(); view.style = .regular; view.cornerRadius = 22
      return view
    }
    let view = NSVisualEffectView()
    view.material = .sidebar; view.blendingMode = .behindWindow; view.state = .active
    return view
  }
  func updateNSView(_ view: NSView, context: Context) {}
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
