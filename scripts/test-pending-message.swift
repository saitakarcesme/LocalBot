import Foundation

@main struct PendingMessageChecks {
  static func main() {
    let suite = "LocalBot.SendTest." + UUID().uuidString
    let defaults = UserDefaults(suiteName: suite)!
    defer { defaults.removePersistentDomain(forName: suite) }
    let pending = PendingMessageRequests(defaults: defaults)
    let first = pending.requestID(conversation: "a", content: "Gönder 🚀", attachments: ["file"])
    let restored = PendingMessageRequests(defaults: defaults)
    precondition(restored.requestID(conversation: "a", content: "Gönder 🚀", attachments: ["file"]) == first)
    let changed = pending.requestID(conversation: "a", content: "Düzenlendi", attachments: ["file"])
    precondition(changed != first)
    pending.acknowledge(conversation: "a", requestID: first)
    precondition(pending.requestID(conversation: "a", content: "Düzenlendi", attachments: ["file"]) == changed)
    pending.acknowledge(conversation: "a", requestID: changed)
    precondition(pending.requestID(conversation: "a", content: "Düzenlendi", attachments: ["file"]) != changed)
    precondition(pending.requestID(conversation: "b", content: "Gönder 🚀", attachments: ["file"]) != first)
    print("Persistent message request checks passed")
  }
}
