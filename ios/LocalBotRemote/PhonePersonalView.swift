import SwiftUI
import MessageUI
import EventKit
import EventKitUI

struct PhoneAction: Decodable, Identifiable {
  var id: String; var conversationId: String; var kind: String; var payload: [String:String]; var status: String; var result: String?
  static func date(_ value: String?) -> Date? { let f=ISO8601DateFormatter(); if let d=f.date(from:value ?? "") { return d }; f.formatOptions=[.withInternetDateTime,.withFractionalSeconds];return f.date(from:value ?? "") }
  var title: String { switch kind { case "compose_mail": return "Email"; case "create_event": return "Calendar event"; case "run_shortcut": return "Shortcut"; default: return "Open link" } }
  var symbol: String { switch kind { case "compose_mail": return "envelope"; case "create_event": return "calendar"; case "run_shortcut": return "square.stack.3d.up"; default: return "safari" } }
  var detail: String { payload["subject"] ?? payload["title"] ?? payload["name"] ?? payload["url"] ?? title }
}
struct PhonePersonalView: View {
  @EnvironmentObject private var store: RemoteStore
  @Environment(\.dismiss) private var dismiss
  @Environment(\.openURL) private var openURL
  @State private var actions: [PhoneAction] = []
  @State private var context = false
  @State private var selected: PhoneAction?
  @State private var mail: PhoneAction?
  @State private var calendar: PhoneAction?
  @State private var busy = false
  @State private var error: String?
  private let outboxKey = "phone-action-results-v1"
  var body: some View {
    NavigationStack {
      ScrollView { VStack(alignment: .leading, spacing: 18) {
        Button { context = true } label: { Label("Personal context", systemImage: "person.text.rectangle").frame(maxWidth: .infinity, alignment: .leading).padding(18).background(.thinMaterial, in: RoundedRectangle(cornerRadius: 22)) }.buttonStyle(.plain)
        HStack { Text("Phone actions").font(.title3.bold()); Spacer(); Button { Task { await refresh() } } label: { Image(systemName: "arrow.clockwise") }.accessibilityLabel("Refresh phone actions") }
        if actions.isEmpty { Label("No actions waiting", systemImage: "checkmark.circle").foregroundStyle(.secondary).padding(.vertical) }
        ForEach(actions) { action in
          VStack(alignment: .leading, spacing: 10) {
            HStack { Label(action.title, systemImage: action.symbol).font(.headline); Spacer(); Text(statusLabel(action.status)).font(.caption).foregroundStyle(.secondary) }
            Text(action.detail).font(.callout).lineLimit(3)
            if let result = action.result { Text(result).font(.caption).foregroundStyle(.secondary) }
            if action.status == "pending" { Button("Review") { selected = action }.buttonStyle(.bordered) }
            if action.status == "claimed" { Text("Started on a phone. No final result recorded; check the destination before trying again.").font(.caption).foregroundStyle(.secondary) }
          }.padding(18).frame(maxWidth: .infinity, alignment: .leading).background(.thinMaterial, in: RoundedRectangle(cornerRadius: 22))
        }
        if let error { Text(error).foregroundStyle(.red).font(.caption).textSelection(.enabled) }
      }.padding(20) }.navigationTitle("Personal").navigationBarTitleDisplayMode(.inline)
        .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
        .sheet(isPresented: $context) { PersonalContextView(load: { try await store.read("/personal/context") }, save: { try await store.personalWrite("/personal/context", body: $0) }) }
        .sheet(item: $selected) { action in
          NavigationStack { ScrollView { VStack(alignment: .leading, spacing: 18) {
            Label(action.title, systemImage: action.symbol).font(.title2.bold())
            ForEach(action.payload.keys.sorted(), id: \.self) { key in VStack(alignment: .leading, spacing: 6) { Text(key.capitalized).font(.caption).foregroundStyle(.secondary); Text(action.payload[key] ?? "").textSelection(.enabled) } }
            Text(action.kind == "run_shortcut" ? "Opens this installed shortcut. Its own permissions and actions apply." : "Review the exact details before continuing.").font(.caption).foregroundStyle(.secondary)
            HStack { Button("Decline", role: .destructive) { Task { await decline(action) } }; Spacer(); Button("Continue") { Task { await execute(action) } }.buttonStyle(.borderedProminent) }.disabled(busy)
          }.padding(24) }.toolbar { ToolbarItem(placement: .cancellationAction) { Button("Close") { selected = nil } } } }
        }
        .sheet(item: $mail) { action in MailActionComposer(action: action) { status, result in mail = nil; Task { await finish(action, status, result) } }.interactiveDismissDisabled() }
        .sheet(item: $calendar) { action in CalendarActionComposer(action: action) { status, result in calendar = nil; Task { await finish(action, status, result) } }.interactiveDismissDisabled() }
        .task { while !Task.isCancelled { await refresh(); do { try await Task.sleep(for: .seconds(5)) } catch { return } } }
    }
  }
  private func statusLabel(_ status: String) -> String { switch status { case "pending": return "Needs review"; case "claimed": return "In progress"; case "handed_off": return "Opened"; default: return status.capitalized } }
  private func refresh() async {
    guard !busy else { return }; busy = true; defer { busy = false }
    do {
      let queued = UserDefaults.standard.dictionary(forKey: outboxKey) as? [String:[String:String]] ?? [:]
      for (id, result) in queued { _ = try await store.personalWrite("/phone/actions/update", body: ["id":id,"operation":"finish","status":result["status"] ?? "failed","result":result["result"] ?? "Unknown"]); var remaining=UserDefaults.standard.dictionary(forKey: outboxKey) ?? [:]; remaining.removeValue(forKey: id); UserDefaults.standard.set(remaining,forKey:outboxKey) }
      actions = try JSONDecoder().decode([PhoneAction].self, from: await store.read("/phone/actions")); error = nil
    } catch { self.error = error.localizedDescription }
  }
  private func claim(_ action: PhoneAction) async throws { _ = try await store.personalWrite("/phone/actions/update", body: ["id":action.id,"operation":"claim"]) }
  private func decline(_ action: PhoneAction) async { busy = true; defer { busy = false }; do { try await claim(action); selected = nil; await finish(action,"cancelled","Declined on phone.") } catch { self.error = error.localizedDescription } }
  private func finish(_ action: PhoneAction, _ status: String, _ result: String) async {
    var queued = UserDefaults.standard.dictionary(forKey: outboxKey) ?? [:]; queued[action.id] = ["status":status,"result":result]; UserDefaults.standard.set(queued,forKey:outboxKey)
    do { _ = try await store.personalWrite("/phone/actions/update", body: ["id":action.id,"operation":"finish","status":status,"result":result]); var remaining=UserDefaults.standard.dictionary(forKey: outboxKey) ?? [:]; remaining.removeValue(forKey: action.id); UserDefaults.standard.set(remaining,forKey:outboxKey); actions = try JSONDecoder().decode([PhoneAction].self, from: await store.read("/phone/actions")) } catch { self.error = "Result saved on this phone; reconnect to sync it. " + error.localizedDescription }
  }
  private func execute(_ action: PhoneAction) async {
    busy = true; defer { busy = false }
    do {
      if action.kind == "compose_mail" && !MFMailComposeViewController.canSendMail() { throw RemoteError("Set up an account in Apple Mail first, or ask LocalBot to use its Mac browser.") }
      if action.kind == "create_event", (PhoneAction.date(action.payload["start"]) == nil || PhoneAction.date(action.payload["end"]) == nil) { throw RemoteError("Calendar dates could not be read.") }
      try await claim(action); selected = nil
      // Present the system editor after the review sheet has dismissed.
      if action.kind == "compose_mail" { try? await Task.sleep(for: .milliseconds(350)); mail = action; return }
      if action.kind == "create_event" { try? await Task.sleep(for: .milliseconds(350)); calendar = action; return }
      var url: URL?
      if action.kind == "run_shortcut" { var parts = URLComponents(); parts.scheme="shortcuts"; parts.host="run-shortcut"; parts.queryItems=[URLQueryItem(name:"name",value:action.payload["name"]),URLQueryItem(name:"input",value:"text"),URLQueryItem(name:"text",value:action.payload["input"] ?? "")]; url=parts.url }
      else if action.kind == "open_url", let candidate=URL(string:action.payload["url"] ?? ""), candidate.scheme == "https" { url=candidate }
      guard let url else { await finish(action,"failed","Unsupported action URL."); return }
      openURL(url) { accepted in Task { await finish(action,accepted ? "handed_off" : "failed",accepted ? "Opened on phone. Downstream completion is not verified." : "The phone could not open this action.") } }
    } catch { self.error = error.localizedDescription }
  }
}
struct MailActionComposer: UIViewControllerRepresentable {
  var action: PhoneAction; var done: (String,String)->Void
  func makeCoordinator()->Coordinator { Coordinator(done) }
  func makeUIViewController(context: Context)->MFMailComposeViewController { let view=MFMailComposeViewController();view.mailComposeDelegate=context.coordinator;view.setToRecipients((action.payload["to"] ?? "").split(separator:",").map{ $0.trimmingCharacters(in:.whitespaces) });view.setSubject(action.payload["subject"] ?? "");view.setMessageBody(action.payload["body"] ?? "",isHTML:false);return view }
  func updateUIViewController(_ controller: MFMailComposeViewController, context: Context) {}
  class Coordinator:NSObject,MFMailComposeViewControllerDelegate { let done:(String,String)->Void;init(_ done:@escaping(String,String)->Void){self.done=done};func mailComposeController(_ controller:MFMailComposeViewController,didFinishWith result:MFMailComposeResult,error:Error?){switch result {case .sent:done("completed","Apple Mail accepted the message for sending. Delivery is not verified.");case .saved:done("handed_off","Draft saved in Apple Mail; not sent.");case .cancelled:done("cancelled","Email cancelled on phone.");default:done("failed",error?.localizedDescription ?? "Mail failed.")}} }
}
struct CalendarActionComposer:UIViewControllerRepresentable {
  var action:PhoneAction;var done:(String,String)->Void
  func makeCoordinator()->Coordinator {Coordinator(done)}
  func makeUIViewController(context:Context)->EKEventEditViewController {let view=EKEventEditViewController();let store=EKEventStore();view.eventStore=store;let event=EKEvent(eventStore:store);event.title=action.payload["title"];event.startDate=PhoneAction.date(action.payload["start"]);event.endDate=PhoneAction.date(action.payload["end"]);event.notes=action.payload["notes"];view.event=event;view.editViewDelegate=context.coordinator;return view}
  func updateUIViewController(_ controller:EKEventEditViewController,context:Context){}
  class Coordinator:NSObject,EKEventEditViewDelegate {let done:(String,String)->Void;init(_ done:@escaping(String,String)->Void){self.done=done};func eventEditViewController(_ controller:EKEventEditViewController,didCompleteWith action:EKEventEditViewAction){done(action == .saved ? "completed":"cancelled",action == .saved ? "Event saved through the Calendar editor.":"Calendar action cancelled.")} }
}
