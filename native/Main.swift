import AppKit
import WebKit
import Security
import UserNotifications
import PDFKit
import LocalAuthentication
import AVFoundation

struct Connection: Decodable { let port: Int; let token: String }
enum LocalError: LocalizedError {
 case message(String)
 var errorDescription: String? { if case .message(let message) = self { return message }; return nil }
}
@MainActor final class BotBrowser: NSObject, WKNavigationDelegate, NSTextFieldDelegate {
 static let storeID = UUID(uuidString: "6F1C3D2A-8B4E-4E7A-9C1D-2B3A4C5D6E7F")!
 let web: WKWebView = {
  // The bot's browser keeps its own cookies and logins, separate from LocalBot's UI.
  let config = WKWebViewConfiguration(); config.websiteDataStore = WKWebsiteDataStore(forIdentifier: BotBrowser.storeID)
  return WKWebView(frame: .zero, configuration: config)
 }()
 let address = NSTextField()
 let world = WKContentWorld.world(name: "LocalBotTools")
 override init() {
  super.init()
  web.frame=NSRect(x:0,y:0,width:1000,height:650)
  web.navigationDelegate=self
 }

 @objc func navigateAddress() {
  let input = address.stringValue.contains("://") ? address.stringValue : "https://" + address.stringValue
  if let url=URL(string:input),["http","https"].contains(url.scheme ?? "") {web.load(URLRequest(url:url))}
 }
 func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { address.stringValue = web.url?.absoluteString ?? "" }
 func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy)->Void) {
  decisionHandler(["http","https","about"].contains(action.request.url?.scheme ?? "") ? .allow : .cancel)
 }
 func evaluate(_ script:String,_ args:[String:Any]) async throws -> Any {
  try await withCheckedThrowingContinuation { continuation in
   web.callAsyncJavaScript(script,arguments:args,in:nil,in:world) { result in
    switch result {case .success(let value): continuation.resume(returning:value);case .failure(let error): continuation.resume(throwing:error)}
   }
  }
 }
 func act(name:String,args:[String:Any]) async throws -> String {
  if name == "browser_open" {
   guard let url=URL(string:args["url"] as? String ?? ""),["http","https"].contains(url.scheme ?? "") else {throw LocalError.message("Invalid browser URL")}
   address.stringValue=url.absoluteString;web.load(URLRequest(url:url))
   return "Opened " + url.absoluteString + ". Use browser_read after the page loads."
  }
  if name == "browser_read" {
   let script = """
   globalThis.botRefs = new Map();
   let i=0;
   const controls=[...document.querySelectorAll('a,button,input,textarea,select,[role="button"]')].filter(el=>el.getBoundingClientRect().width>0).slice(0,250).map(el=>{
     const ref=String(++i);botRefs.set(ref,el);
     return {ref,tag:el.tagName,label:(el.getAttribute('aria-label')||el.innerText||el.getAttribute('placeholder')||'').slice(0,180),type:el.type};
   });
   return JSON.stringify({url:location.href,title:document.title,text:document.body.innerText.slice(0,20000),controls});
   """
   let result=try await evaluate(script, [:])
   return result as? String ?? ""
  }
  let script = """
  const el=globalThis.botRefs?.get(ref);
  if(!el || !el.isConnected) throw Error('Reference expired. Read the page again.');
  if(el.type==='password'||/password|credit-card|cc-number|one-time-code/i.test(el.autocomplete||'')) throw Error('Enter sensitive fields yourself.');
  if(action==='browser_click'){el.click();return 'Clicked '+ref;}
  if(!['INPUT','TEXTAREA'].includes(el.tagName))throw Error('Not a text field');
  el.focus();
  const proto=el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto,'value').set.call(el,text);
  el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));
  return 'Typed into '+ref;
  """
  let result=try await evaluate(script, ["ref":args["ref"] as? String ?? "","text":args["text"] as? String ?? "","action":name])
  return result as? String ?? "Done"
 }
}
final class HostWebView: WKWebView {
 var lastMouseDown: NSEvent?
 override func mouseDown(with event: NSEvent) { lastMouseDown = event; super.mouseDown(with: event) }
}
@MainActor final class AppController: NSObject, NSApplicationDelegate, NSWindowDelegate, WKScriptMessageHandler, WKNavigationDelegate, WKUIDelegate, UNUserNotificationCenterDelegate {
 private var filePicker:LocalFilePicker?

 var statusItem: NSStatusItem?
 var window: NSWindow!
 var web: HostWebView!
 var process: Process?
 var connection: Connection?
 var timer: Timer?
 var claimBusy=false
 var browsers:[String:BotBrowser]=[:]
 var dockButton:NSButton?
 var computers:[String:ComputerAccess]=[:]
 let dataRoot=FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Application Support/LocalBot/Rebuilt")
 func applicationDidFinishLaunching(_ notification: Notification) {
  NSApp.setActivationPolicy(.regular)
  let menu=NSMenu();let appItem=NSMenuItem();menu.addItem(appItem);let appMenu=NSMenu();appItem.submenu=appMenu
  appMenu.addItem(withTitle:"About LocalBot",action:#selector(NSApplication.orderFrontStandardAboutPanel(_:)),keyEquivalent:"")
  appMenu.addItem(.separator());appMenu.addItem(withTitle:"Quit LocalBot",action:#selector(NSApplication.terminate(_:)),keyEquivalent:"q")
  let editItem=NSMenuItem();menu.addItem(editItem);let edit=NSMenu(title:"Edit");editItem.submenu=edit
  for (name,action,key) in [("Undo","undo:","z"),("Cut","cut:","x"),("Copy","copy:","c"),("Paste","paste:","v"),("Select All","selectAll:","a")] {edit.addItem(withTitle:name,action:Selector(action),keyEquivalent:key)}
  let viewItem=NSMenuItem();menu.addItem(viewItem);let viewMenu=NSMenu(title:"View");viewItem.submenu=viewMenu
  for (title,key,action) in [("Zoom In","+",#selector(zoomIn)),("Zoom Out","-",#selector(zoomOut)),("Actual Size","0",#selector(resetZoom))] {let item=viewMenu.addItem(withTitle:title,action:action,keyEquivalent:key);item.target=self}
  let windowItem=NSMenuItem();menu.addItem(windowItem);let windowMenu=NSMenu(title:"Window");windowItem.submenu=windowMenu;NSApp.windowsMenu=windowMenu
  windowMenu.addItem(withTitle:"Minimize",action:#selector(NSWindow.miniaturize(_:)),keyEquivalent:"m")
  let show=windowMenu.addItem(withTitle:"Show LocalBot",action:#selector(showWindow),keyEquivalent:"");show.target=self
  let helpItem=NSMenuItem();menu.addItem(helpItem);let helpMenu=NSMenu(title:"Help");helpItem.submenu=helpMenu
  let shortcuts=helpMenu.addItem(withTitle:"Keyboard Shortcuts",action:#selector(showShortcuts),keyEquivalent:"/");shortcuts.target=self
  statusItem=NSStatusBar.system.statusItem(withLength:NSStatusItem.variableLength);statusItem?.button?.title="L";statusItem?.button?.toolTip="LocalBot"
  let statusMenu=NSMenu();let open=statusMenu.addItem(withTitle:"Open LocalBot",action:#selector(showWindow),keyEquivalent:"");open.target=self
  statusMenu.addItem(withTitle:"Quit LocalBot",action:#selector(NSApplication.terminate(_:)),keyEquivalent:"");statusItem?.menu=statusMenu
  NSApp.mainMenu=menu
  window=NSWindow(contentRect:NSRect(x:0,y:0,width:1040,height:800),styleMask:[.titled,.closable,.miniaturizable,.resizable,.fullSizeContentView],backing:.buffered,defer:false)
  window.delegate=self;window.title="LocalBot";window.titleVisibility = .hidden;window.titlebarAppearsTransparent=true;window.isMovableByWindowBackground=false
  window.minSize=NSSize(width:660,height:500);window.backgroundColor = .clear;window.isOpaque=false;window.isReleasedWhenClosed=false
  window.setFrameAutosaveName("LocalBotCleanRoom");window.center()
  let config=WKWebViewConfiguration();config.userContentController.add(self,name:"localbot")
  web=HostWebView(frame:.zero,configuration:config);web.navigationDelegate=self;web.uiDelegate=self;web.setValue(false,forKey:"drawsBackground")
  let glass=NSVisualEffectView(frame:window.contentLayoutRect);glass.material = .underWindowBackground;glass.blendingMode = .behindWindow;glass.state = .active
  web.frame=glass.bounds;web.autoresizingMask=[.width,.height];glass.addSubview(web)
  glass.wantsLayer=true;glass.layer?.cornerRadius=22;glass.layer?.cornerCurve = .continuous;glass.layer?.masksToBounds=true
  window.contentView=glass;window.makeKeyAndOrderFront(nil);alignWindowButtons();NSApp.activate(ignoringOtherApps:true)
  UNUserNotificationCenter.current().delegate=self
  startRuntime()
 }
 func alignWindowButtons() {
  for (index,type) in [NSWindow.ButtonType.closeButton,.miniaturizeButton,.zoomButton].enumerated() {
   if let button=window.standardWindowButton(type),let parent=button.superview {
    button.setFrameOrigin(NSPoint(x:CGFloat(24+20*index),y:parent.bounds.height-34-button.frame.height/2))
   }
  }
 }
 func windowDidResize(_ notification:Notification){alignWindowButtons()}
 func startRuntime(){
  guard let resources=Bundle.main.resourceURL else{return}
  let proc=Process();proc.executableURL=resources.appendingPathComponent("node");proc.arguments=[resources.appendingPathComponent("runtime/server.mjs").path]
  var env=ProcessInfo.processInfo.environment;env["LOCALBOT_DATA"]=dataRoot.path;proc.environment=env
  let pipe=Pipe();proc.standardOutput=pipe;proc.standardError=FileHandle.standardError
  process=proc
  do {try proc.run()} catch {showError(error.localizedDescription);return}
  DispatchQueue.global().async { [weak self] in
   var bytes=Data()
   while true{
    let chunk=pipe.fileHandleForReading.readData(ofLength:1);if chunk.isEmpty {break};bytes.append(chunk);if chunk.first==10 {break}
   }
   let parsed=try? JSONDecoder().decode(Connection.self,from:bytes)
   DispatchQueue.main.async {
    guard let self else{return}
    guard let parsed else {self.showError("LocalBot’s runtime could not start.");return}
    self.connection=parsed
    Task {
     self.web.configuration.userContentController.addUserScript(WKUserScript(source:"window.__localToken = '\(parsed.token)';",injectionTime:.atDocumentStart,forMainFrameOnly:true))
     guard let url=URL(string:"http://127.0.0.1:\(parsed.port)/") else{return}
     self.web.load(URLRequest(url:url))
     Task { if let key=await Task.detached(priority:.utility,operation:{self.readKey()}).value { _ = try? await self.api("credentials",["key":key]) } }
     self.timer=Timer.scheduledTimer(withTimeInterval:0.35,repeats:true){ [weak self] _ in Task { @MainActor in await self?.claim() } }
    }
   }
  }
 }
 func showError(_ message:String){let alert=NSAlert();alert.messageText="LocalBot";alert.informativeText=message;alert.runModal()}
 func api(_ path:String,_ body:[String:Any]) async throws -> Any {
  guard let c=connection,let url=URL(string:"http://127.0.0.1:\(c.port)/api/"+path) else {throw LocalError.message("Runtime not connected")}
  var request=URLRequest(url:url);request.httpMethod="POST";request.timeoutInterval=65
  request.setValue("Bearer "+c.token,forHTTPHeaderField:"Authorization");request.setValue("application/json",forHTTPHeaderField:"Content-Type")
  request.httpBody=try JSONSerialization.data(withJSONObject:body)
  let (data,response)=try await URLSession.shared.data(for:request)
  let value=try JSONSerialization.jsonObject(with:data)
  guard (response as? HTTPURLResponse)?.statusCode == 200 else{throw LocalError.message((value as? [String:Any])?["error"] as? String ?? "Request failed")}
  return value
 }
 func respond(_ id:String,_ value:Any=NSNull(),_ error:String?=nil) {
  guard let data=try? JSONSerialization.data(withJSONObject:[id,value,error as Any? ?? NSNull()]),let json=String(data:data,encoding:.utf8) else{return}
  web.evaluateJavaScript("window.nativeResult(..."+json+")",completionHandler:nil)
 }
 func userContentController(_ userContentController:WKUserContentController,didReceive message:WKScriptMessage){
  guard message.frameInfo.isMainFrame,message.frameInfo.securityOrigin.host=="127.0.0.1",message.frameInfo.securityOrigin.port==connection?.port,
   let body=message.body as? [String:Any],let id=body["id"] as? String,let action=body["action"] as? String else{return}
  Task { do {let result=try await handle(action,body);respond(id,result)} catch {respond(id,NSNull(),error.localizedDescription)} }
 }
 func handle(_ action:String,_ body:[String:Any]) async throws -> Any {
  switch action {
  case "saveKey":
   guard let key=body["key"] as? String,!key.isEmpty else{throw LocalError.message("Missing key")}
   try saveKey(key);_ = try await api("credentials",["key":key]);return true
  case "copy": NSPasteboard.general.clearContents();NSPasteboard.general.setString(body["text"] as? String ?? "",forType:.string);return true
  case "browseFiles":
   let path=(body["path"] as? String ?? "~") as NSString
   let folder=URL(fileURLWithPath:path.expandingTildeInPath).standardizedFileURL
   let entries=try FileManager.default.contentsOfDirectory(at:folder,includingPropertiesForKeys:[.isDirectoryKey,.fileSizeKey],options:[.skipsHiddenFiles]).sorted{$0.lastPathComponent.localizedStandardCompare($1.lastPathComponent) == .orderedAscending}
   return ["path":folder.path,"parent":folder.deletingLastPathComponent().path,"entries":try entries.map{url -> [String:Any] in let values=try url.resourceValues(forKeys:[.isDirectoryKey,.fileSizeKey]);return ["name":url.lastPathComponent,"path":url.path,"directory":values.isDirectory ?? false,"size":values.fileSize ?? 0]}] as [String:Any]
  case "importPaths":
   guard let bot=body["bot"] as? String,let paths=body["paths"] as? [String] else{throw LocalError.message("Choose a file")}
   var names=[String]()
   for path in paths {
    let url=URL(fileURLWithPath:path),attrs=try url.resourceValues(forKeys:[.fileSizeKey,.isRegularFileKey])
    guard attrs.isRegularFile==true,(attrs.fileSize ?? 0)<=8_000_000 else{throw LocalError.message("Choose a regular file under 8 MB")}
    let data=try Data(contentsOf:url),result=try await api("import",["bot":bot,"name":url.lastPathComponent,"data":data.base64EncodedString()])
    if let name=(result as? [String:Any])?["name"] as? String{names.append(name)}
   };return names
  case "exportDownloads":
   let directory=FileManager.default.urls(for:.downloadsDirectory,in:.userDomainMask)[0]
   let name=URL(fileURLWithPath:body["name"] as? String ?? "Conversation.md").lastPathComponent
   let target=directory.appendingPathComponent("LocalBot-"+String(Int(Date().timeIntervalSince1970))+"-"+name)
   try (body["text"] as? String ?? "").write(to:target,atomically:true,encoding:.utf8);return true
  case "attach":
   guard let bot=body["bot"] as? String else{throw LocalError.message("Missing Bot")}
   let urls:[URL]=await withCheckedContinuation { continuation in
    guard self.filePicker == nil else {continuation.resume(returning:[]);return}
    self.filePicker=LocalFilePicker(multiple:true){[weak self] urls in continuation.resume(returning:urls ?? []);self?.filePicker=nil}
    self.filePicker?.show(on:self.window)
   }
   var names=[String]()
   for url in urls {
    let attrs=try url.resourceValues(forKeys:[.fileSizeKey]);guard (attrs.fileSize ?? 0)<=8_000_000 else{throw LocalError.message("Files must be under 8 MB")}
    let data=try Data(contentsOf:url);let result=try await api("import",["bot":bot,"name":url.lastPathComponent,"data":data.base64EncodedString()])
    if let name=(result as? [String:Any])?["name"] as? String {names.append(name)}
   };return names
  case "openFile":
   guard let path=body["path"] as? String else{throw LocalError.message("Missing file")}
   let url=URL(fileURLWithPath:path).resolvingSymlinksInPath(),root=dataRoot.appendingPathComponent("Files").resolvingSymlinksInPath().path+"/"
   guard url.path.hasPrefix(root) else{throw LocalError.message("File is outside Bot files")}
   NSWorkspace.shared.open(url);return true
  case "export":
   let selected:URL?=await withCheckedContinuation { continuation in
    DispatchQueue.main.async {
     let panel=NSSavePanel();panel.nameFieldStringValue=body["name"] as? String ?? "Conversation.md"
     panel.beginSheetModal(for:self.window){response in continuation.resume(returning:response == .OK ? panel.url : nil)}
    }
   }
   guard let url=selected else{return false}
   try (body["text"] as? String ?? "").write(to:url,atomically:true,encoding:.utf8);return true
  case "computerDock":
   let bot=body["bot"] as? String ?? ""
   guard !bot.isEmpty else{return false}
   if body["hidden"] as? Bool == true {browsers[bot]?.web.removeFromSuperview();dockButton?.removeFromSuperview();return true}
   let target=browser(bot)
   for (id,b) in browsers where id != bot {b.web.removeFromSuperview()}
   let vw=max(1,(body["viewportWidth"] as? Double) ?? Double(web.bounds.width))
   let vh=max(1,(body["viewportHeight"] as? Double) ?? Double(web.bounds.height))
   let sx=Double(web.bounds.width)/vw,sy=Double(web.bounds.height)/vh
   let x=((body["x"] as? Double) ?? 0)*sx,y=((body["y"] as? Double) ?? 0)*sy
   let width=max(1,((body["width"] as? Double) ?? 360)*sx),height=max(1,((body["height"] as? Double) ?? 220)*sy)
   target.web.translatesAutoresizingMaskIntoConstraints=true
   if target.web.superview !== web {target.web.removeFromSuperview();web.addSubview(target.web)}
   let originY=web.isFlipped ? y : Double(web.bounds.height)-y-height
   target.web.frame=NSRect(x:x,y:originY,width:width,height:height)
   // Only the page is shown: rounded, with one round button sitting on its top-right corner.
   target.web.wantsLayer=true;target.web.layer?.cornerRadius=CGFloat((body["radius"] as? Double) ?? 14);target.web.layer?.masksToBounds=true
   target.web.layer?.borderWidth=0.5;target.web.layer?.borderColor=NSColor.separatorColor.cgColor
   let side=26.0
   let button=dockButton ?? {
    let b=NSButton(frame:NSRect(x:0,y:0,width:side,height:side));b.isBordered=false;b.title="";b.bezelStyle = .regularSquare
    b.image=NSImage(systemSymbolName:"minus",accessibilityDescription:"Minimize bot computer")?.withSymbolConfiguration(NSImage.SymbolConfiguration(pointSize:11,weight:.bold))
    b.imagePosition = .imageOnly;b.contentTintColor = .labelColor;b.toolTip="Minimize";b.setAccessibilityLabel("Minimize bot computer")
    b.wantsLayer=true;b.layer?.cornerRadius=CGFloat(side/2);b.layer?.borderWidth=0.5
    b.shadow={let s=NSShadow();s.shadowBlurRadius=6;s.shadowOffset=NSSize(width:0,height:-1);s.shadowColor=NSColor.black.withAlphaComponent(0.3);return s}()
    b.target=self;b.action=#selector(minimizeDock);dockButton=b;return b
   }()
   button.layer?.backgroundColor=NSColor.windowBackgroundColor.cgColor;button.layer?.borderColor=NSColor.separatorColor.cgColor
   let cornerY=web.isFlipped ? originY : originY+height
   button.frame=NSRect(x:x+width-side/2,y:cornerY-side/2,width:side,height:side)
   if button.superview !== web {button.removeFromSuperview()}
   web.addSubview(button,positioned:.above,relativeTo:target.web)
   return true
  case "appearance":
   // The glass behind the page follows the theme chosen in LocalBot, not only the system one.
   let theme=body["theme"] as? String ?? "system"
   NSApp.appearance = theme=="dark" ? NSAppearance(named:.darkAqua) : theme=="light" ? NSAppearance(named:.aqua) : nil
   return true
  case "browser":
   let bot=body["bot"] as? String ?? "";_ = browser(bot);return true
  case "dragWindow":
   if let event=web.lastMouseDown {window.performDrag(with:event)};return true
  case "zoomWindow": window.zoom(nil);return true
  case "notify":
   // Only interrupt when LocalBot isn't the app in front.
   if NSApp.isActive {return false}
   let center=UNUserNotificationCenter.current()
   let granted=(try? await center.requestAuthorization(options:[.alert,.sound])) ?? false
   guard granted else{return false}
   let content=UNMutableNotificationContent();content.title=body["title"] as? String ?? "LocalBot";content.body=body["body"] as? String ?? ""
   if body["sound"] as? Bool == true {content.sound = .default}
   try await center.add(UNNotificationRequest(identifier:UUID().uuidString,content:content,trigger:nil));return true
  case "activity": statusItem?.button?.title=(body["busy"] as? Bool == true) ? "L •" : "L";return true
  case "permissionStatus": return ["accessibility":AXIsProcessTrusted(),"screen":CGPreflightScreenCaptureAccess(),"microphone":AVCaptureDevice.authorizationStatus(for:.audio) == .authorized]
  case "browserPreview":
   let bot=body["bot"] as? String ?? ""
   guard let browser=browsers[bot] else{return ""}
   let image=try await browser.web.takeSnapshot(configuration:nil)
   guard let tiff=image.tiffRepresentation,let bitmap=NSBitmapImageRep(data:tiff),let png=bitmap.representation(using:.png,properties:[:]) else{return ""}
   return "data:image/png;base64,"+png.base64EncodedString()
  case "accessibilityStatus": return AXIsProcessTrusted()
  case "openAccessibility":
   let options=["AXTrustedCheckOptionPrompt":true] as CFDictionary;_ = AXIsProcessTrustedWithOptions(options)
   if let url=URL(string:"x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility"){NSWorkspace.shared.open(url)};return true
  case "clearBrowserData":
   let store=WKWebsiteDataStore(forIdentifier:BotBrowser.storeID)
   await store.removeData(ofTypes:WKWebsiteDataStore.allWebsiteDataTypes(),modifiedSince:.distantPast);return true
  case "openDataFolder": NSWorkspace.shared.activateFileViewerSelecting([dataRoot]);return true
  default:throw LocalError.message("Unknown native action")
  }
 }
 func browser(_ bot:String)->BotBrowser{if let b=browsers[bot]{return b};let b=BotBrowser();browsers[bot]=b;return b}
 func claim() async {
  guard !claimBusy else{return};claimBusy=true;defer{claimBusy=false}
  do{
   guard let item=try await api("native/claim",[:]) as? [String:Any],let id=item["id"] as? String,let bot=item["bot"] as? String,let name=item["name"] as? String else{return}
   do{
    let args=item["args"] as? [String:Any] ?? [:]
    let result:String
    if name == "document_read" {
     let path=args["path"] as? String ?? ""
     let url=URL(fileURLWithPath:path).resolvingSymlinksInPath()
     let root=dataRoot.appendingPathComponent("Files").appendingPathComponent(bot).resolvingSymlinksInPath().path+"/"
     guard url.path.hasPrefix(root),let document=PDFDocument(url:url) else{throw LocalError.message("Cannot read this PDF")}
     result=String((document.string ?? "No text layer. This PDF may be scanned.").prefix(60000))
    }else if name.hasPrefix("computer_") {
     if computers[bot]==nil{computers[bot]=ComputerAccess()}
     result=try computers[bot]!.act(name,args)
    }else{result=try await browser(bot).act(name:name,args:args)}
    _ = try await api("native/complete",["id":id,"result":result])
   }
   catch{_ = try? await api("native/complete",["id":id,"error":error.localizedDescription])}
  }catch{}
 }
 func webView(_ webView:WKWebView,decidePolicyFor action:WKNavigationAction,decisionHandler:@escaping(WKNavigationActionPolicy)->Void){
  let url=action.request.url
  if url?.host=="127.0.0.1",url?.port==connection?.port {decisionHandler(.allow)}
  else{decisionHandler(.cancel);if let url,["https","http"].contains(url.scheme ?? ""){NSWorkspace.shared.open(url)}}
 }
 // <input type="file"> in the UI opens the standard macOS panel.
 func webView(_ webView:WKWebView,runOpenPanelWith parameters:WKOpenPanelParameters,initiatedByFrame frame:WKFrameInfo,completionHandler:@escaping([URL]?)->Void){
  guard filePicker == nil,let parent=webView.window else {completionHandler(nil);return}
  filePicker=LocalFilePicker(multiple:parameters.allowsMultipleSelection){[weak self] urls in
   completionHandler(urls);self?.filePicker=nil
  }
  filePicker?.show(on:parent)
 }
 nonisolated func userNotificationCenter(_ center:UNUserNotificationCenter,didReceive response:UNNotificationResponse,withCompletionHandler done:@escaping()->Void){
  Task{@MainActor in NSApp.activate(ignoringOtherApps:true);self.window.makeKeyAndOrderFront(nil)};done()
 }
 // The key lives only in this app's own Keychain item. The app is signed with a stable
 // identity, so macOS trusts every rebuild and never asks for the login keychain password.
 // Reads never show UI: if the item is unreadable the app simply reports "Needs API key".
 nonisolated static let keyItem:[String:Any]=[kSecClass as String:kSecClassGenericPassword,kSecAttrService as String:"LocalBot",kSecAttrAccount as String:"model-key"]
 nonisolated func readKey()->String?{
  let context=LAContext();context.interactionNotAllowed=true
  var query=Self.keyItem;query[kSecReturnData as String]=true;query[kSecMatchLimit as String]=kSecMatchLimitOne;query[kSecUseAuthenticationContext as String]=context
  var result:CFTypeRef?
  guard SecItemCopyMatching(query as CFDictionary,&result)==errSecSuccess,let data=result as? Data else{return nil}
  return String(data:data,encoding:.utf8)?.trimmingCharacters(in:.whitespacesAndNewlines)
 }
 func saveKey(_ key:String)throws{
  let data=Data(key.trimmingCharacters(in:.whitespacesAndNewlines).utf8)
  let result=SecItemUpdate(Self.keyItem as CFDictionary,[kSecValueData as String:data] as CFDictionary)
  if result==errSecItemNotFound{var item=Self.keyItem;item[kSecValueData as String]=data;item[kSecAttrLabel as String]="LocalBot model key";guard SecItemAdd(item as CFDictionary,nil)==errSecSuccess else{throw LocalError.message("Could not save key")}}
  else if result != errSecSuccess{throw LocalError.message("Could not update key")}
 }
 @objc func showWindow(){window.makeKeyAndOrderFront(nil);NSApp.activate(ignoringOtherApps:true)}
 @objc func minimizeDock(){web.evaluateJavaScript("window.dispatchEvent(new Event('localbot:computer-minimize'))",completionHandler:nil)}
 @objc func zoomIn(){web.pageZoom=min(1.4,web.pageZoom+0.1)}
 @objc func zoomOut(){web.pageZoom=max(0.8,web.pageZoom-0.1)}
 @objc func resetZoom(){web.pageZoom=1}
 @objc func showShortcuts(){showWindow();web.evaluateJavaScript("window.dispatchEvent(new Event('localbot:shortcuts'))",completionHandler:nil)}
 func applicationShouldTerminateAfterLastWindowClosed(_ sender:NSApplication)->Bool{return false}
 func applicationShouldHandleReopen(_ sender:NSApplication,hasVisibleWindows flag:Bool)->Bool{window.makeKeyAndOrderFront(nil);return true}
 func applicationWillTerminate(_ notification:Notification){timer?.invalidate();if process?.isRunning==true{process?.terminate()}}
}
@main struct Main {
 @MainActor static func main() {
  if CommandLine.arguments.contains("--save-model-key") {
   let data=FileHandle.standardInput.readDataToEndOfFile()
   guard let key=String(data:data,encoding:.utf8),!key.isEmpty else{exit(1)}
   do{try AppController().saveKey(key.trimmingCharacters(in:.whitespacesAndNewlines));print("Key saved in macOS Keychain");return}catch{fputs("Could not save key\n",stderr);exit(1)}
  }
  let app=NSApplication.shared
  let controller=AppController()
  app.delegate=controller
  withExtendedLifetime(controller) { app.run() }
 }
}
