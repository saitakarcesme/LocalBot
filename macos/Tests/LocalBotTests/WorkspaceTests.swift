import XCTest
@testable import LocalBot

final class WorkspaceTests: XCTestCase {
  func testStaleSavePreservesOtherWriterAndAtomicSaveWorks() throws {
    let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: root) }
    let file = root.appendingPathComponent("sample.txt")
    try "first".write(to: file, atomically: true, encoding: .utf8)
    try WorkspaceDisk.save(file, root: root.path, original: "first", content: "second")
    XCTAssertEqual(try WorkspaceDisk.read(file, root: root.path), "second")
    XCTAssertThrowsError(try WorkspaceDisk.save(file, root: root.path, original: "first", content: "lost update"))
    XCTAssertEqual(try WorkspaceDisk.read(file, root: root.path), "second")
  }
  func testSymlinkCannotEscapeProject() throws {
    let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: root) }
    let link = root.appendingPathComponent("outside")
    try FileManager.default.createSymbolicLink(at: link, withDestinationURL: root.deletingLastPathComponent())
    XCTAssertThrowsError(try WorkspaceDisk.list(link, root: root.path))
    XCTAssertThrowsError(try WorkspaceDisk.checked(root.deletingLastPathComponent(), root: root.path))
  }
  func testGitReviewReadsStagedAndWorkingTreeSeparately() throws {
    let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: root) }
    _ = try WorkspaceGit.run(root: root.path, arguments: ["init"])
    let file = root.appendingPathComponent("example.txt")
    try "staged content\n".write(to: file, atomically: true, encoding: .utf8)
    _ = try WorkspaceGit.run(root: root.path, arguments: ["add", "example.txt"])
    try "working content\n".write(to: file, atomically: true, encoding: .utf8)
    let staged = try WorkspaceGit.run(root: root.path, arguments: ["diff", "--cached", "--no-ext-diff", "--no-textconv"])
    let working = try WorkspaceGit.run(root: root.path, arguments: ["diff", "--no-ext-diff", "--no-textconv"])
    XCTAssertTrue(staged.contains("+staged content"))
    XCTAssertTrue(working.contains("+working content"))
  }
}
