import SwiftUI

struct RightPanelControls: View {
  @EnvironmentObject var model: AppModel
  var body: some View {
    HStack(spacing: 14) {
      Button { model.showActivity.toggle() } label: { Image(systemName: "sidebar.right") }
        .help("Activity").accessibilityLabel("Toggle activity")
      Button { model.rightPanel = model.rightPanel == .workspace ? nil : .workspace } label: { Image(systemName: "rectangle.split.2x1") }
        .help("Workspace").accessibilityLabel("Toggle workspace")
      Menu {
        ForEach(model.selected?.members.compactMap { model.agent($0) } ?? []) { agent in
          Button(agent.name) { model.editingAgent = agent }
        }
      } label: { Image(systemName: "info.circle") }.menuStyle(.borderlessButton).fixedSize().help("Contact details")
    }.font(.system(size: 16)).buttonStyle(PanelButtonStyle())
  }
}
enum ActivityLabel {
  static func icon(_ name: String) -> String {
    if name == "thinking" { return "sparkles" }
    if name.contains("web") || name.contains("browser") { return "globe" }
    if name.contains("write") || name.contains("edit") || name.contains("patch") { return "pencil.line" }
    if name.contains("read") || name.contains("file") { return "doc.text" }
    if name.contains("search") { return "magnifyingglass" }
    if name.contains("test") { return "checkmark.seal" }
    if name.contains("ask") { return "questionmark.bubble" }
    return "terminal"
  }
  static func title(_ name: String) -> String {
    switch name {
    case "thinking": return "Thinking"
    case "web_search": return "Searching the web"
    case "web_fetch": return "Reading a web page"
    case "read_file": return "Reading a file"
    case "write_file": return "Writing a file"
    case "list_files": return "Exploring files"
    case "run_tests": return "Running tests"
    case "terminal", "process_exec": return "Running a command"
    case "ask_user": return "Waiting for your reply"
    default: return name.replacingOccurrences(of: "_", with: " ").capitalized
    }
  }
}

struct FullscreenNavigationControls: View {
  @EnvironmentObject var model: AppModel
  var body: some View {
    HStack(spacing: 16) {
      Button { Task { await model.newConversation() } } label: { Image(systemName: "square.and.pencil") }.help("New conversation")
      Button { model.showProject = true } label: { Image(systemName: "folder.badge.plus") }.help("New project")
      Button { NotificationCenter.default.post(name: .init("OpenFineTune"), object: nil) } label: { Image(systemName: "brain") }.help("Fine Tune").accessibilityLabel("Fine Tune")
      Button { withAnimation(.easeInOut(duration: 0.16)) { model.sidebarVisibility = model.sidebarVisibility == .detailOnly ? .all : .detailOnly } } label: { Image(systemName: "sidebar.left") }.help("Toggle sidebar")
    }.font(.system(size: 16)).buttonStyle(.plain)
  }
}
