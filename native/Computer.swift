import AppKit
import ApplicationServices

@MainActor final class ComputerAccess {
 var refs:[String:AXUIElement]=[:]
 func value(_ element:AXUIElement,_ key:String)->CFTypeRef?{
  var result:CFTypeRef?;guard AXUIElementCopyAttributeValue(element,key as CFString,&result) == .success else{return nil};return result
 }
 func string(_ element:AXUIElement,_ key:String)->String{value(element,key) as? String ?? ""}
 func act(_ name:String,_ args:[String:Any]) throws -> String {
  if name=="computer_apps" {
   let apps=NSWorkspace.shared.runningApplications.filter{$0.activationPolicy == .regular}.map{["name":$0.localizedName ?? "","bundle":$0.bundleIdentifier ?? ""]}
   return String(data:try JSONSerialization.data(withJSONObject:apps),encoding:.utf8) ?? "[]"
  }
  guard AXIsProcessTrusted() else {throw LocalError.message("Enable LocalBot in System Settings → Privacy & Security → Accessibility to use computer tools.")}
  if name=="computer_read" {
   guard let bundle=args["bundle"] as? String,let app=NSWorkspace.shared.runningApplications.first(where:{$0.bundleIdentifier==bundle}) else {throw LocalError.message("App not running")}
   refs.removeAll();let root=AXUIElementCreateApplication(app.processIdentifier);AXUIElementSetMessagingTimeout(root,1)
   var rows=[[String:Any]]()
   func visit(_ el:AXUIElement,_ depth:Int){
    if rows.count>=180 || depth>9{return}
    let role=string(el,kAXRoleAttribute),subrole=string(el,kAXSubroleAttribute)
    if subrole=="AXSecureTextField"{return}
    let ref=String(rows.count+1);refs[ref]=el
    let label=string(el,kAXTitleAttribute).isEmpty ? string(el,kAXDescriptionAttribute) : string(el,kAXTitleAttribute)
    rows.append(["ref":ref,"role":role,"label":String(label.prefix(200)),"value":String(string(el,kAXValueAttribute).prefix(600))])
    if let children=value(el,kAXChildrenAttribute) as? [AXUIElement]{for child in children{visit(child,depth+1)}}
   }
   visit(root,0);return String(data:try JSONSerialization.data(withJSONObject:rows),encoding:.utf8) ?? "[]"
  }
  guard let ref=args["ref"] as? String,let el=refs[ref] else{throw LocalError.message("Read the app again; reference expired.")}
  if string(el,kAXSubroleAttribute)=="AXSecureTextField"{throw LocalError.message("Sensitive fields must be entered manually.")}
  var pid:pid_t=0;AXUIElementGetPid(el,&pid)
  NSRunningApplication(processIdentifier:pid)?.activate(options:[])
  if name=="computer_click" {
   guard AXUIElementPerformAction(el,kAXPressAction as CFString) == .success else{throw LocalError.message("This control does not expose a press action.")}
  }else if name=="computer_type" {
   let role=string(el,kAXRoleAttribute);guard ["AXTextField","AXTextArea"].contains(role) else{throw LocalError.message("This is not a text field")}
   guard AXUIElementSetAttributeValue(el,kAXValueAttribute as CFString,(args["text"] as? String ?? "") as CFString) == .success else{throw LocalError.message("Text field is not editable")}
  }else {throw LocalError.message("Unknown computer action")}
  return "Action completed"
 }
}
