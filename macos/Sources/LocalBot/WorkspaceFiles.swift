import AppKit
import SwiftUI

struct WorkspaceEntry: Identifiable {
  let url: URL
  let directory: Bool
  var id: String { url.path }
}
enum WorkspaceDisk {
  static func checked(_ url: URL, root: String) throws -> URL {
    let base = URL(fileURLWithPath: root).resolvingSymlinksInPath().standardizedFileURL
    let resolved = url.resolvingSymlinksInPath().standardizedFileURL
    guard resolved.path == base.path || resolved.path.hasPrefix(base.path + "/") else { throw failure("This link points outside the project.") }
    return resolved
  }
  static func failure(_ message: String) -> NSError { NSError(domain: "LocalBot.Workspace", code: 1, userInfo: [NSLocalizedDescriptionKey: message]) }
  static func list(_ url: URL, root: String) throws -> [WorkspaceEntry] {
    let checked = try checked(url, root: root)
    return try FileManager.default.contentsOfDirectory(at: checked, includingPropertiesForKeys: [.isDirectoryKey], options: [.skipsHiddenFiles])
      .prefix(3000).map { WorkspaceEntry(url: $0, directory: (try? $0.resourceValues(forKeys: [.isDirectoryKey]).isDirectory) == true) }
      .sorted { $0.directory != $1.directory ? $0.directory : $0.url.lastPathComponent.localizedStandardCompare($1.url.lastPathComponent) == .orderedAscending }
  }
  static func read(_ url: URL, root: String) throws -> String {
    let file = try checked(url, root: root)
    let size = try file.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
    guard size <= 2_000_000 else { throw failure("Preview is limited to 2 MB. Use the terminal for this file.") }
    let data = try Data(contentsOf: file)
    guard !data.contains(0), let string = String(data: data, encoding: .utf8) else { throw failure("This is not a UTF-8 text file. Use Open to preview it.") }
    return string
  }
  static func save(_ url: URL, root: String, original: String, content: String) throws {
    let file = try checked(url, root: root)
    guard try read(file, root: root) == original else { throw failure("The file changed on disk. Reload it before saving to avoid overwriting other changes.") }
    try content.write(to: file, atomically: true, encoding: .utf8)
  }
}
@MainActor final class WorkspaceFileState: ObservableObject {
  @Published var folder: URL?
  @Published var entries: [WorkspaceEntry] = []
  @Published var selected: URL?
  @Published var content = ""
  @Published var original = ""
  @Published var error: String?
  @Published var busy = false
  @Published var showDiscard = false
  @Published var pending: WorkspaceEntry?
}
struct WorkspaceFiles: View {
  @EnvironmentObject var model: AppModel
  let root: String
  var dirtyChanged: (Bool) -> Void = { _ in }
  @ObservedObject var state: WorkspaceFileState
  var dirty: Bool { state.content != state.original }
  var body: some View {
    VStack(spacing: 0) {
      HStack {
        Button { navigateUp() } label: { Image(systemName: "chevron.left") }.disabled(state.folder?.path == root && state.selected == nil || dirty)
        Text(state.selected?.lastPathComponent ?? state.folder?.lastPathComponent ?? URL(fileURLWithPath: root).lastPathComponent).font(.caption).lineLimit(1)
        Spacer()
        if let selected = state.selected {
          Button("Open") { model.openInBrowser(selected) }
          Button("Save") { save() }.disabled(!dirty || state.busy)
        }
        Button { if let selected = state.selected { load(WorkspaceEntry(url: selected, directory: false)) } else { list(state.folder ?? URL(fileURLWithPath: root)) } } label: { Image(systemName: "arrow.clockwise") }.disabled(dirty || state.busy).help("Reload")
      }.buttonStyle(PanelButtonStyle()).padding(12)
      if let error = state.error { Text(error).foregroundStyle(.orange).font(.caption).textSelection(.enabled).padding(8) }
      if state.busy { ProgressView().controlSize(.small) }
      if state.selected != nil {
        TextEditor(text: $state.content).font(.system(size: 12, design: .monospaced)).padding(6)
        Text(dirty ? "Unsaved changes" : "Saved on disk").font(.caption2).foregroundStyle(.secondary).padding(6)
      } else {
        ScrollView {
          LazyVStack(alignment: .leading, spacing: 2) {
            ForEach(state.entries) { entry in
              Button { choose(entry) } label: {
                Label(entry.url.lastPathComponent, systemImage: entry.directory ? "folder" : "doc.text")
                  .frame(maxWidth: .infinity, alignment: .leading).padding(9).contentShape(Rectangle())
              }.buttonStyle(PanelButtonStyle()).accessibilityLabel("Open " + entry.url.lastPathComponent)
            }
          }.padding(6)
        }
      }
    }.onChange(of: dirty) { _, value in dirtyChanged(value) }
      .task { if state.folder == nil { list(URL(fileURLWithPath: root)) } }
      .confirmationDialog("Discard unsaved changes?", isPresented: $state.showDiscard) {
        Button("Discard", role: .destructive) { state.content = state.original; if let pending = state.pending { load(pending) } }
        Button("Cancel", role: .cancel) { state.pending = nil }
      }
  }
  func choose(_ entry: WorkspaceEntry) {
    if dirty { state.pending = entry; state.showDiscard = true } else { load(entry) }
  }
  func navigateUp() {
    if state.selected != nil { state.selected = nil; state.error = nil; return }
    let parent = (state.folder ?? URL(fileURLWithPath: root)).deletingLastPathComponent()
    list(parent)
  }
  func list(_ url: URL) {
    state.busy = true
    Task {
      do { state.entries = try await Task.detached { try WorkspaceDisk.list(url, root: root) }.value; state.folder = url; state.selected = nil; state.error = nil }
      catch { state.error = error.localizedDescription }
      state.busy = false
    }
  }
  func load(_ entry: WorkspaceEntry) {
    if entry.directory { list(entry.url); return }
    state.busy = true
    Task {
      do {
        let result = try await Task.detached { try WorkspaceDisk.read(entry.url, root: root) }.value
        state.selected = entry.url; state.original = result; state.content = result; state.error = nil
      } catch { state.error = error.localizedDescription; state.selected = nil }
      state.busy = false
    }
  }
  func save() {
    guard let selected = state.selected else { return }; state.busy = true
    let saved = state.content, previous = state.original
    Task {
      do { try await Task.detached { try WorkspaceDisk.save(selected, root: root, original: previous, content: saved) }.value; state.original = saved; state.error = nil }
      catch { state.error = error.localizedDescription }
      state.busy = false
    }
  }
}

enum WorkspaceGit {
  static func run(root: String, arguments: [String]) throws -> String {
    let process = Process(), pipe = Pipe()
    process.executableURL = URL(fileURLWithPath: "/usr/bin/git")
    process.arguments = ["--no-pager", "-C", root] + arguments
    process.standardOutput = pipe; process.standardError = pipe
    process.environment = ProcessInfo.processInfo.environment.merging(["GIT_TERMINAL_PROMPT": "0", "GIT_OPTIONAL_LOCKS": "0"]) { _, new in new }
    try process.run()
    let timeout = DispatchWorkItem { if process.isRunning { process.terminate() } }
    DispatchQueue.global().asyncAfter(deadline: .now() + 15, execute: timeout)
    var output = Data()
    while true {
      let chunk = pipe.fileHandleForReading.availableData
      if chunk.isEmpty { break }
      if output.count < 1_000_000 { output.append(chunk.prefix(1_000_000 - output.count)) }
    }
    process.waitUntilExit(); timeout.cancel()
    let string = String(decoding: output, as: UTF8.self)
    guard process.terminationStatus == 0 else { throw WorkspaceDisk.failure(string.isEmpty ? "Git failed or timed out." : string) }
    return string
  }
}
struct WorkspaceReview: View {
  let root: String
  @State private var mode = "Working tree"
  @State private var output = ""
  @State private var busy = false
  var body: some View {
    VStack(spacing: 0) {
      HStack {
        Picker("Changes", selection: $mode) { Text("Working tree").tag("Working tree"); Text("Staged").tag("Staged") }.labelsHidden()
        Button { refresh() } label: { Image(systemName: "arrow.clockwise") }.disabled(busy).help("Refresh diff")
      }.padding(10)
      if busy { ProgressView().controlSize(.small) }
      TranscriptView(text: output.isEmpty ? "No changes." : output)
    }.task { refresh() }.onChange(of: mode) { _, _ in refresh() }
  }
  func refresh() {
    guard !busy else { return }; busy = true
    let staged = mode == "Staged"
    Task {
      do {
        output = try await Task.detached {
          let status = try WorkspaceGit.run(root: root, arguments: ["status", "--short"])
          let diff = try WorkspaceGit.run(root: root, arguments: ["diff", "--no-ext-diff", "--no-textconv"] + (staged ? ["--cached"] : []))
          return "$ git status --short\n" + status + "\n$ git diff" + (staged ? " --cached" : "") + "\n" + (diff.isEmpty ? "No tracked changes in this view. Untracked files are listed above; open them in Files." : diff)
        }.value
      } catch { output = error.localizedDescription }
      busy = false
    }
  }
}
