import SwiftUI
import AppKit

struct HoverMessageText: NSViewRepresentable {
  var content: String
  func makeNSView(context: Context) -> LinkTextView {
    let view = LinkTextView()
    view.isEditable = false; view.isSelectable = true
    view.drawsBackground = false
    view.textContainerInset = .zero
    view.textContainer?.lineFragmentPadding = 0
    view.textContainer?.widthTracksTextView = false
    view.linkTextAttributes = [.foregroundColor: NSColor.linkColor, .underlineStyle: 0, .cursor: NSCursor.pointingHand]
    return view
  }
  func updateNSView(_ view: LinkTextView, context: Context) {
    guard view.source != content else { return }
    view.source = content
    let parsed = inlineMessage(content)
    let result = NSMutableAttributedString()
    for run in parsed.runs {
      var font = NSFont.systemFont(ofSize: 14)
      if run.inlinePresentationIntent?.contains(.stronglyEmphasized) == true { font = NSFont.boldSystemFont(ofSize: 14) }
      if run.inlinePresentationIntent?.contains(.emphasized) == true { font = NSFontManager.shared.convert(font, toHaveTrait: .italicFontMask) }
      if run.inlinePresentationIntent?.contains(.code) == true { font = NSFont.monospacedSystemFont(ofSize: 13, weight: .regular) }
      var attributes: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: NSColor.labelColor]
      if let link = run.link { attributes[.link] = link; attributes[.foregroundColor] = NSColor.linkColor }
      result.append(NSAttributedString(string: String(parsed[run.range].characters), attributes: attributes))
    }
    view.textStorage?.setAttributedString(result)
  }
  func sizeThatFits(_ proposal: ProposedViewSize, nsView: LinkTextView, context: Context) -> CGSize? {
    guard let container = nsView.textContainer, let layout = nsView.layoutManager else { return nil }
    container.containerSize = CGSize(width: max(1, proposal.width ?? 530), height: .greatestFiniteMagnitude)
    layout.ensureLayout(for: container)
    let size = layout.usedRect(for: container).size
    return CGSize(width: ceil(size.width), height: ceil(size.height))
  }
}

final class LinkTextView: NSTextView {
  var source = ""
  private var hoverRange: NSRange?
  private var tracking: NSTrackingArea?
  override func updateTrackingAreas() {
    super.updateTrackingAreas()
    if let tracking { removeTrackingArea(tracking) }
    let area = NSTrackingArea(rect: .zero, options: [.mouseMoved, .mouseEnteredAndExited, .activeInKeyWindow, .inVisibleRect], owner: self)
    addTrackingArea(area); tracking = area
  }
  override func mouseMoved(with event: NSEvent) {
    let point = convert(event.locationInWindow, from: nil)
    guard let layout = layoutManager, let container = textContainer, let storage = textStorage, storage.length > 0 else { return }
    let glyph = layout.glyphIndex(for: point, in: container)
    guard glyph < layout.numberOfGlyphs else { clearHover(); return }
    let rect = layout.boundingRect(forGlyphRange: NSRange(location: glyph, length: 1), in: container)
    let index = layout.characterIndexForGlyph(at: glyph)
    var range = NSRange()
    if rect.contains(point), index < storage.length, storage.attribute(.link, at: index, effectiveRange: &range) != nil {
      if hoverRange != range { clearHover(); storage.addAttribute(.underlineStyle, value: NSUnderlineStyle.single.rawValue, range: range); hoverRange = range }
      NSCursor.pointingHand.set()
    } else { clearHover(); NSCursor.iBeam.set() }
  }
  override func mouseExited(with event: NSEvent) { clearHover(); NSCursor.arrow.set() }
  private func clearHover() {
    if let range = hoverRange, range.upperBound <= (textStorage?.length ?? 0) { textStorage?.removeAttribute(.underlineStyle, range: range) }
    hoverRange = nil
  }
}
