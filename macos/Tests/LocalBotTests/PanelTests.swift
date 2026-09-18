import XCTest
import AppKit
@testable import LocalBot

final class PanelTests: XCTestCase {
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
