import XCTest
import AppKit
@testable import LocalBot

final class PanelTests: XCTestCase {
  @MainActor func testReusedMessageLayoutMatchesFreshLayoutAcrossSidebarWidths() {
    let view = LinkTextView(frame: .zero, textContainer: nil)
    XCTAssertNotNil(view.textStorage)
    view.textStorage?.setAttributedString(NSAttributedString(string: "Visible response"))
    XCTAssertEqual(view.string, "Visible response")
    let text = NSAttributedString(string: String(repeating: "A longer message with links and source details. ", count: 100), attributes: [.font: NSFont.systemFont(ofSize: 14)])
    view.measurementStorage.setAttributedString(text)
    for width in [240.0, 530, 310, 530, 240] {
      view.measurementContainer.containerSize = CGSize(width: width, height: .greatestFiniteMagnitude)
      view.measurementLayout.ensureLayout(for: view.measurementContainer)
      let fresh = NSTextStorage(attributedString: text)
      let layout = NSLayoutManager()
      let container = NSTextContainer(size: CGSize(width: width, height: .greatestFiniteMagnitude))
      container.lineFragmentPadding = 0
      fresh.addLayoutManager(layout); layout.addTextContainer(container)
      layout.ensureLayout(for: container)
      XCTAssertEqual(view.measurementLayout.usedRect(for: view.measurementContainer).height, layout.usedRect(for: container).height, accuracy: 0.5)
    }
  }
  @MainActor func testFileDraftSurvivesSwitchingAndClosingOtherTabs() {
    let state = WorkspaceState()
    let files = WorkspaceTab(.files, workspace: "/tmp")
    state.add(files)
    files.files.original = "on disk"
    files.files.content = "unsaved work"
    let browser = WorkspaceTab(.browser, workspace: "/tmp")
    state.add(browser)
    state.close(browser)
    XCTAssertEqual(state.selected, files.id)
    XCTAssertTrue(files.hasUnsavedChanges)
    XCTAssertEqual(files.files.content, "unsaved work")
  }
  func testLongSingleLineOutputHasBoundedPreview() {
    let output = String(repeating: "long web page content ", count: 100_000)
    let start = Date()
    for _ in 0..<100 { XCTAssertLessThan(ActivityPreview.make(output).count, 730) }
    print("ACTIVITY_PREVIEW_100_MS=\(Date().timeIntervalSince(start) * 1000)")
  }
  @MainActor func testTranscriptUnchangedUpdatesAvoidLayoutWork() {
    let view = TranscriptScrollView(frame: NSRect(x: 0, y: 0, width: 400, height: 300))
    let output = String(repeating: "command output\n", count: 1000)
    view.update(output)
    let start = Date()
    for _ in 0..<1000 { view.update(output) }
    print("UNCHANGED_TRANSCRIPT_1000_MS=\(Date().timeIntervalSince(start) * 1000)")
    XCTAssertEqual((view.documentView as? NSTextView)?.string, output)
  }
}
