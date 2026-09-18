import AppKit
import SwiftUI

/// A real two-axis text viewport. Follow the tail only while the reader is at it.
struct TranscriptView: NSViewRepresentable {
  var text: String
  func makeNSView(context: Context) -> TranscriptScrollView { TranscriptScrollView() }
  func updateNSView(_ view: TranscriptScrollView, context: Context) { view.update(text) }
}
final class TranscriptScrollView: NSScrollView {
  private let editor = NSTextView()
  private var previous = ""
  override init(frame: NSRect) {
    super.init(frame: frame)
    drawsBackground = false
    hasVerticalScroller = true; hasHorizontalScroller = true
    autohidesScrollers = false
    editor.isEditable = false; editor.isSelectable = true; editor.isRichText = false
    editor.drawsBackground = false
    editor.font = .monospacedSystemFont(ofSize: 11, weight: .regular)
    editor.textColor = .labelColor
    editor.textContainerInset = NSSize(width: 12, height: 12)
    editor.isHorizontallyResizable = true; editor.isVerticallyResizable = true
    editor.maxSize = NSSize(width: 1_000_000, height: 10_000_000)
    editor.textContainer?.widthTracksTextView = false
    editor.textContainer?.containerSize = editor.maxSize
    documentView = editor
  }
  required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }
  func update(_ value: String) {
    guard previous != value else { return }
    let follow = previous.isEmpty || contentView.bounds.maxY >= editor.bounds.height - 40
    let origin = contentView.bounds.origin
    let selection = editor.selectedRange()
    let old = previous as NSString, new = value as NSString
    var prefix = 0
    let length = min(old.length, new.length)
    while prefix < length && old.character(at: prefix) == new.character(at: prefix) { prefix += 1 }
    editor.textStorage?.replaceCharacters(in: NSRange(location: prefix, length: old.length - prefix), with: new.substring(from: prefix))
    previous = value
    if let storage = editor.textStorage {
      storage.addAttributes([.font: NSFont.monospacedSystemFont(ofSize: 11, weight: .regular), .foregroundColor: NSColor.labelColor], range: NSRange(location: prefix, length: storage.length - prefix))
    }
    editor.layoutManager?.ensureLayout(for: editor.textContainer!)
    let used = editor.layoutManager?.usedRect(for: editor.textContainer!).size ?? .zero
    editor.setFrameSize(NSSize(width: max(contentSize.width, used.width + 24), height: max(contentSize.height, used.height + 24)))
    if selection.upperBound <= new.length { editor.setSelectedRange(selection) }
    contentView.scroll(to: NSPoint(x: origin.x, y: follow ? max(0, editor.frame.height - contentSize.height) : origin.y))
    reflectScrolledClipView(contentView)
  }
}
