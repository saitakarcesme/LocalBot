import AppKit
import ApplicationServices

/// User-enabled Accessibility control. References expire after every action.
@MainActor final class DesktopAutomation {
  private var references: [String: AXUIElement] = [:]
  private var observedAt = Date.distantPast
  private var application: NSRunningApplication?
  private func fail(_ text: String) -> NSError {NSError(domain:"LocalBot.ComputerUse",code:1,userInfo:[NSLocalizedDescriptionKey:text])}
  private func attribute(_ element: AXUIElement,_ key: String) -> AnyObject? {
    var value: CFTypeRef?;guard AXUIElementCopyAttributeValue(element,key as CFString,&value) == .success else{return nil};return value
  }
  func perform(_ name: String,args: [String:Any]) throws -> Any {
    guard AXIsProcessTrusted() else {throw fail("Enable LocalBot in System Settings → Privacy & Security → Accessibility to use Mac controls.")}
    if name == "computer_snapshot" {
      references.removeAll()
      if let bundle=args["application"] as? String,!bundle.isEmpty {
        guard let app=NSRunningApplication.runningApplications(withBundleIdentifier:bundle).first else {throw fail("The requested app is not running.")};application=app
      } else {application=NSWorkspace.shared.frontmostApplication}
      guard let app=application else {throw fail("No foreground application.")}
      let root=AXUIElementCreateApplication(app.processIdentifier)
      AXUIElementSetMessagingTimeout(root,1)
      let revision=UUID().uuidString
      var rows:[[String:Any]]=[]
      func walk(_ element: AXUIElement,_ depth:Int) {
        guard rows.count<200,depth<9 else{return}
        let role=attribute(element,kAXRoleAttribute) as? String ?? ""
        let title=attribute(element,kAXTitleAttribute) as? String ?? attribute(element,kAXDescriptionAttribute) as? String ?? ""
        let secure=(attribute(element,kAXSubroleAttribute) as? String)==kAXSecureTextFieldSubrole
        let value=secure ? "[protected]" : (attribute(element,kAXValueAttribute) as? String ?? "")
        let ref="\(revision):\(rows.count)";references[ref]=element
        rows.append(["ref":ref,"role":role,"title":String(title.prefix(300)),"value":String(value.prefix(1200))])
        for child in attribute(element,kAXChildrenAttribute) as? [AXUIElement] ?? [] {walk(child,depth+1)}
      }
      walk(root,0);observedAt=Date()
      return ["application":app.bundleIdentifier ?? "","elements":rows,"truncated":rows.count>=200]
    }
    guard Date().timeIntervalSince(observedAt)<30,let ref=args["ref"] as? String,let element=references[ref],let app=application,!app.isTerminated else {throw fail("Take a fresh computer_snapshot before acting.")}
    defer {references.removeAll();observedAt = .distantPast}
    guard (attribute(element,kAXSubroleAttribute) as? String) != kAXSecureTextFieldSubrole else {throw fail("Enter protected credentials yourself.")}
    app.activate()
    let result: AXError
    switch name {
    case "computer_click":result=AXUIElementPerformAction(element,kAXPressAction as CFString)
    case "computer_type":
      guard let text=args["text"] as? String,text.count<=20000 else {throw fail("Invalid text")}
      result=AXUIElementSetAttributeValue(element,kAXValueAttribute as CFString,text as CFTypeRef)
    default:throw fail("Unsupported computer action")
    }
    guard result == .success else {throw fail("This control does not support the requested action. Inspect the application again.")}
    return ["performed":true,"verificationRequired":true]
  }
}
