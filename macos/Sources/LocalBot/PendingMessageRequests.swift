import Foundation
import CryptoKit

final class PendingMessageRequests {
  private let defaults: UserDefaults
  private let key = "pendingMessageRequests"
  init(defaults: UserDefaults = .standard) { self.defaults = defaults }

  func requestID(conversation: String, content: String, attachments: [String]) -> String {
    let data = try! JSONSerialization.data(withJSONObject: [conversation, content, attachments])
    let fingerprint = SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
    var entries = defaults.dictionary(forKey: key) as? [String: [String: String]] ?? [:]
    if let prior = entries[conversation], prior["fingerprint"] == fingerprint, let id = prior["id"] { return id }
    let id = UUID().uuidString
    entries[conversation] = ["fingerprint": fingerprint, "id": id]
    defaults.set(entries, forKey: key)
    return id
  }

  func acknowledge(conversation: String, requestID: String) {
    var entries = defaults.dictionary(forKey: key) as? [String: [String: String]] ?? [:]
    guard entries[conversation]?["id"] == requestID else { return }
    entries.removeValue(forKey: conversation)
    defaults.set(entries, forKey: key)
  }
}
