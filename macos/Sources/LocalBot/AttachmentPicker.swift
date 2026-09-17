import SwiftUI
import AppKit

/// File enumeration never runs on the main actor or invokes the system Open/Save service.
struct AttachmentPicker: View {
  var add: ([URL]) async -> Void
  @Environment(\.dismiss) private var dismiss
  @State private var location = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Downloads").path
  @State private var entries: [Entry] = []
  @State private var selection = Set<String>()
  @State private var loading = false
  @State private var importing = false
  @State private var error: String?
  @State private var listingID = UUID()
  struct Entry: Identifiable, Sendable {
    var path: String
    var directory: Bool
    var id: String { path }
    var name: String { URL(fileURLWithPath: path).lastPathComponent }
  }
  var body: some View {
    VStack(alignment: .leading, spacing: 14) {
      HStack {
        Text("Add files").font(.title2.bold())
        Spacer()
        Button("Cancel") { dismiss() }.keyboardShortcut(.cancelAction).disabled(importing)
      }
      HStack {
        Button { location = FileManager.default.homeDirectoryForCurrentUser.path; reload() } label: { Image(systemName: "house") }
        Button { location = URL(fileURLWithPath: location).deletingLastPathComponent().path; reload() } label: { Image(systemName: "arrow.up") }
        TextField("Folder or file path", text: $location).textFieldStyle(.roundedBorder).onSubmit { reload() }
        Button("Go") { reload() }.disabled(loading)
      }
      List(entries, selection: $selection) { entry in
        HStack {
          Label(entry.name, systemImage: entry.directory ? "folder" : "doc")
          Spacer()
          if entry.directory {
            Button("Open") { location = entry.path; reload() }.buttonStyle(.borderless)
          }
        }.tag(entry.path)
      }.frame(height: 280)
      if loading { ProgressView("Reading folder…").controlSize(.small) }
      if let error { Text(error).font(.caption).foregroundStyle(.orange) }
      HStack {
        Text("Choose up to 8 files, 10 MB each. Use Go to open a folder or select a file by path.").font(.caption).foregroundStyle(.secondary)
        Spacer()
        if importing { ProgressView().controlSize(.small) }
        Button("Attach") {
          importing = true
          let urls = entries.filter { selection.contains($0.path) && !$0.directory }.map { URL(fileURLWithPath: $0.path) }
          Task { await add(urls); dismiss() }
        }.buttonStyle(.borderedProminent).disabled(importing || selectedFiles == 0 || selectedFiles > 8)
      }
    }.padding(22).frame(width: 570).task { reload() }
  }
  private var selectedFiles: Int { entries.filter { selection.contains($0.path) && !$0.directory }.count }
  private func reload() {
    let path = NSString(string: location).expandingTildeInPath
    let id = UUID(); listingID = id
    loading = true; error = nil; selection = []
    Task {
      do {
        let result = try await Task.detached(priority: .userInitiated) {
          let url = URL(fileURLWithPath: path)
          let isDirectory = try url.resourceValues(forKeys: [.isDirectoryKey]).isDirectory == true
          let urls = isDirectory ? try FileManager.default.contentsOfDirectory(at: url, includingPropertiesForKeys: [.isDirectoryKey], options: [.skipsHiddenFiles]) : [url]
          return try urls.prefix(1000).map { item in
            Entry(path: item.path, directory: try item.resourceValues(forKeys: [.isDirectoryKey]).isDirectory == true)
          }.sorted { a, b in a.directory != b.directory ? a.directory : a.name.localizedStandardCompare(b.name) == .orderedAscending }
        }.value
        guard listingID == id else { return }
        entries = result
        if result.count == 1 && !result[0].directory { selection = [result[0].path] }
        if result.count == 1000 { error = "Showing the first 1,000 entries. Enter a more specific path to find other files." }
      } catch {
        guard listingID == id else { return }
        self.error = error.localizedDescription; entries = []
      }
      loading = false
    }
  }
}
