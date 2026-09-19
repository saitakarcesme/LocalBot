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
  private var client: RemoteClient?
  private var refreshing = false
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
  func disconnect() { PhoneKeychain.clear(); client = nil; paired = false; connected = false; snapshot = nil; messages = []; activity = []; selected = nil }
  func refresh() async {
    guard let client, !refreshing else { return }
    refreshing = true
    defer { refreshing = false }
    do {
      let state = try JSONDecoder().decode(Snapshot.self, from: await client.api("/snapshot"))
      snapshot = state; connected = true; error = nil
      if let id = selected {
        let query = id.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? id
        let items = try JSONDecoder().decode([ChatMessage].self, from: await client.api("/messages?conversationId=" + query))
        let events = try JSONDecoder().decode([Activity].self, from: await client.api("/activity?conversationId=" + query))
        if selected == id { messages = items; activity = events }
      }
    } catch { if !Task.isCancelled { connected = false; self.error = error.localizedDescription } }
  }
  func select(_ id: String) { selected = id; messages = []; activity = [] }
  func send(_ text: String, project: String? = nil, agent: String? = nil) async -> Bool {
    guard let client, !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return false }
    busy = true; defer { busy = false }
    do {
      if selected == nil {
        var body: [String:Any] = ["title":"New conversation","members":agent.map {[$0]} ?? snapshot?.agents.first.map {[$0.id]} ?? [],"automatic": project != nil]
        if let project { body["projectId"] = project }
        let conversation = try JSONDecoder().decode(Conversation.self, from: await client.api("/conversations", body: body))
        selected = conversation.id
      }
      guard let selected else { return false }
      _ = try await client.api("/messages", body: ["conversationId":selected,"content":text,"requestId":UUID().uuidString])
      await refresh(); return true
    } catch { self.error = error.localizedDescription; return false }
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
