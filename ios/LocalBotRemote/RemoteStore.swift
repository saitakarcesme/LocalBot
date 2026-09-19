import SwiftUI
import Security

@MainActor final class RemoteStore: ObservableObject {
  @Published var snapshot: Snapshot?
  @Published var messages: [ChatMessage] = []
  @Published var activity: [Activity] = []
  @Published var selected: String?
  @Published var error: String?
  @Published var paired = false
  @Published var busy = false
  @Published var connected = false
  private var terminals: [String: PhoneTerminalSession] = [:]
  func terminalSession() -> PhoneTerminalSession {
    let key = selected ?? "unselected"
    if let session = terminals[key] { return session }
    let session = PhoneTerminalSession(); terminals[key] = session; return session
  }
  var phoneActionOutboxKey: String {
    guard let data = PhoneKeychain.read(), let link = try? JSONDecoder().decode(PairingLink.self, from: data) else { return "phone-action-results-unpaired" }
    return "phone-action-results-v1." + (link.host ?? link.id)
  }
  private var client: RemoteClient?
  private var refreshing = false
  private var loadedConversation: String?
  private var loadedRevision: Int?
  private var loadedInstance: String?
  init() {
    if let data = PhoneKeychain.read(), let link = try? JSONDecoder().decode(PairingLink.self, from: data) {
      client = RemoteClient(link: link); paired = true
    }
  }
  func pair(_ code: String) async {
    busy = true; error = nil
    defer { busy = false }
    do {
      let candidate = RemoteClient(link: try PairingLink.parse(code))
      let link = try await candidate.claim(name: UIDevice.current.name)
      try PhoneKeychain.save(JSONEncoder().encode(link))
      client = candidate; paired = true
      await refresh()
    } catch { self.error = error.localizedDescription }
  }
  func disconnect() { terminals.values.forEach { $0.close() }; terminals.removeAll(); PhoneKeychain.clear(); client = nil; paired = false; connected = false; snapshot = nil; messages = []; activity = []; selected = nil; loadedConversation = nil; loadedRevision = nil; loadedInstance = nil }
  func refresh() async {
    guard let client, !refreshing else { return }
    let generation = client
    refreshing = true
    defer { refreshing = false }
    do {
      let state = try JSONDecoder().decode(Snapshot.self, from: await client.api("/snapshot"))
      guard self.client === generation else { return }
      let changed = snapshot?.revision != state.revision || snapshot?.instanceId != state.instanceId
      if changed { snapshot = state }
      connected = true; error = nil
      if let id = selected, loadedConversation != id || loadedRevision != state.revision || loadedInstance != state.instanceId {
        let query = id.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? id
        let items = try JSONDecoder().decode([ChatMessage].self, from: await client.api("/messages?conversationId=" + query))
        let events = try JSONDecoder().decode([Activity].self, from: await client.api("/activity?conversationId=" + query))
        if self.client === generation, selected == id { if messages != items { messages = items }; if activity != events { activity = events }; loadedConversation = id; loadedRevision = state.revision; loadedInstance = state.instanceId }
      }
    } catch { if self.client === generation, !Task.isCancelled { connected = false; self.error = error.localizedDescription } }
  }
  func select(_ id: String) { selected = id; messages = []; activity = []; loadedConversation = nil }
  func send(_ text: String, project: String? = nil, agent: String? = nil, attachments: [Artifact] = [], model: ModelOption? = nil) async -> Bool {
    guard let client, (!text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || !attachments.isEmpty) else { return false }
    busy = true; defer { busy = false }
    do {
      if selected == nil {
        var body: [String:Any] = ["title":"New conversation","members":agent.map {[$0]} ?? snapshot?.agents.first.map {[$0.id]} ?? [],"automatic": project != nil]
        if let project { body["projectId"] = project }
        let conversation = try JSONDecoder().decode(Conversation.self, from: await client.api("/conversations", body: body))
        selected = conversation.id
      }
      guard let selected else { return false }
      if let model { var body = model.payload; body["conversationId"] = selected; _ = try await client.api("/models/select", body: body) }
      let requestKey = "pending-send." + selected
      let signature = Data((text + attachments.map(\.id).joined()).utf8).base64EncodedString()
      let saved = UserDefaults.standard.stringArray(forKey: requestKey)
      let requestID = saved?.count == 2 && saved?.first == signature ? saved![1] : UUID().uuidString
      UserDefaults.standard.set([signature, requestID], forKey: requestKey)
      _ = try await client.api("/messages", body: ["conversationId":selected,"content":text,"requestId":requestID,"attachments":attachments.map(\.id)])
      UserDefaults.standard.removeObject(forKey: requestKey)
      await refresh(); return true
    } catch { self.error = error.localizedDescription; return false }
  }
  func selectModel(_ option: ModelOption, conversationId: String? = nil) async throws {
    guard let client else { throw RemoteError("Connect LocalBot first.") }; var body = option.payload; if let conversationId { body["conversationId"] = conversationId }; _ = try await client.api("/models/select", body: body)
  }
  func read(_ path: String) async throws -> Data {
    guard let client else { throw RemoteError("Connect LocalBot first.") }; return try await client.api(path)
  }
  func personalWrite(_ path: String, body: [String:Any]) async throws -> Data {
    guard let client else { throw RemoteError("Connect LocalBot first.") }; return try await client.api(path, body: body)
  }
  func saveProfile(_ profile: UserProfile) async throws {
    guard let client else { throw RemoteError("Connect LocalBot first.") }
    _ = try await client.api("/profile", body: ["name":profile.name,"photo":profile.photo ?? ""]); await refresh()
  }
  func upload(_ data: Data, name: String) async throws -> Artifact {
    guard let client else { throw RemoteError("Connect LocalBot first.") }
    guard data.count <= 2_000_000 else { throw RemoteError("Choose a file smaller than 2 MB.") }
    return try JSONDecoder().decode(Artifact.self, from: await client.api("/attachments", body: ["name":name,"data":data.base64EncodedString()]))
  }
  func workspace(_ action: String, extras: [String:Any] = [:]) async throws -> Data {
    guard let client, let selected else { throw RemoteError("Open a conversation first.") }
    return try await client.api("/workspace/action", body: extras.merging(["action":action,"conversationId":selected]) {_,new in new})
  }
  func terminal(_ body: [String:Any]) async throws -> Data {
    guard let client else { throw RemoteError("Connect LocalBot first.") }; return try await client.api("/terminal", body: body)
  }
  func memory() async throws -> Data {
    guard let client else { throw RemoteError("Connect LocalBot first.") }
    return try await client.api("/memory")
  }
  func action(_ path: String, body: [String:Any]) async {
    do { guard let client else { return }; _ = try await client.api(path, body: body); await refresh() }
    catch { self.error = error.localizedDescription }
  }
}
enum PhoneKeychain {
  static var query: [String:Any] { [kSecClass as String:kSecClassGenericPassword,kSecAttrService as String:"app.localbot.remote",kSecAttrAccount as String:"host"] }
  static func read() -> Data? {
    var value: CFTypeRef?
    let status = SecItemCopyMatching(query.merging([kSecReturnData as String:true,kSecMatchLimit as String:kSecMatchLimitOne]) {_,new in new} as CFDictionary, &value)
    return status == errSecSuccess ? value as? Data : nil
  }
  static func save(_ data: Data) throws {
    let attributes: [String:Any] = [kSecValueData as String:data,kSecAttrAccessible as String:kSecAttrAccessibleWhenUnlockedThisDeviceOnly]
    let update = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
    let status = update == errSecItemNotFound ? SecItemAdd(query.merging(attributes) {_,new in new} as CFDictionary,nil) : update
    guard status == errSecSuccess else { throw RemoteError("Could not securely save the connection.") }
  }
  static func clear() { SecItemDelete(query as CFDictionary) }
}
