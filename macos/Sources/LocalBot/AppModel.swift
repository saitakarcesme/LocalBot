import AppKit
import Foundation
import LocalAuthentication
import Security
import SwiftUI
import UserNotifications

enum Keychain {
  static func save(_ secret: String, id: String) throws {
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: "LocalBot.providers", kSecAttrAccount as String: id,
    ]
    if secret.isEmpty {
      SecItemDelete(query as CFDictionary)
      return
    }
    let data = Data(secret.utf8)
    let update = SecItemUpdate(
      query as CFDictionary, [kSecValueData as String: data] as CFDictionary)
    let status =
      update == errSecItemNotFound
      ? SecItemAdd(
        query.merging([kSecValueData as String: data]) { _, new in new } as CFDictionary, nil)
      : update
    if status != errSecSuccess { throw NSError(domain: NSOSStatusErrorDomain, code: Int(status)) }
  }
  static func read(_ id: String) -> String? {
    let context = LAContext()
    context.interactionNotAllowed = true
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: "LocalBot.providers", kSecAttrAccount as String: id,
      kSecReturnData as String: true, kSecMatchLimit as String: kSecMatchLimitOne,
      kSecUseAuthenticationContext as String: context,
    ]
    var result: CFTypeRef?
    guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
      let data = result as? Data
    else { return nil }
    return String(data: data, encoding: .utf8)
  }
}
@MainActor final class AppModel: ObservableObject {
  @Published var agents: [Agent] = []
  @Published var providers: [Provider] = []
  @Published var projects: [Project] = []
  @Published var activeRuns: [ActiveRun] = []
  @Published var goals: [AgentGoal] = []
  @Published var showProject = false
  @Published var showIntegrations = false
  @Published var integrations: [MCPConnection] = []
  @Published var conversations: [Conversation] = []
  @Published var showingArchived = false
  @Published var tasks: [AgentTask] = []
  @Published var approvals: [Approval] = []
  @Published var messages: [ChatMessage] = []
  @Published var searchFocusId: String?
  @Published var hasEarlierMessages = false
  @Published var loadingEarlierMessages = false
  @Published var activity: [Activity] = []
  @Published var selectedId: String? {
    didSet {
      if selectedId != oldValue {
        if let conversation = conversations.first(where: { $0.id == selectedId }) {
          showingArchived = conversation.archived == true
        }
        UserDefaults.standard.set(selectedId, forKey: "selectedConversation")
        messages = []
        searchFocusId = nil
        hasEarlierMessages = false
        loadingEarlierMessages = false
        activity = []
        Task { await refreshConversation() }
      }
    }
  }
  @Published var connected = false
  @Published var hasLoaded = false
  @Published var error: String?
  @Published var search = ""
  @Published var searchResults: [ChatMessage] = []
  @Published var showNew = false
  var newConversationProjectId = ""
  @Published var showSettings = false
  @Published var showActivity = false
  @Published var editingAgent: Agent?
  @Published var editingProject: Project?
  @Published var editingConversation: Conversation?
  @Published var sending = false
  @Published var sendingConversationId: String?
  let pendingMessages = PendingMessageRequests()
  var connection: Connection?
  var snapshotCursor = RuntimeSnapshotCursor()
  var polling: Task<Void, Never>?
  var runtime: Process?
  let dataDir = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(
    "Library/Application Support/LocalBot")
  var selected: Conversation? { conversations.first { $0.id == selectedId } }
  var visibleConversations: [Conversation] { conversations.filter { ($0.archived == true) == showingArchived } }
  var currentTasks: [AgentTask] { tasks.filter { $0.conversationId == selectedId } }
  var stoppableTask: AgentTask? { activeTask ?? currentTasks.first { $0.status == "awaiting_input" } }
  var activeTask: AgentTask? { ConversationProgress.activeTask(in: currentTasks) }
  func agent(_ id: String?) -> Agent? { agents.first { $0.id == id } }
  func start() {
    guard polling == nil else { return }
    polling = Task {
      await connect()
      while !Task.isCancelled {
        await refresh()
        try? await Task.sleep(for: .seconds(connected ? 1 : 3))
        if !connected { await connect() }
      }
    }
  }
  func connect() async {
    do {
      try FileManager.default.createDirectory(at: dataDir, withIntermediateDirectories: true)
      if let data = try? Data(contentsOf: dataDir.appendingPathComponent("connection.json")) {
        connection = try? JSONDecoder().decode(Connection.self, from: data)
      }
      if (try? await request("/health")) != nil {
        connected = true
        error = nil
        snapshotCursor.reset()
        return
      }
      if runtime?.isRunning != true {
        let p = Process()
        let resources = Bundle.main.resourceURL!
        let bundled = resources.appendingPathComponent("node")
        p.executableURL =
          FileManager.default.fileExists(atPath: bundled.path)
          ? bundled : URL(fileURLWithPath: "/opt/homebrew/bin/node")
        let server = resources.appendingPathComponent("runtime/server.js")
        p.arguments = [server.path]
        p.environment = ProcessInfo.processInfo.environment.merging([
          "LOCALBOT_DATA_DIR": dataDir.path
        ]) { _, new in new }
        let log = dataDir.appendingPathComponent("runtime.log")
        if !FileManager.default.fileExists(atPath: log.path) {
          FileManager.default.createFile(
            atPath: log.path, contents: nil, attributes: [.posixPermissions: 0o600])
        }
        let handle = try FileHandle(forWritingTo: log)
        try handle.seekToEnd()
        p.standardOutput = handle
        p.standardError = handle
        try p.run()
        runtime = p
      }
      for _ in 0..<20 {
        try await Task.sleep(for: .milliseconds(150))
        if let data = try? Data(contentsOf: dataDir.appendingPathComponent("connection.json")) {
          connection = try? JSONDecoder().decode(Connection.self, from: data)
        }
        if (try? await request("/health")) != nil {
          connected = true
          error = nil
          snapshotCursor.reset()
          return
        }
      }
      throw NSError(
        domain: "LocalBot", code: 1,
        userInfo: [
          NSLocalizedDescriptionKey:
            "Runtime did not start. Check ~/Library/Application Support/LocalBot/runtime.log."
        ])
    } catch {
      self.error = error.localizedDescription
      connected = false
    }
  }
  func request(_ path: String, body: [String: Any]? = nil) async throws -> Data {
    guard let c = connection, let url = URL(string: c.url + path) else {
      throw URLError(.cannotConnectToHost)
    }
    var req = URLRequest(url: url)
    req.timeoutInterval = 190
    req.setValue("Bearer " + c.token, forHTTPHeaderField: "Authorization")
    if let body {
      req.httpMethod = "POST"
      req.setValue("application/json", forHTTPHeaderField: "Content-Type")
      req.httpBody = try JSONSerialization.data(withJSONObject: body)
    }
    let (data, response) = try await URLSession.shared.data(for: req)
    guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
      let detail =
        (try? JSONSerialization.jsonObject(with: data) as? [String: String])?["error"]
        ?? "Runtime request failed"
      throw NSError(domain: "LocalBot", code: 2, userInfo: [NSLocalizedDescriptionKey: detail])
    }
    return data
  }
  func refresh() async {
    guard connection != nil else { return }
    do {
      let s = try JSONDecoder().decode(Snapshot.self, from: await request("/snapshot"))
      if !connected { connected = true }
      if !hasLoaded { hasLoaded = true }
      let update = snapshotCursor.receive(instanceId: s.instanceId, revision: s.revision)
      guard update != .unchanged else { return }
      let previous = Dictionary(uniqueKeysWithValues: tasks.map { ($0.id, $0.status) })
      for t in s.tasks
      where previous[t.id] != nil && previous[t.id] != t.status
        && ["completed", "completed_with_errors", "failed", "awaiting_approval", "awaiting_input"]
          .contains(t.status)
      { notify(t) }
      let first = update == .restarted
      agents = s.agents
      providers = s.providers
      projects = s.projects ?? []
      activeRuns = s.activeRuns ?? []
      goals = s.goals ?? []
      integrations = s.integrations ?? []
      conversations = s.conversations
      tasks = s.tasks
      approvals = s.approvals
      if first {
        for i in integrations {
          if let secret = Keychain.read("mcp:" + i.id + "@" + i.endpoint) {
            _ = try? await request("/integrations/credentials", body: ["id": i.id, "secret": secret])
          }
        }
        for p in providers {
          if let secret = Keychain.read(p.id + "@" + p.endpoint) {
            _ = try? await request("/credentials", body: ["providerId": p.id, "secret": secret])
          }
        }
      }
      if selectedId == nil || !conversations.contains(where: { $0.id == selectedId }) {
        let saved = UserDefaults.standard.string(forKey: "selectedConversation")
        if first, let restored = conversations.first(where: { $0.id == saved }) {
          showingArchived = restored.archived == true
          selectedId = restored.id
        } else { selectedId = visibleConversations.first?.id }
      }
      if let selected { showingArchived = selected.archived == true }
      await refreshConversation()
    } catch { if connected { connected = false } }
  }
  func refreshConversation() async {
    guard let id = selectedId else { return }
    let focus = searchFocusId
    let suffix = focus.map { "&through=\($0)" } ?? ""
    do {
      let m = try JSONDecoder().decode(
        [ChatMessage].self, from: await request("/messages?conversationId=\(id)\(suffix)"))
      let a = try JSONDecoder().decode(
        [Activity].self, from: await request("/activity?conversationId=\(id)"))
      guard selectedId == id && searchFocusId == focus else { return }
      if messages.isEmpty {
        messages = m
        hasEarlierMessages = m.count == 300
      } else {
        // Keep explicitly loaded older pages; refresh overlapping recent messages.
        let newestIDs = Set(m.map(\.id))
        messages = messages.filter { !newestIDs.contains($0.id) } + m
      }
      activity = a
    } catch { self.error = error.localizedDescription }
  }
  func openSearchResult(_ message: ChatMessage) async {
    showingArchived = conversations.first { $0.id == message.conversationId }?.archived == true
    selectedId = message.conversationId
    searchFocusId = message.id
    messages = []
    hasEarlierMessages = false
    search = ""
    await refreshConversation()
  }
  func showLatestMessages() async {
    searchFocusId = nil
    messages = []
    hasEarlierMessages = false
    await refreshConversation()
  }
  func loadEarlierMessages() async -> String? {
    guard let id = selectedId, let first = messages.first, hasEarlierMessages, !loadingEarlierMessages else { return nil }
    let focus = searchFocusId
    loadingEarlierMessages = true
    defer { if selectedId == id { loadingEarlierMessages = false } }
    do {
      let page = try JSONDecoder().decode([ChatMessage].self,
        from: await request("/messages?conversationId=\(id)&before=\(first.id)"))
      guard selectedId == id && searchFocusId == focus else { return nil }
      let known = Set(messages.map(\.id))
      messages.insert(contentsOf: page.filter { !known.contains($0.id) }, at: 0)
      hasEarlierMessages = page.count == 300
      return first.id
    } catch { if selectedId == id { self.error = error.localizedDescription }; return nil }
  }
  func send(_ content: String, attachments: [Artifact]) async -> Bool {
    guard let id = selectedId, !sending else { return false }
    sending = true
    sendingConversationId = id
    defer { sending = false; sendingConversationId = nil }
    let requestID = pendingMessages.requestID(conversation: id, content: content, attachments: attachments.map(\.id))
    do {
      _ = try await request(
        "/messages",
        body: ["conversationId": id, "content": content, "attachments": attachments.map(\.id), "requestId": requestID])
      pendingMessages.acknowledge(conversation: id, requestID: requestID)
      if searchFocusId != nil { await showLatestMessages() }
      await refresh()
      return true
    } catch {
      self.error = error.localizedDescription
      return false
    }
  }
  @discardableResult func post(_ path: String, _ body: [String: Any]) async -> Bool {
    do {
      _ = try await request(path, body: body)
      self.error = nil
      await refresh()
      return true
    } catch { self.error = error.localizedDescription; return false }
  }
  func saveAgent(_ agent: Agent, expected: Agent) async -> Bool {
    do {
      var body = try JSONSerialization.jsonObject(with: JSONEncoder().encode(agent)) as! [String: Any]
      if agents.contains(where: { $0.id == agent.id }) {
        body["expected"] = try JSONSerialization.jsonObject(with: JSONEncoder().encode(expected))
      }
      return await post("/agents", body)
    } catch { self.error = error.localizedDescription; return false }
  }
  func save<T: Encodable>(_ object: T, path: String) async -> Bool {
    do {
      let data = try JSONEncoder().encode(object)
      let dict = try JSONSerialization.jsonObject(with: data) as! [String: Any]
      _ = try await request(path, body: dict)
      await refresh()
      return true
    } catch {
      self.error = error.localizedDescription
      return false
    }
  }
  func toggleArchiveList() {
    showingArchived.toggle()
    search = ""
    selectedId = visibleConversations.first?.id
  }
  func archiveConversation(_ conversation: Conversation) async {
    let wasSelected = selectedId == conversation.id
    let previousMode = showingArchived
    if await post("/conversations/archive", ["id": conversation.id, "archived": conversation.archived != true]) {
      showingArchived = previousMode
      if wasSelected { selectedId = visibleConversations.first?.id }
    }
  }
  func runSearch() async {
    let query = search
    guard !query.isEmpty else {
      searchResults = []
      return
    }
    do {
      let encoded =
        query.addingPercentEncoding(
          withAllowedCharacters: .urlQueryAllowed.subtracting(CharacterSet(charactersIn: "&+?#")))
        ?? ""
      let results = try JSONDecoder().decode(
        [ChatMessage].self, from: await request("/search?q=\(encoded)"))
      if search == query { searchResults = results }
    } catch { self.error = error.localizedDescription }
  }
  @Published var attaching = false
  @Published var creatingConversation = false
  func newConversation(projectId: String? = nil) async {
    guard !creatingConversation else { return }
    creatingConversation = true
    defer { creatingConversation = false }
    do {
      let data = try await request("/conversations", body: ["title": "New conversation", "members": [String](), "automatic": true, "projectId": projectId as Any? ?? NSNull()])
      let conversation = try JSONDecoder().decode(Conversation.self, from: data)
      showingArchived = false
      search = ""
      await refresh()
      selectedId = conversation.id
    } catch { self.error = error.localizedDescription }
  }
  func attach(urls: [URL]) async -> [Artifact] {
    guard !attaching else { return [] }
    attaching = true
    defer { attaching = false }
    guard urls.count <= 8 else {
      error = "Choose up to 8 attachments at a time."
      return []
    }
    var results: [Artifact] = []
    do {
      for url in urls {
        let data = try await Task.detached(priority: .userInitiated) {
        let size = (try url.resourceValues(forKeys: [.fileSizeKey])).fileSize ?? 0
        guard size <= 10_000_000 else {
          throw NSError(
            domain: "LocalBot", code: 3,
            userInfo: [NSLocalizedDescriptionKey: "Attachments must be smaller than 10 MB."])
        }
        return try Data(contentsOf: url)
        }.value
        results.append(
          try JSONDecoder().decode(
            Artifact.self,
            from: await request(
              "/attachments",
              body: ["name": url.lastPathComponent, "data": data.base64EncodedString()])))
      }
    } catch { self.error = error.localizedDescription }
    return results
  }
  func openArtifact(_ a: Artifact) { NSWorkspace.shared.open(URL(fileURLWithPath: a.path)) }
  func notify(_ t: AgentTask) {
    guard UserDefaults.standard.bool(forKey: "notifications"), !NSApp.isActive else { return }
    let c = UNMutableNotificationContent()
    c.title = conversations.first { $0.id == t.conversationId }?.title ?? "LocalBot"
    c.body =
      t.status == "completed"
      ? "Task finished." : t.status == "failed" ? "Task needs attention." : "Your input is needed."
    c.sound = .default
    UNUserNotificationCenter.current().add(
      UNNotificationRequest(identifier: t.id + t.status, content: c, trigger: nil))
  }
}
