import AppKit
import ApplicationServices

actor ComputerAutomation {
  static let shared = ComputerAutomation()
  private struct Snapshot { var at: Date; var refs: [String: AXUIElement] }
  private var snapshots: [String: Snapshot] = [:]
  private func failure(_ text: String) -> NSError { NSError(domain: "LocalBotComputer", code: 1, userInfo: [NSLocalizedDescriptionKey: text]) }
  private func value(_ el: AXUIElement, _ key: String) -> AnyObject? {
    var result: CFTypeRef?
    guard AXUIElementCopyAttributeValue(el, key as CFString, &result) == .success else { return nil }
    return result
  }
  private func protected(_ el: AXUIElement) -> Bool {
    (value(el, kAXSubroleAttribute) as? String) == kAXSecureTextFieldSubrole
  }
  func execute(task: String, name: String, args: [String: String]) throws -> String {
    guard AXIsProcessTrusted() else { throw failure("Enable LocalBot in System Settings → Privacy & Security → Accessibility") }
    if name == "computer_snapshot" {
      guard let bundle = args["application"], let app = NSRunningApplication.runningApplications(withBundleIdentifier: bundle).first else { throw failure("Requested application is not running") }
      let root = AXUIElementCreateApplication(app.processIdentifier)
      AXUIElementSetMessagingTimeout(root, 0.2)
      var queue = [root], refs: [String: AXUIElement] = [:], rows: [[String: String]] = []
      let start = Date()
      while !queue.isEmpty && rows.count < 150 && Date().timeIntervalSince(start) < 2 {
        let el = queue.removeFirst()
        if protected(el) { continue }
        let ref = UUID().uuidString
        let role = value(el, kAXRoleAttribute) as? String ?? ""
        let title = value(el, kAXTitleAttribute) as? String ?? value(el, kAXDescriptionAttribute) as? String ?? ""
        refs[ref] = el; rows.append(["ref":ref,"role":role,"label":String(title.prefix(200))])
        if let children = value(el, kAXChildrenAttribute) as? [AXUIElement] { queue.append(contentsOf: children.prefix(max(0, 200 - queue.count))) }
      }
      snapshots = snapshots.filter { Date().timeIntervalSince($0.value.at) < 30 }
      snapshots[task] = Snapshot(at:Date(),refs:refs)
      let data = try JSONSerialization.data(withJSONObject: ["application":bundle,"controls":rows,"truncated":!queue.isEmpty,"untrusted":true])
      return String(decoding:data,as:UTF8.self)
    }
    guard let snapshot = snapshots.removeValue(forKey:task), Date().timeIntervalSince(snapshot.at) < 30,
          let ref = args["ref"], let el = snapshot.refs[ref], !protected(el) else { throw failure("Reference expired; inspect the app again") }
    let result: AXError
    if name == "computer_click" { result = AXUIElementPerformAction(el, kAXPressAction as CFString) }
    else if name == "computer_type" {
      var settable: DarwinBoolean = false
      guard AXUIElementIsAttributeSettable(el, kAXValueAttribute as CFString, &settable) == .success, settable.boolValue else { throw failure("Control is not editable") }
      result = AXUIElementSetAttributeValue(el,kAXValueAttribute as CFString,(args["text"] ?? "") as CFString)
    } else { throw failure("Unsupported computer action") }
    guard result == .success else { throw failure("macOS rejected the action (\(result.rawValue)); inspect again") }
    return "Action dispatched. Inspect again to verify the result."
  }
}
