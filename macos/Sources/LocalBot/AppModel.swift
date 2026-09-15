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
  @Published var conversations: [Conversation] = []
  @Published var tasks: [AgentTask] = []
  @Published var approvals: [Approval] = []
  @Published var messages: [ChatMessage] = []
  @Published var activity: [Activity] = []
  @Published var selectedId: String? {
    didSet {
      if selectedId != oldValue {
        messages = []
        activity = []
        Task { await refreshConversation() }
      }
    }
  }
  @Published var connected = false
  @Published var error: String?
  @Published var search = ""
  @Published var searchResults: [ChatMessage] = []
  @Published var showNew = false
  @Published var showSettings = false
  @Published var showActivity = false
  @Published var editingAgent: Agent?
  @Published var sending = false
  var connection: Connection?
  var lastRevision = -1
  var polling: Task<Void, Never>?
  var runtime: Process?
  let dataDir = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(
    "Library/Application Support/LocalBot")
  var selected: Conversation? { conversations.first { $0.id == selectedId } }
  var currentTasks: [AgentTask] { tasks.filter { $0.conversationId == selectedId } }
  var activeTask: AgentTask? { currentTasks.first { $0.active } }
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
        lastRevision = -1
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
          lastRevision = -1
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
      connected = true
      guard s.revision != lastRevision else { return }
      let previous = Dictionary(uniqueKeysWithValues: tasks.map { ($0.id, $0.status) })
      for t in s.tasks
      where previous[t.id] != nil && previous[t.id] != t.status
        && ["completed", "completed_with_errors", "failed", "awaiting_approval", "awaiting_input"]
          .contains(t.status)
      { notify(t) }
      let first = lastRevision < 0
      agents = s.agents
      providers = s.providers
      conversations = s.conversations
      tasks = s.tasks
      approvals = s.approvals
      lastRevision = s.revision
      if first {
        for p in providers {
          if let secret = Keychain.read(p.id + "@" + p.endpoint) {
            _ = try? await request("/credentials", body: ["providerId": p.id, "secret": secret])
          }
        }
      }
      if selectedId == nil {
        selectedId =
          conversations.first(where: { $0.members == ["coder"] })?.id ?? conversations.first?.id
      }
      await refreshConversation()
    } catch { connected = false }
  }
  func refreshConversation() async {
    guard let id = selectedId else { return }
    do {
      let m = try JSONDecoder().decode(
        [ChatMessage].self, from: await request("/messages?conversationId=\(id)"))
      let a = try JSONDecoder().decode(
        [Activity].self, from: await request("/activity?conversationId=\(id)"))
      guard selectedId == id else { return }
      messages = m
      activity = a
    } catch { self.error = error.localizedDescription }
  }
  func send(_ content: String, attachments: [Artifact]) async -> Bool {
    guard let id = selectedId, !sending else { return false }
    sending = true
    defer { sending = false }
    do {
      _ = try await request(
        "/messages",
        body: ["conversationId": id, "content": content, "attachments": attachments.map(\.id)])
      await refresh()
      return true
    } catch {
      self.error = error.localizedDescription
      return false
    }
  }
  func post(_ path: String, _ body: [String: Any]) async {
    do {
      _ = try await request(path, body: body)
      await refresh()
    } catch { self.error = error.localizedDescription }
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
  func attach() async -> [Artifact] {
    let panel = NSOpenPanel()
    panel.allowsMultipleSelection = true
    panel.canChooseDirectories = false
    guard panel.runModal() == .OK else { return [] }
    var results: [Artifact] = []
    do {
      for url in panel.urls {
        let size = (try url.resourceValues(forKeys: [.fileSizeKey])).fileSize ?? 0
        guard size <= 10_000_000 else {
          throw NSError(
            domain: "LocalBot", code: 3,
            userInfo: [NSLocalizedDescriptionKey: "Attachments must be smaller than 10 MB."])
        }
        let data = try Data(contentsOf: url)
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
