import AppKit
import SwiftUI

/// Return submits; Shift-Return edits at the selection, including with an IME.
struct ComposerEditor: NSViewRepresentable {
  @Binding var text: String
  var fontSize: CGFloat
  var send: () -> Void
  func makeCoordinator() -> Coordinator { Coordinator(self) }
  func makeNSView(context: Context) -> NSScrollView {
    let scroll = NSScrollView()
    scroll.drawsBackground = false; scroll.hasVerticalScroller = true
    let editor = MessageEditor()
    editor.isRichText = false; editor.drawsBackground = false
    editor.textContainerInset = NSSize(width: 0, height: 2)
    editor.textContainer?.lineFragmentPadding = 0
    editor.isHorizontallyResizable = false; editor.isVerticallyResizable = true
    editor.autoresizingMask = [.width]
    editor.textContainer?.widthTracksTextView = true
    editor.delegate = context.coordinator
    editor.onSend = send
    scroll.documentView = editor
    return scroll
  }
  func updateNSView(_ scroll: NSScrollView, context: Context) {
    context.coordinator.parent = self
    guard let editor = scroll.documentView as? MessageEditor else { return }
    editor.onSend = send
    editor.font = .systemFont(ofSize: fontSize); editor.textColor = .labelColor
    if editor.string != text { editor.string = text }
  }
  func sizeThatFits(_ proposal: ProposedViewSize, nsView: NSScrollView, context: Context) -> CGSize? {
    let width = max(40, proposal.width ?? 400)
    let attributes: [NSAttributedString.Key: Any] = [.font: NSFont.systemFont(ofSize: fontSize)]
    let height = (text + " ").boundingRect(with: NSSize(width: width - 16, height: 1000), options: [.usesLineFragmentOrigin], attributes: attributes).height
    return NSSize(width: width, height: min(140, max(fontSize + 7, ceil(height) + 5)))
  }
  class Coordinator: NSObject, NSTextViewDelegate {
    var parent: ComposerEditor
    init(_ parent: ComposerEditor) { self.parent = parent }
    func textDidChange(_ notification: Notification) {
      if let editor = notification.object as? NSTextView { parent.text = editor.string }
    }
  }
}
final class MessageEditor: NSTextView {
  var onSend: (() -> Void)?
  override func keyDown(with event: NSEvent) {
    if event.keyCode == 36 || event.keyCode == 76, !hasMarkedText() {
      if event.modifierFlags.contains(.shift) { insertNewlineIgnoringFieldEditor(nil) }
      else { onSend?() }
      return
    }
    super.keyDown(with: event)
  }
}
