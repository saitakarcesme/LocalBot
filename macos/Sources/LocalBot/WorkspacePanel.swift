import AppKit
import SwiftUI
import WebKit
import SwiftTerm
import UniformTypeIdentifiers

enum RightPanel: String { case activity, workspace }
enum WorkspaceKind: String, CaseIterable {
  case review = "Review", terminal = "Terminal", browser = "Browser", files = "Files", chat = "Side chat"
  var icon: String {
    switch self { case .review: return "doc.text.magnifyingglass"; case .terminal: return "terminal"; case .browser: return "globe"; case .files: return "folder"; case .chat: return "bubble.left.and.bubble.right" }
  }
}
@MainActor final class WorkspaceTab: Identifiable {
  let id = UUID()
  let kind: WorkspaceKind
  let workspace: String
  var browser: BrowserSession?
  var terminal: LocalProcessTerminalView?
  var chat: AppModel?
  let files = WorkspaceFileState()
  var hasUnsavedChanges: Bool { files.content != files.original }
  init(_ kind: WorkspaceKind, workspace: String) { self.kind = kind; self.workspace = workspace }
  func close() {
    browser?.web.stopLoading()
    terminal?.terminate()
    chat?.polling?.cancel(); chat?.polling = nil
    chat?.selectedId = nil
  }
}
@MainActor final class WorkspaceState: ObservableObject {
  @Published var tabs: [WorkspaceTab] = []
  @Published var selected: UUID?
  private var shutdownObserver: NSObjectProtocol?
  init() {
    shutdownObserver = NotificationCenter.default.addObserver(forName: NSApplication.willTerminateNotification, object: nil, queue: .main) { [weak self] _ in
      MainActor.assumeIsolated { self?.tabs.forEach { $0.close() } }
    }
  }
  deinit { if let shutdownObserver { NotificationCenter.default.removeObserver(shutdownObserver) } }
  func add(_ tab: WorkspaceTab) { tabs.append(tab); selected = tab.id }
  func close(_ tab: WorkspaceTab) {
    tab.close(); tabs.removeAll { $0.id == tab.id }
    if selected == tab.id { selected = tabs.last?.id }
  }
}
extension AppModel {
  var workspacePath: String {
    if let project = projects.first(where: { $0.id == selected?.projectId }) { return project.workspace }
    return selected?.members.compactMap { agent($0)?.workspace }.first
      ?? FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Documents/LocalBot").path
  }
  func openWorkspace(_ kind: WorkspaceKind, url: URL? = nil, conversationId: String? = nil) {
    rightPanel = .workspace
    if kind == .chat {
      Task { await openSideChat(conversationId) }
      return
    }
    let tab = WorkspaceTab(kind, workspace: workspacePath)
    if kind == .browser {
      tab.browser = BrowserSession()
      if let url { tab.browser?.navigate(url) }
    }
    workspace.add(tab)
  }
  func openSideChat(_ id: String?) async {
    do {
      let conversationId: String
      if let id, conversations.contains(where: { $0.id == id }) { conversationId = id }
      else {
        let data = try await request("/conversations", body: ["title": "New conversation", "members": [String](), "automatic": true, "projectId": selected?.projectId as Any? ?? NSNull()])
        conversationId = try JSONDecoder().decode(Conversation.self, from: data).id
      }
      if let existing = workspace.tabs.first(where: { $0.chat?.selectedId == conversationId }) {
        workspace.selected = existing.id; rightPanel = .workspace; return
      }
      let child = AppModel(persistsSelection: false)
      child.browserHandler = { [weak self] url in self?.openInBrowser(url) }
      child.connection = connection
      child.selectedId = conversationId
      await child.refresh()
      let tab = WorkspaceTab(.chat, workspace: workspacePath)
      tab.chat = child; workspace.add(tab); rightPanel = .workspace
      await refresh()
    } catch { self.error = error.localizedDescription }
  }
  func openInBrowser(_ url: URL) {
    guard ["http", "https", "file"].contains(url.scheme?.lowercased() ?? "") else { return }
    if let browserHandler { browserHandler(url) } else { openWorkspace(.browser, url: url) }
  }
}
struct WorkspacePanel: View {
  @EnvironmentObject var model: AppModel
  @ObservedObject var state: WorkspaceState
  @State private var pendingClose: WorkspaceTab?
  @State private var confirmDiscard = false
  private func close(_ tab: WorkspaceTab) {
    if tab.hasUnsavedChanges { pendingClose = tab; confirmDiscard = true } else { state.close(tab) }
  }
  var body: some View {
    VStack(spacing: 0) {
      if let tab = state.tabs.first(where: { $0.id == state.selected }) {
        WorkspaceTabView(tab: tab).id(tab.id)
          .frame(maxWidth: .infinity, maxHeight: .infinity)
      } else {
        VStack(alignment: .leading, spacing: 20) {
          Text("Your workspace").font(.title3.weight(.semibold))
          Text("Open a tool alongside your conversation.").font(.callout).foregroundStyle(.secondary)
          ForEach(WorkspaceKind.allCases, id: \.self) { kind in
            Button { model.openWorkspace(kind) } label: {
              Label(kind.rawValue, systemImage: kind.icon).font(.system(size: 14))
                .frame(maxWidth: .infinity, alignment: .leading).contentShape(Rectangle())
            }.buttonStyle(PanelButtonStyle()).padding(.vertical, 5)
          }
        }.padding(28).frame(maxWidth: .infinity, maxHeight: .infinity)
      }
      HStack(spacing: 8) {
        ScrollView(.horizontal, showsIndicators: false) {
          HStack(spacing: 6) {
            ForEach(state.tabs) { tab in
              Button { state.selected = tab.id } label: {
                Image(systemName: tab.kind.icon).frame(width: 28, height: 28)
                  .background(state.selected == tab.id ? Color.primary.opacity(0.12) : .clear, in: RoundedRectangle(cornerRadius: 8))
              }.buttonStyle(PanelButtonStyle()).help(tab.kind.rawValue).accessibilityLabel(tab.kind.rawValue)
                .contextMenu { Button("Close tab") { close(tab) } }
            }
          }
        }.frame(height: 28)
        Menu { ForEach(WorkspaceKind.allCases, id: \.self) { kind in
          Button { model.openWorkspace(kind) } label: { Label(kind.rawValue, systemImage: kind.icon) }
        } } label: { Image(systemName: "plus").frame(width: 24, height: 28) }
          .menuStyle(.borderlessButton).fixedSize().help("Add workspace tab")
        if let tab = state.tabs.first(where: { $0.id == state.selected }) {
          Button { close(tab) } label: { Image(systemName: "xmark").frame(width: 24, height: 28) }.buttonStyle(PanelButtonStyle()).help("Close tab")
        }
        Button { model.rightPanel = nil } label: { Image(systemName: "sidebar.right").frame(width: 24, height: 28) }.buttonStyle(PanelButtonStyle()).help("Hide workspace")
      }.font(.system(size: 13)).padding(10)
    }
      .onChange(of: state.selected) { _, _ in NSApp.keyWindow?.makeFirstResponder(nil) }
      .confirmationDialog("Discard unsaved file changes and close this tab?", isPresented: $confirmDiscard) {
        Button("Discard changes", role: .destructive) { if let pendingClose { state.close(pendingClose) }; pendingClose = nil }
        Button("Cancel", role: .cancel) { pendingClose = nil }
      }
      .dropDestination(for: String.self) { values, _ in
        guard let value = values.first, value.hasPrefix("localbot-conversation:") else { return false }
        model.openWorkspace(.chat, conversationId: String(value.dropFirst(22)))
        return true
      }
  }
}
struct WorkspaceTabView: View {
  let tab: WorkspaceTab
  var body: some View {
    switch tab.kind {
    case .browser: if let browser = tab.browser { BrowserPane(session: browser) }
    case .terminal: TerminalPane(tab: tab)
    case .files: WorkspaceFiles(root: tab.workspace, state: tab.files)
    case .review: WorkspaceReview(root: tab.workspace)
    case .chat: if let model = tab.chat { SideChatPane(model: model) }
    }
  }
}
struct SideChatPane: View {
  @ObservedObject var model: AppModel
  var body: some View {
    VStack(spacing: 0) {
      Text(model.selected?.title ?? "Opening conversation…").font(.caption.weight(.semibold)).lineLimit(1).padding(10)
      if let error = model.error { Text(error).font(.caption).foregroundStyle(.orange).textSelection(.enabled) }
      if let conversation = model.selected {
        ConversationView(conversation: conversation, isSideChat: true).environmentObject(model).id(conversation.id)
      } else { ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity) }
    }.onAppear { model.start() }
      .onDisappear { model.polling?.cancel(); model.polling = nil }
  }
}
struct TerminalPane: View {
  @EnvironmentObject var model: AppModel
  let tab: WorkspaceTab
  var body: some View {
    VStack(spacing: 0) {
      HStack {
        Text(URL(fileURLWithPath: tab.workspace).lastPathComponent).font(.caption).lineLimit(1)
        Spacer()
        Button("Focus terminal") { if let view = tab.terminal { view.window?.makeFirstResponder(view) } }
          .buttonStyle(PanelButtonStyle()).font(.caption)
      }.padding(.horizontal, 16).padding(.vertical, 10)
      TerminalSurface(tab: tab, openLink: { model.openInBrowser($0) }).padding(.horizontal, 14).padding(.vertical, 10).frame(maxWidth: .infinity, maxHeight: .infinity)
    }
  }
}
struct TerminalSurface: NSViewRepresentable {
  let tab: WorkspaceTab
  var openLink: (URL) -> Void
  func makeNSView(context: Context) -> LocalProcessTerminalView {
    if let existing = tab.terminal { return existing }
    let view = WorkspaceTerminalView(frame: NSRect(x: 0, y: 0, width: 500, height: 500))
    view.routeLinks(openLink)
    view.font = .monospacedSystemFont(ofSize: 12, weight: .regular)
    view.nativeForegroundColor = .textColor; view.nativeBackgroundColor = .textBackgroundColor
    view.startProcess(executable: "/bin/zsh", args: ["-l"], currentDirectory: tab.workspace)
    tab.terminal = view
    return view
  }
  func updateNSView(_ view: LocalProcessTerminalView, context: Context) {}
}

final class WorkspaceTerminalView: LocalProcessTerminalView {
  private var linkDelegate: TerminalLinkDelegate?
  func routeLinks(_ open: @escaping (URL) -> Void) {
    let proxy = TerminalLinkDelegate(owner: self, open: open)
    linkDelegate = proxy; terminalDelegate = proxy
  }
}
final class TerminalLinkDelegate: TerminalViewDelegate {
  weak var owner: LocalProcessTerminalView?
  let open: (URL) -> Void
  init(owner: LocalProcessTerminalView, open: @escaping (URL) -> Void) { self.owner = owner; self.open = open }
  func sizeChanged(source: TerminalView, newCols: Int, newRows: Int) { owner?.sizeChanged(source: source, newCols: newCols, newRows: newRows) }
  func setTerminalTitle(source: TerminalView, title: String) { owner?.setTerminalTitle(source: source, title: title) }
  func hostCurrentDirectoryUpdate(source: TerminalView, directory: String?) { owner?.hostCurrentDirectoryUpdate(source: source, directory: directory) }
  func send(source: TerminalView, data: ArraySlice<UInt8>) { owner?.send(source: source, data: data) }
  func scrolled(source: TerminalView, position: Double) { owner?.scrolled(source: source, position: position) }
  func rangeChanged(source: TerminalView, startY: Int, endY: Int) { owner?.rangeChanged(source: source, startY: startY, endY: endY) }
  func clipboardCopy(source: TerminalView, content: Data) { owner?.clipboardCopy(source: source, content: content) }
  func requestOpenLink(source: TerminalView, link: String, params: [String: String]) { if let url = URL(string: link) { open(url) } }
}
