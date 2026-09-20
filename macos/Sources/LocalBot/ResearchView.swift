import SwiftUI
struct ResearchState: Decodable {
  var enabled: Bool; var topic: String; var conversationId: String; var dailyTarget: Int; var maxPasses: Int
  var passes: Int; var tokens: Int; var pauseReason: String?
}
struct ResearchView: View {
  var load: () async throws -> Data
  var save: ([String:Any]) async throws -> Data
  var conversations: [Conversation]
  @Environment(\.dismiss) private var dismiss
  @State private var state: ResearchState?
  @State private var enabled=false
  @State private var topic=""
  @State private var conversation=""
  @State private var target="1000000000"
  @State private var passes=24
  @State private var busy=false
  @State private var error: String?
  var body: some View {
    ScrollView { VStack(alignment:.leading,spacing:18) {
      HStack { Label("Auto-research",systemImage:"sparkle.magnifyingglass").font(.title2.bold());Spacer();Button("Done"){dismiss()} }
      if let state {
        HStack { metric("Tokens today",state.tokens.formatted());Spacer();metric("Passes",state.passes.formatted()) }.padding(18).background(.thinMaterial,in:RoundedRectangle(cornerRadius:20))
      }
      Toggle("Run when the workspace is idle",isOn:$enabled)
      TextField("Research topic",text:$topic,axis:.vertical).lineLimit(2...5).textFieldStyle(.plain).padding(14).background(.thinMaterial,in:RoundedRectangle(cornerRadius:16))
      Picker("Conversation",selection:$conversation) {Text("Choose a research conversation").tag("");ForEach(conversations.filter{$0.archived != true}) {Text($0.title).tag($0.id)} }
      HStack {Text("Daily token target");Spacer();TextField("Tokens",text:$target).multilineTextAlignment(.trailing).frame(maxWidth:180) }
      Stepper("Up to \(passes) passes per day",value:$passes,in:1...1000)
      Text("Local models only · UTC day · Reported input + output").font(.caption).foregroundStyle(.secondary)
      if let count=Int(target),count>=1000000000 {Text("1B/day requires 11,574 tokens/s continuously. This is a target, not a throughput guarantee.").font(.caption).foregroundStyle(.secondary) }
      if let reason=state?.pauseReason {Text(reason).font(.callout).foregroundStyle(.secondary)}
      if let error {Text(error).font(.caption).foregroundStyle(.red).textSelection(.enabled)}
      HStack {Button("Refresh"){Task{await reload()}};Spacer();if busy{ProgressView().controlSize(.small)};Button("Save"){Task{await apply()}}.buttonStyle(.borderedProminent)}.disabled(busy)
    }.padding(24) }.frame(minWidth:300,idealWidth:520,minHeight:480).task{await reload()}
  }
  private func metric(_ name:String,_ value:String)->some View {VStack(alignment:.leading,spacing:5){Text(name).font(.caption).foregroundStyle(.secondary);Text(value).font(.title3.bold()).monospacedDigit()}}
  private func assign(_ data:Data)throws {let s=try JSONDecoder().decode(ResearchState.self,from:data);state=s;enabled=s.enabled;topic=s.topic;conversation=s.conversationId;target=String(s.dailyTarget);passes=s.maxPasses}
  private func reload()async {busy=true;defer{busy=false};do{try assign(await load());error=nil}catch{self.error=error.localizedDescription}}
  private func apply()async {guard let tokens=Int(target) else {error="Enter a whole token count.";return};busy=true;defer{busy=false};do{try assign(await save(["enabled":enabled,"topic":topic,"conversationId":conversation,"dailyTarget":tokens,"maxPasses":passes]));error=nil}catch{self.error=error.localizedDescription}}
}
