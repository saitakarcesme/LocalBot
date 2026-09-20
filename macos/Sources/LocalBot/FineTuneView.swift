import SwiftUI
import Charts
struct FineTuneJob: Decodable, Identifiable {
  var id: String; var topic: String; var model: String; var status: String; var stage: String
  var conversationId: String; var reason: String?; var budgetPercent: Int; var overnight: Bool
  var checkpoint: String?; var trainingStep: Int?; var loss: Double?
}
private struct FineTuneList: Decodable {var jobs: [FineTuneJob]}
private struct FineTuneModel: Decodable, Identifiable {var providerId:String;var provider:String;var model:String;var id:String {providerId+"|"+model}}
private struct FineTuneCatalog: Decodable {var options:[FineTuneModel]}
private struct FineTuneSource: Decodable, Identifiable {var id:String;var title:String;var url:String;var license:String;var evidence:String}
private struct FineTuneExample: Decodable, Identifiable {var id:String;var prompt:String;var answer:String;var split:String;var verification:String}
private struct FineTuneDetail: Decodable {var job:FineTuneJob;var sources:[FineTuneSource];var examples:[FineTuneExample]}
struct FineTuneDashboard: View {
  var request: (String) async throws -> Data
  var write: (String,[String:Any]) async throws -> Data
  @Environment(\.scenePhase) private var phase
  @Environment(\.dismiss) private var dismiss
  @State private var jobs:[FineTuneJob]=[]
  @State private var creating=false
  @State private var selected:FineTuneJob?
  @State private var error:String?
  var body:some View {
    ScrollView {
      LazyVStack(alignment:.leading,spacing:20) {
        HStack {Text("Fine Tune").font(.largeTitle.bold());Spacer();Button {creating=true} label:{Label("New",systemImage:"plus")}.buttonStyle(.borderedProminent)}
        if jobs.isEmpty {ContentUnavailableView("Build a better model",systemImage:"brain",description:Text("Choose a model and a topic to begin."))}
        ForEach(jobs) {job in
          VStack(alignment:.leading,spacing:12) {
            Button {selected=job} label:{VStack(alignment:.leading,spacing:6){Text(job.topic).font(.headline).multilineTextAlignment(.leading);Text(job.model).font(.caption).foregroundStyle(.secondary)}}.buttonStyle(.plain)
            HStack {Label(job.stage.capitalized,systemImage:icon(job.stage));Spacer();Text(job.status.capitalized)}.font(.caption).foregroundStyle(.secondary)
            if let reason=job.reason {Text(reason).font(.callout).foregroundStyle(.secondary)}
            if let step=job.trainingStep {Text("Step \(step)").monospacedDigit()}
            HStack {
              if ["paused","waiting"].contains(job.status) {Button("Resume"){Task{await control(job,"resume")}}}
              if ["queued","running"].contains(job.status) {Button("Pause"){Task{await control(job,"pause")}}}
              if !["completed","cancelled"].contains(job.status) {Button("Stop",role:.destructive){Task{await control(job,"cancel")}}}
              Spacer();Button("Details"){selected=job}
            }.buttonStyle(.bordered)
          }.padding(18).modifier(FineTuneGlass())
        }
        FineTuneTelemetry(request:request)
        if let error {Text(error).foregroundStyle(.red).textSelection(.enabled)}
      }.padding(20).frame(maxWidth:850).frame(maxWidth:.infinity)
    }.frame(idealWidth:760,idealHeight:650)
    .toolbar {ToolbarItem {Button("Done"){dismiss()}}}
    .sheet(isPresented:$creating,onDismiss:{Task{await refresh()}}) {FineTuneCreate(request:request,write:write)}
    .sheet(item:$selected) {job in FineTuneDetails(id:job.id,request:request)}
    .task(id:phase){guard phase == .active else{return};while !Task.isCancelled {await refresh();do{try await Task.sleep(for:.seconds(3))}catch{return}}}
  }
  private func icon(_ stage:String)->String {switch stage {case "sources":return "books.vertical";case "dataset":return "tray.full";case "training":return "cpu";default:return "checkmark.seal"}}
  private func refresh()async {do{jobs=try JSONDecoder().decode(FineTuneList.self,from:await request("/fine-tune")).jobs;error=nil}catch{self.error=error.localizedDescription}}
  private func control(_ job:FineTuneJob,_ action:String)async {do{_ = try await write("/fine-tune/control",["id":job.id,"action":action]);await refresh()}catch{self.error=error.localizedDescription}}
}
private struct FineTuneCreate:View {
  var request:(String)async throws->Data
  var write:(String,[String:Any])async throws->Data
  @Environment(\.dismiss) private var dismiss
  @State private var models:[FineTuneModel]=[]
  @State private var selected=""
  @State private var topic=""
  @State private var gpus:[GPUReading]=[]
  @State private var gpuIds=Set<String>()
  @State private var budget=100.0
  @State private var overnight=false
  @State private var busy=false
  @State private var error:String?
  var body:some View {
    ScrollView {VStack(alignment:.leading,spacing:22){
      HStack {Text("New Fine Tune").font(.title2.bold());Spacer();Button("Cancel"){dismiss()}}
      Picker("Model",selection:$selected){Text("Choose a local model").tag("");ForEach(models){Text($0.model).tag($0.id)}}.pickerStyle(.menu)
      TextField("What should the model learn?",text:$topic,axis:.vertical).lineLimit(4...8).textFieldStyle(.plain).padding(16).modifier(FineTuneGlass())
      DisclosureGroup("Advanced") {VStack(alignment:.leading,spacing:16){
        ForEach(gpus){gpu in Toggle("\(gpu.name) · \(gpu.id.suffix(8))",isOn:Binding(get:{gpuIds.contains(gpu.id)},set:{if $0{gpuIds.insert(gpu.id)}else{gpuIds.remove(gpu.id)}}))}
        if gpus.isEmpty {Text("GPU selection becomes available on the model PC.").font(.caption).foregroundStyle(.secondary)}
        HStack{Text("Training work budget");Spacer();Text("\(Int(budget))%").monospacedDigit()}
        Slider(value:$budget,in:10...100,step:10)
        Text("Controls training duty cycle, not instantaneous GPU utilization. Inference keeps its current GPU configuration.").font(.caption).foregroundStyle(.secondary)
        Toggle("Overnight · 22:00–07:00",isOn:$overnight)
        Text("Uses the workspace computer’s time zone.").font(.caption).foregroundStyle(.secondary)
      }.padding(.top,12)}
      if let error {Text(error).foregroundStyle(.red)}
      HStack{Spacer();if busy{ProgressView()};Button("Start"){Task{await start()}}.buttonStyle(.borderedProminent).disabled(busy||selected.isEmpty||topic.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty)}
    }.padding(24)}.frame(idealWidth:520,idealHeight:520).task {do{models=try JSONDecoder().decode(FineTuneCatalog.self,from:await request("/fine-tune/models")).options;selected=models.first?.id ?? "";gpus=try JSONDecoder().decode(GPUEnvelope.self,from:await request("/telemetry/gpus")).gpus;gpuIds=Set(gpus.map(\.id))}catch{self.error=error.localizedDescription}}
  }
  private func start()async {guard let m=models.first(where:{$0.id==selected})else{return};busy=true;defer{busy=false};do{_ = try await write("/fine-tune/create",["providerId":m.providerId,"model":m.model,"topic":topic,"gpuIds":Array(gpuIds).sorted(),"budgetPercent":Int(budget),"overnight":overnight]);dismiss()}catch{self.error=error.localizedDescription}}
}
private struct FineTuneDetails:View {
  var id:String;var request:(String)async throws->Data
  @Environment(\.dismiss) private var dismiss
  @Environment(\.scenePhase) private var phase
  @State private var detail:FineTuneDetail?
  @State private var messages:[ChatMessage]=[]
  @State private var error:String?
  var body:some View {
    ScrollView {LazyVStack(alignment:.leading,spacing:18){
      HStack{Text("Fine Tune").font(.title2.bold());Spacer();Button("Done"){dismiss()}}
      if let d=detail {
        Text(d.job.topic).font(.headline);Text(d.job.model).font(.caption).foregroundStyle(.secondary)
        if let reason=d.job.reason {Text(reason).foregroundStyle(.secondary)}
        if let checkpoint=d.job.checkpoint {Label(checkpoint,systemImage:"externaldrive.badge.checkmark").font(.caption).textSelection(.enabled)}
        Text("Sources · \(d.sources.count)").font(.headline)
        ForEach(d.sources){s in VStack(alignment:.leading,spacing:6){if let url=URL(string:s.url){Link(s.title,destination:url)};Text(s.license).font(.caption);Text(s.evidence).font(.caption).foregroundStyle(.secondary)}}
        Text("Dataset preview · \(d.examples.count)").font(.headline)
        ForEach(d.examples){e in VStack(alignment:.leading,spacing:8){Text(e.split.uppercased()).font(.caption).foregroundStyle(.secondary);Text(e.prompt).bold();Text(e.answer);Text(e.verification).font(.caption).foregroundStyle(.secondary)}.padding(14).modifier(FineTuneGlass())}
        ForEach(messages.filter{$0.role == "assistant"}){m in ResearchDocument(content:m.content);ShareLink("Export report",item:m.content);Divider()}
      }
      if let error{Text(error).foregroundStyle(.red)}
    }.padding(24).frame(maxWidth:850).frame(maxWidth:.infinity)}.frame(idealWidth:760,idealHeight:650)
    .task(id:phase){guard phase == .active else{return};while !Task.isCancelled {do{let d=try JSONDecoder().decode(FineTuneDetail.self,from:await request("/fine-tune/detail?id=\(id)"));detail=d;messages=try JSONDecoder().decode([ChatMessage].self,from:await request("/messages?conversationId=\(d.job.conversationId)"));error=nil}catch{self.error=error.localizedDescription};do{try await Task.sleep(for:.seconds(3))}catch{return}}}
  }
}
private struct FineTuneTelemetry:View {
  var request:(String)async throws->Data
  @Environment(\.scenePhase) private var phase
  @State private var sample:GPUEnvelope?
  @State private var points:[String:[GPUPoint]]=[:]
  @State private var error:String?
  var body:some View {
    VStack(alignment:.leading,spacing:16){
      if let s=sample {ForEach(s.gpus){gpu in VStack(alignment:.leading,spacing:12){
        Text("\(gpu.name) · \(gpu.id.suffix(8))").font(.headline)
        Text("\(gpu.utilization.map{String(format:"%.0f%%",$0)} ?? "—") · \(gpu.temperature.map{String(format:"%.0f°C",$0)} ?? "—") · \(gpu.memoryUsedMB.map{String(format:"%.1f GB",$0/1024)} ?? "—")").monospacedDigit().font(.subheadline)
        Chart(points[gpu.id] ?? []){p in LineMark(x:.value("Time",p.time),y:.value("Value",p.value)).foregroundStyle(by:.value("Metric",p.metric))}.chartYScale(domain:0...110).frame(height:140)
      }.padding(16).modifier(FineTuneGlass())}}
      if let error{Text(error).font(.caption).foregroundStyle(.secondary)}
    }.task(id:phase){guard phase == .active else{return};while !Task.isCancelled{do{
      let s=try JSONDecoder().decode(GPUEnvelope.self,from:await request("/telemetry/gpus"));if s.sampledAt != sample?.sampledAt {for gpu in s.gpus {var h=points[gpu.id] ?? [];if let u=gpu.utilization{h.append(GPUPoint(time:Date(),value:u,metric:"Utilization %"))};if let t=gpu.temperature{h.append(GPUPoint(time:Date(),value:t,metric:"Temperature °C"))};points[gpu.id]=Array(h.filter{$0.time>Date().addingTimeInterval(-300)}.suffix(202))}};sample=s;error=s.available ? nil:s.error
    }catch{self.error=error.localizedDescription};do{try await Task.sleep(for:.seconds(3))}catch{return}}}
  }
}
private struct FineTuneGlass:ViewModifier {
  @Environment(\.accessibilityReduceTransparency) private var reduced
  @ViewBuilder func body(content:Content)->some View {if reduced{content.background(.background,in:RoundedRectangle(cornerRadius:22))}else if #available(iOS 26,macOS 26,*){content.glassEffect(.regular,in:RoundedRectangle(cornerRadius:22))}else{content.background(.regularMaterial,in:RoundedRectangle(cornerRadius:22))}}
}
