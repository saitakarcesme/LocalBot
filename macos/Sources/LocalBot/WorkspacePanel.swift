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
  var hasUnsavedChanges = false
  init(_ kind: WorkspaceKind, workspace: String) { self.kind = kind; self.workspace = workspace }
  func close() {
    browser?.web.stopLoading()
    terminal?.terminate()
    chat?.polling?.cancel(); chat?.polling = nil
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
      child.start()
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
  var body: some View {
    VStack(spacing: 0) {
      HStack(spacing: 10) {
        Text("Workspace").font(.caption.weight(.semibold))
        Spacer()
        Menu { ForEach(WorkspaceKind.allCases, id: \.self) { kind in
          Button { model.openWorkspace(kind) } label: { Label(kind.rawValue, systemImage: kind.icon) }
        } } label: { Image(systemName: "plus") }.menuStyle(.borderlessButton).fixedSize().help("Add workspace tab")
        Button { model.rightPanel = nil } label: { Image(systemName: "xmark") }.buttonStyle(.plain).help("Close workspace")
      }.padding(12)
      if !state.tabs.isEmpty {
        ScrollView(.horizontal) {
          HStack(spacing: 4) {
            ForEach(state.tabs) { tab in
              HStack(spacing: 6) {
                Button { state.selected = tab.id } label: { Label(tab.kind.rawValue, systemImage: tab.kind.icon) }.buttonStyle(.plain)
                Button { if tab.hasUnsavedChanges { pendingClose = tab; confirmDiscard = true } else { state.close(tab) } } label: { Image(systemName: "xmark").font(.system(size: 8)) }.buttonStyle(.plain).help("Close tab")
              }.font(.caption).padding(8).background(state.selected == tab.id ? Color.primary.opacity(0.1) : .clear, in: RoundedRectangle(cornerRadius: 8))
            }
          }.padding(.horizontal, 8)
        }.fixedSize(horizontal: false, vertical: true)
      }
      Divider()
      if state.tabs.isEmpty {
        VStack(spacing: 8) {
          ForEach(WorkspaceKind.allCases, id: \.self) { kind in
            Button { model.openWorkspace(kind) } label: {
              Label(kind.rawValue, systemImage: kind.icon).frame(maxWidth: .infinity, alignment: .leading).padding(12)
            }.buttonStyle(.plain).background(.quaternary.opacity(0.4), in: RoundedRectangle(cornerRadius: 10))
          }
          Text("Drag a conversation here to open it alongside your chat.").font(.caption).foregroundStyle(.secondary)
        }.padding(20).frame(maxHeight: .infinity)
      } else {
        ZStack {
          ForEach(state.tabs) { tab in
            WorkspaceTabView(tab: tab)
              .opacity(state.selected == tab.id ? 1 : 0)
              .allowsHitTesting(state.selected == tab.id).disabled(state.selected != tab.id)
              .accessibilityHidden(state.selected != tab.id)
          }
        }.frame(maxWidth: .infinity, maxHeight: .infinity)
      }
    }.background(.regularMaterial)
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
    case .files: WorkspaceFiles(root: tab.workspace, dirtyChanged: { tab.hasUnsavedChanges = $0 })
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
    }
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
          .buttonStyle(.plain).font(.caption)
      }.padding(8)
      TerminalSurface(tab: tab, openLink: { model.openInBrowser($0) }).frame(maxWidth: .infinity, maxHeight: .infinity)
    }
  }
}
struct TerminalSurface: NSViewRepresentable {
  let tab: WorkspaceTab
  var openLink: (URL) -> Void
  func makeNSView(context: Context) -> LocalProcessTerminalView {
    if let existing = tab.terminal { return existing }
    let view = WorkspaceTerminalView(frame: NSRect(x: 0, y: 0, width: 500, height: 500))
    view.openLinkInside = openLink
    view.font = .monospacedSystemFont(ofSize: 12, weight: .regular)
    view.nativeForegroundColor = .textColor; view.nativeBackgroundColor = .textBackgroundColor
    view.startProcess(executable: "/bin/zsh", args: ["-l"], currentDirectory: tab.workspace)
    tab.terminal = view
    return view
  }
  func updateNSView(_ view: LocalProcessTerminalView, context: Context) {}
}

final class WorkspaceTerminalView: LocalProcessTerminalView {
  var openLinkInside: ((URL) -> Void)?
  override func requestOpenLink(source: TerminalView, link: String, params: [String: String]) {
    if let url = URL(string: link) { openLinkInside?(url) }
  }
}
