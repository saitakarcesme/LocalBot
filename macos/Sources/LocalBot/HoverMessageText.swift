import SwiftUI
import AppKit

struct HoverMessageText: NSViewRepresentable {
  @EnvironmentObject var model: AppModel
  var content: String
  var fontSize: CGFloat = 14
  func makeNSView(context: Context) -> LinkTextView {
    let view = LinkTextView(frame: .zero, textContainer: nil)
    view.isEditable = false; view.isSelectable = true
    view.drawsBackground = false
    view.textContainerInset = .zero
    view.textContainer?.lineFragmentPadding = 0
    view.textContainer?.widthTracksTextView = true
    view.isHorizontallyResizable = false
    view.isVerticallyResizable = true
    view.linkTextAttributes = [.foregroundColor: NSColor.linkColor, .cursor: NSCursor.pointingHand]
    return view
  }
  func updateNSView(_ view: LinkTextView, context: Context) {
    view.openLink = { url in model.openInBrowser(url) }
    guard view.source != content || view.renderedFontSize != fontSize else { return }
    view.measurements.removeAll()
    view.source = content
    view.renderedFontSize = fontSize
    let parsed = inlineMessage(content)
    let result = NSMutableAttributedString()
    for run in parsed.runs {
      var font = NSFont.systemFont(ofSize: fontSize)
      if run.inlinePresentationIntent?.contains(.stronglyEmphasized) == true { font = NSFont.boldSystemFont(ofSize: fontSize) }
      if run.inlinePresentationIntent?.contains(.emphasized) == true { font = NSFontManager.shared.convert(font, toHaveTrait: .italicFontMask) }
      if run.inlinePresentationIntent?.contains(.code) == true { font = NSFont.monospacedSystemFont(ofSize: fontSize - 1, weight: .regular) }
      var attributes: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: NSColor.labelColor]
      if let link = run.link { attributes[.link] = link; attributes[.foregroundColor] = NSColor.linkColor }
      result.append(NSAttributedString(string: String(parsed[run.range].characters), attributes: attributes))
    }
    view.textStorage?.setAttributedString(result)
    view.measurementStorage.setAttributedString(result)
  }
  func sizeThatFits(_ proposal: ProposedViewSize, nsView: LinkTextView, context: Context) -> CGSize? {
    guard nsView.textStorage != nil else { return nil }
    // SwiftUI probes several widths. Measure a separate layout so a discarded
    // narrow proposal cannot leave the displayed text container one glyph wide.
    let width = max(1, proposal.width ?? 530)
    if let cached = nsView.measurements[width] { return cached }
    nsView.measurementContainer.containerSize = CGSize(width: width, height: .greatestFiniteMagnitude)
    nsView.measurementLayout.ensureLayout(for: nsView.measurementContainer)
    let size = nsView.measurementLayout.usedRect(for: nsView.measurementContainer).size
    let result = CGSize(width: ceil(size.width), height: ceil(size.height))
    if nsView.measurements.count > 32 { nsView.measurements.removeAll() }
    nsView.measurements[width] = result
    return result
  }
}

final class LinkTextView: NSTextView {
  // Reuse one TextKit graph while native split-view animation proposes widths.
  let measurementStorage = NSTextStorage()
  let measurementLayout = NSLayoutManager()
  let measurementContainer = NSTextContainer(size: .zero)
  private let displayStorage = NSTextStorage()
  override init(frame: NSRect, textContainer: NSTextContainer?) {
    let displayContainer = textContainer ?? NSTextContainer(size: CGSize(width: 530, height: CGFloat.greatestFiniteMagnitude))
    if textContainer == nil {
      let displayLayout = NSLayoutManager()
      displayStorage.addLayoutManager(displayLayout)
      displayLayout.addTextContainer(displayContainer)
    }
    super.init(frame: frame, textContainer: displayContainer)
    measurementContainer.lineFragmentPadding = 0
    measurementStorage.addLayoutManager(measurementLayout)
    measurementLayout.addTextContainer(measurementContainer)
  }
  required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }
  var openLink: ((URL) -> Void)?
  override func clicked(onLink link: Any, at charIndex: Int) {
    if let url = link as? URL { openLink?(url) }
    else if let value = link as? String, let url = URL(string: value) { openLink?(url) }
  }
  var measurements: [CGFloat: CGSize] = [:]
  var source = ""
  var renderedFontSize: CGFloat = 0
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
  override func mouseExited(with event: NSEvent) { clearHover(); super.mouseExited(with: event) }
  private func clearHover() {
    if let range = hoverRange, range.upperBound <= (textStorage?.length ?? 0) { textStorage?.removeAttribute(.underlineStyle, range: range) }
    hoverRange = nil
  }
}
