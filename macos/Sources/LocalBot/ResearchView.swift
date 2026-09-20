import SwiftUI
import Charts
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
    }.padding(24) }.frame(idealWidth:520).task{await reload()}
  }
  private func metric(_ name:String,_ value:String)->some View {VStack(alignment:.leading,spacing:5){Text(name).font(.caption).foregroundStyle(.secondary);Text(value).font(.title3.bold()).monospacedDigit()}}
  private func assign(_ data:Data)throws {let s=try JSONDecoder().decode(ResearchState.self,from:data);state=s;enabled=s.enabled;topic=s.topic;conversation=s.conversationId;target=String(s.dailyTarget);passes=s.maxPasses}
  private func reload()async {busy=true;defer{busy=false};do{try assign(await load());error=nil}catch{self.error=error.localizedDescription}}
  private func apply()async {guard let tokens=Int(target) else {error="Enter a whole token count.";return};busy=true;defer{busy=false};do{try assign(await save(["enabled":enabled,"topic":topic,"conversationId":conversation,"dailyTarget":tokens,"maxPasses":passes]));error=nil}catch{self.error=error.localizedDescription}}
}

struct GPUReading: Decodable, Identifiable {
  var id: String; var name: String; var utilization: Double?; var temperature: Double?
  var memoryUsedMB: Double?; var memoryTotalMB: Double?; var powerWatts: Double?
}
struct GPUEnvelope: Decodable {var sampledAt: String; var available: Bool; var gpus: [GPUReading]; var error: String?}
struct GPUPoint: Identifiable {var id = UUID(); var time: Date; var value: Double; var metric: String}
struct ResearchDashboard: View {
  var request: (String) async throws -> Data
  var save: ([String: Any]) async throws -> Data
  var conversations: [Conversation]
  @Environment(\.scenePhase) private var phase
  @State private var settings = false
  @State private var state: ResearchState?
  @State private var telemetry: GPUEnvelope?
  @State private var points: [String: [GPUPoint]] = [:]
  @State private var messages: [ChatMessage] = []
  @State private var error: String?
  @State private var lastSample = ""
  var body: some View {
    ScrollView {
      LazyVStack(alignment: .leading, spacing: 24) {
        if let state {
          HStack { Label(state.enabled ? "Researching" : "Paused", systemImage: state.enabled ? "sparkle.magnifyingglass" : "pause.circle"); Spacer(); Text("\(state.tokens.formatted()) tokens").monospacedDigit() }.font(.subheadline)
          Text(state.topic).font(.headline).textSelection(.enabled)
          if let reason = state.pauseReason { Text(reason).foregroundStyle(.secondary) }
        }
        if let telemetry {
          ForEach(telemetry.gpus) { gpu in gpuCard(gpu) }
          if !telemetry.available { Label(telemetry.error ?? "Telemetry unavailable",systemImage: "chart.xyaxis.line").foregroundStyle(.secondary) }
          Text("Updated \(telemetry.sampledAt)").font(.caption2).foregroundStyle(.secondary)
        }
        if let error {Text(error).font(.callout).foregroundStyle(.secondary)}
        ForEach(messages) { message in
          VStack(alignment: .leading, spacing: 10) {
            Label(message.role == "user" ? "Research brief" : "Findings",systemImage: message.role == "user" ? "text.alignleft" : "sparkles").font(.caption).foregroundStyle(.secondary)
            Text(.init(message.content)).textSelection(.enabled).frame(maxWidth: .infinity,alignment: .leading)
            ShareLink(item: message.content) {Image(systemName: "square.and.arrow.up")}.accessibilityLabel("Share research output")
            Divider()
          }
        }
      }.padding(20).frame(maxWidth: 850).frame(maxWidth: .infinity)
    }.navigationTitle("Research")
      .toolbar {ToolbarItem {Button {settings=true} label: {Image(systemName:"slider.horizontal.3")}.accessibilityLabel("Research settings")}}
      .sheet(isPresented: $settings) {ResearchView(load: {try await request("/research")},save:save,conversations:conversations)}
      .task(id: phase) {
        guard phase == .active else {return}
        while !Task.isCancelled {await refresh();do{try await Task.sleep(for:.seconds(3))}catch{return}}
      }
  }
  private func gpuCard(_ gpu: GPUReading) -> some View {
    VStack(alignment:.leading,spacing:12) {
      Text(gpu.name).font(.headline)
      ViewThatFits(in:.horizontal) {
        HStack {stats(gpu)}
        VStack(alignment:.leading) {stats(gpu)}
      }
      Chart(points[gpu.id] ?? []) { point in
        LineMark(x:.value("Time",point.time),y:.value("Value",point.value)).foregroundStyle(by:.value("Metric",point.metric)).interpolationMethod(.linear)
      }.chartYScale(domain:0...110).chartForegroundStyleScale(["Utilization %":Color.accentColor,"Temperature °C":Color.orange]).frame(height:150)
        .accessibilityLabel("GPU utilization and temperature over the last five minutes")
    }.padding(16).background(.thinMaterial,in:RoundedRectangle(cornerRadius:22))
  }
  @ViewBuilder private func stats(_ gpu: GPUReading)->some View {
    Text(gpu.utilization.map{String(format:"%.0f%%",$0)} ?? "—")
    Text(gpu.temperature.map{String(format:"%.0f°C",$0)} ?? "—")
    Text(gpu.memoryUsedMB.map{String(format:"%.1f GB VRAM",$0/1024)} ?? "—")
    Text(gpu.powerWatts.map{String(format:"%.0f W",$0)} ?? "—")
  }
  private func refresh() async {
    do {
      let next = try JSONDecoder().decode(ResearchState.self,from:await request("/research"));state=next
      let sample = try JSONDecoder().decode(GPUEnvelope.self,from:await request("/telemetry/gpus"));telemetry=sample
      if sample.sampledAt != lastSample {
        lastSample=sample.sampledAt
        let time=ISO8601DateFormatter().date(from:sample.sampledAt) ?? Date()
        for gpu in sample.gpus {
          var history=points[gpu.id] ?? []
          if let v=gpu.utilization {history.append(GPUPoint(time:time,value:v,metric:"Utilization %"))}
          if let v=gpu.temperature {history.append(GPUPoint(time:time,value:v,metric:"Temperature °C"))}
          points[gpu.id]=Array(history.filter{$0.time > Date().addingTimeInterval(-300)}.suffix(202))
        }
      }
      if !next.conversationId.isEmpty {messages=try JSONDecoder().decode([ChatMessage].self,from:await request("/messages?conversationId=\(next.conversationId)"))}
      error=nil
    } catch {self.error=error.localizedDescription}
  }
}
