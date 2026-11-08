import Foundation
import WebKit

@MainActor final class BrowserAutomation {
  static let shared = BrowserAutomation()
  private var sessions: [String: BrowserSession] = [:]
  private var busy = false
  private let world = WKContentWorld.world(name: "LocalBotAutomation")

  func poll(_ model: AppModel) async {
    guard !busy else { return }; busy = true; defer { busy = false }
    let finished = Set(model.tasks.filter { ["completed", "completed_with_errors", "failed", "cancelled", "interrupted"].contains($0.status) }.map { $0.id })
    sessions = sessions.filter { !finished.contains($0.key) }
    do {
      let data = try await model.request("/desktop/claim", body: [:])
      guard let envelope = try JSONSerialization.jsonObject(with: data) as? [String: Any],
            let request = envelope["request"] as? [String: Any],
            let id = request["id"] as? String, let task = request["taskId"] as? String,
            let name = request["name"] as? String, let args = request["args"] as? [String: String] else { return }
      var response: [String: Any] = ["id": id, "result": ""]
      do { response["result"] = try await execute(model, task: task, name: name, args: args) }
      catch { response["error"] = String(error.localizedDescription.prefix(2000)) }
      _ = try await model.request("/desktop/complete", body: response)
    } catch { /* Runtime unavailable: no action is replayed. */ }
  }
  private func fail(_ message: String) -> NSError { NSError(domain: "LocalBotBrowser", code: 1, userInfo: [NSLocalizedDescriptionKey: message]) }
  private func execute(_ model: AppModel, task: String, name: String, args: [String: String]) async throws -> String {
    if name.hasPrefix("computer_") { return try await ComputerAutomation.shared.execute(task: task, name: name, args: args) }
    if name == "browser_open" {
      guard let url = URL(string: args["url"] ?? ""), url.scheme == "https", url.host != nil, url.user == nil, url.password == nil else { throw fail("A plain HTTPS URL is required") }
      if sessions[task] == nil {
        guard sessions.count < 8 else { throw fail("Browser session limit reached; restart LocalBot after current tasks finish") }
        let session = BrowserSession(); sessions[task] = session
        let tab = WorkspaceTab(.browser, workspace: model.workspacePath); tab.browser = session
        model.workspace.add(tab); model.rightPanel = .workspace
      }
      sessions[task]!.navigate(url)
      return "Navigation requested. Call browser_snapshot to inspect the loaded page; navigation is not proof of completion."
    }
    guard let session = sessions[task] else { throw fail("Open a browser for this task first") }
    if session.loading { throw fail("Page is loading; inspect again after navigation completes") }
    guard session.web.url?.scheme == "https" else { throw fail("Automation requires an HTTPS page") }
    let script: String
    switch name {
    case "browser_snapshot":
      script = #"""
      const visible = el => !!(el.getClientRects().length) && getComputedStyle(el).visibility !== 'hidden';
      const protectedInput = el => el.type === 'password' || /password|cc-|one-time-code/.test(el.autocomplete || '');
      globalThis.lb = {at:Date.now(),url:location.href,refs:new Map()};
      const controls = Array.from(document.querySelectorAll('a,button,input,textarea,select,[role="button"],[contenteditable="true"]')).filter(el=>visible(el)&&!protectedInput(el)).slice(0,150).map((el,i)=>{
        const ref = crypto.randomUUID(); lb.refs.set(ref,el);
        return {ref,tag:el.tagName,label:(el.getAttribute('aria-label')||el.innerText||el.placeholder||'').slice(0,200),value:el.value?.slice(0,200),href:el.tagName==='A'?el.href:undefined};
      });
      return JSON.stringify({url:location.href,title:document.title,text:document.body.innerText.slice(0,12000),controls,untrusted:true});
      """#
    case "browser_click", "browser_type":
      script = #"""
      if (!globalThis.lb || Date.now()-lb.at>30000 || lb.url!==location.href) throw Error('Snapshot expired; inspect again');
      const el=lb.refs.get(ref); if(!el||!el.isConnected) throw Error('Stale reference');
      lb.refs.clear();
      if(el.type==='password'||/password|cc-|one-time-code/.test(el.autocomplete||'')) throw Error('Protected control');
      if(action==='browser_click') el.click();
      else {
        if(el.disabled||el.readOnly) throw Error('Control is not editable');
        if(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
          const proto=el instanceof HTMLInputElement?HTMLInputElement.prototype:HTMLTextAreaElement.prototype;
          Object.getOwnPropertyDescriptor(proto,'value').set.call(el,text);
        } else if(el.isContentEditable) el.textContent=text;
        else throw Error('Unsupported editable control');
        el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true}));
      }
      return 'Action dispatched; take a new snapshot to verify the result.';
      """#
    case "browser_scroll":
      script = "globalThis.lb = undefined; window.scrollBy(0, direction === 'up' ? -innerHeight : innerHeight); return 'Scrolled; inspect again';"
    default: throw fail("Unsupported browser action")
    }
    let result = try await session.web.callAsyncJavaScript(script, arguments: ["ref":args["ref"] ?? "", "text":args["text"] ?? "", "action":name, "direction":args["direction"] ?? "down"], in: nil, contentWorld: world)
    return String(describing: result ?? "")
  }
}
