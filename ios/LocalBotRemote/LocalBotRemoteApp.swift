import SwiftUI
import SafariServices
import PhotosUI
import UniformTypeIdentifiers

@main struct LocalBotRemoteApp: App {
  @StateObject private var store = RemoteStore()
  var body: some Scene { WindowGroup { RemoteRoot().environmentObject(store) } }
}
struct RemoteRoot: View {
  @EnvironmentObject private var store: RemoteStore
  @Environment(\.scenePhase) private var phase
  var body: some View {
    Group { if store.paired { ConversationsView() } else { PairView() } }
      .task(id: "\(phase)-\(store.paired)") {
        guard phase == .active, store.paired else { return }
        while !Task.isCancelled {
          await store.refresh()
          do { try await Task.sleep(for: .seconds(store.connected ? 2 : 5)) } catch { return }
        }
      }
  }
}
struct PairView: View {
  @EnvironmentObject private var store: RemoteStore
  @State private var code = ""
  @State private var scanning = false
  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(spacing: 24) {
          LocalBotMascot(state: .greeting, color: .lavender).frame(width: 120,height: 120)
          Text("Your LocalBot. Everywhere.").font(.largeTitle.bold()).multilineTextAlignment(.center)
          Text("On your Mac, open Settings → iPhone Remote, enable Remote, and show the pairing code.")
            .foregroundStyle(.secondary).multilineTextAlignment(.center)
          Button { scanning = true } label: { Label("Connect LocalBot", systemImage: "qrcode.viewfinder").frame(maxWidth: .infinity).padding(8) }
            .buttonStyle(.borderedProminent).controlSize(.large).disabled(store.busy)
          DisclosureGroup("Paste a pairing code") {
            SecureField("Pairing code", text: $code).textInputAutocapitalization(.never).autocorrectionDisabled().padding(.vertical)
            Button("Connect") { Task { await store.pair(code); if store.paired { code = "" } } }.disabled(code.isEmpty || store.busy)
          }.padding().background(.thinMaterial, in: RoundedRectangle(cornerRadius: 22))
          if store.busy { ProgressView("Connecting securely…") }
          if let error = store.error { Text(error).font(.callout).foregroundStyle(.red) }
          Text("Encrypted · No shared Wi-Fi required").font(.caption).foregroundStyle(.secondary)
        }.padding(28).frame(maxWidth: 520).frame(maxWidth: .infinity)
      }.background(Color(uiColor: .systemBackground))
        .sheet(isPresented: $scanning) {
          NavigationStack { QRScanner { value in scanning = false; Task { await store.pair(value) } }
            .ignoresSafeArea(edges: .bottom).navigationTitle("Scan LocalBot code").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { scanning = false } } }
          }
        }
    }
  }
}
struct ConversationsView: View {
  @EnvironmentObject private var store: RemoteStore
  @State private var search = ""
  @State private var newChat = false
  @State private var project: Project?
  @State private var collapsed: Set<String> = []
  @State private var profile = false
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  var conversations: [Conversation] { (store.snapshot?.conversations ?? []).filter { $0.archived != true && (search.isEmpty || $0.title.localizedCaseInsensitiveContains(search)) } }
  var body: some View {
    NavigationStack {
      List {
        if !store.connected { Section { Label(store.error ?? "Connecting to your Mac…", systemImage: "wifi.exclamationmark").font(.callout).foregroundStyle(.secondary) } }
        ForEach(store.snapshot?.projects ?? []) { project in
          Section {
            if !collapsed.contains(project.id) || !search.isEmpty {
              ForEach(conversations.filter { $0.projectId == project.id }) { row($0) }
            }
          } header: {
            HStack {
              Button { withAnimation(reduceMotion ? nil : .easeInOut(duration: 0.22)) { if collapsed.contains(project.id) { collapsed.remove(project.id) } else { collapsed.insert(project.id) } } } label: {
                Label(project.name, systemImage: collapsed.contains(project.id) ? "folder" : "folder.fill").frame(maxWidth: .infinity, alignment: .leading)
              }.buttonStyle(.plain).accessibilityValue(collapsed.contains(project.id) ? "Collapsed" : "Expanded")
              Button { self.project = project; newChat = true; store.selected = nil; store.messages = []; store.activity = [] } label: { Image(systemName: "square.and.pencil").foregroundStyle(.secondary).padding(8) }.accessibilityLabel("New chat in " + project.name)
            }.textCase(nil)
          }
        }
        Section("Recents") { ForEach(conversations.filter { $0.projectId == nil }) { row($0) } }
      }.searchable(text: $search).navigationTitle("LocalBot")
        .toolbar {
          ToolbarItem(placement: .topBarLeading) { Button { profile = true } label: { ProfileBadge(profile: store.snapshot?.profile ?? UserProfile()) }.accessibilityLabel("Profile and settings") }
          ToolbarItem(placement: .topBarTrailing) { Button { project = nil; newChat = true; store.selected = nil; store.messages = []; store.activity = [] } label: { Image(systemName: "square.and.pencil") }.accessibilityLabel("New conversation") }
        }
        .sheet(isPresented: $profile) { ProfileEditor(profile: store.snapshot?.profile ?? UserProfile(), loadUsage: { try await store.read("/usage") }, save: { try await store.saveProfile($0) }, settings: { store.disconnect() }) }
        .navigationDestination(isPresented: $newChat) { MobileChat(project: project) }
    }
  }
  private func row(_ conversation: Conversation) -> some View {
    Button { store.select(conversation.id); project = store.snapshot?.projects?.first { $0.id == conversation.projectId }; newChat = true } label: {
      HStack(spacing: 10) {
        if conversation.projectId != nil { HStack(spacing: -8) { ForEach(conversation.members.prefix(3), id: \.self) { id in
          LocalBotMascot(state: .success, color: palette(store.snapshot?.agents.first { $0.id == id }?.color)).frame(width: 25,height: 25)
        } }.frame(width: 60, alignment: .leading) }
        Text(conversation.title).lineLimit(1).foregroundStyle(Color.primary)
        Spacer(minLength: 0)
        if store.snapshot?.tasks.contains(where: { $0.conversationId == conversation.id && $0.active }) == true { ProgressView().controlSize(.small).accessibilityLabel("Working") }
      }.padding(.vertical, 3)
    }
  }
}
func palette(_ color: String?) -> LocalBotPalette {
  switch color { case "purple": return .lavender; case "pink": return .rose; case "green": return .mint; case "orange": return .peach; case "yellow": return .butter; default: return .sky }
}
struct MobileChat: View {
  @EnvironmentObject private var store: RemoteStore
  var project: Project?
  @State private var draft = ""
  @State private var activity = false
  @State private var workspace = false
  @State private var browser: URL?
  @State private var agent: String?
  @State private var followsOutput = true
  @State private var photo: PhotosPickerItem?
  @State private var pickPhoto = false
  @State private var pickFile = false
  @State private var attachments: [Artifact] = []
  @State private var uploading = false
  private var draftKey: String { "draft." + (store.selected ?? "new." + (project?.id ?? "recent")) }
  private var running: AgentTask? { store.snapshot?.tasks.first { $0.conversationId == store.selected && $0.active } }
  var body: some View {
    ScrollViewReader { proxy in
      ScrollView {
        LazyVStack(alignment: .leading, spacing: 20) {
          ForEach(store.messages) { message in messageRow(message) }
          if let run = store.snapshot?.activeRuns?.first(where: { $0.taskId == running?.id }) {
            HStack { LocalBotMascot(state: .thinking, color: palette(store.snapshot?.agents.first { $0.id == run.agentId }?.color)).frame(width: 32,height: 32); Text(run.phase?.capitalized ?? "Working…").foregroundStyle(.secondary) }
          }
          ForEach(store.snapshot?.approvals.filter { $0.status == "pending" && $0.taskId == running?.id } ?? []) { approval in
            VStack(alignment: .leading, spacing: 12) {
              Text(approval.summary).font(.callout)
              HStack { Button("Deny", role: .destructive) { Task { await store.action("/approvals", body:["id":approval.id,"allow":false]) } }; Spacer(); Button("Allow once") { Task { await store.action("/approvals", body:["id":approval.id,"allow":true]) } } }.buttonStyle(.bordered)
            }.padding().background(.thinMaterial, in: RoundedRectangle(cornerRadius: 20))
          }
          Color.clear.frame(height: 1).id("bottom").onAppear { followsOutput = true }.onDisappear { followsOutput = false }
        }.padding(16)
      }.defaultScrollAnchor(.bottom)
        .onChange(of: store.messages.last?.id) { _, _ in guard followsOutput else { return }; withAnimation(.easeOut(duration: 0.2)) { proxy.scrollTo("bottom",anchor: .bottom) } }
        .safeAreaInset(edge: .bottom) { composer }
        .navigationTitle(store.snapshot?.conversations.first { $0.id == store.selected }?.title ?? project?.name ?? "New conversation")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { ToolbarItemGroup(placement: .topBarTrailing) { if store.selected == nil { Menu { ForEach(store.snapshot?.agents ?? []) { item in Button(item.name) { agent = item.id } } } label: { Image(systemName: "person.2") }.accessibilityLabel("Choose bot") }; Button { activity = true } label: { Image(systemName: "waveform.path") }.accessibilityLabel("Activity"); Button { workspace = true } label: { Image(systemName: "rectangle.split.2x1") }.accessibilityLabel("Workspace").disabled(store.selected == nil) } }
        .task(id: store.selected) { if draft.isEmpty { draft = UserDefaults.standard.string(forKey: draftKey) ?? "" }; await store.refresh() }
        .onChange(of: draft) { _, value in UserDefaults.standard.set(value,forKey: draftKey) }
        .photosPicker(isPresented: $pickPhoto, selection: $photo, matching: .images)
        .onChange(of: photo) { _, item in Task { await addPhoto(item) } }
        .fileImporter(isPresented: $pickFile, allowedContentTypes: [.item]) { result in Task { await addFile(result) } }
        .sheet(isPresented: $activity) { ActivityView().environmentObject(store) }
        .sheet(isPresented: $workspace) { MobileWorkspace(project: project).environmentObject(store) }
        .sheet(item: Binding(get: { browser.map(BrowserLink.init) },set: { browser = $0?.url })) { link in MobileBrowser(url: link.url).ignoresSafeArea() }
        .environment(\.openURL, OpenURLAction { url in guard ["https","http"].contains(url.scheme ?? "") else { return .discarded }; browser = url; return .handled })
    }
  }
  private func addPhoto(_ item: PhotosPickerItem?) async {
    guard let item else { return }
    uploading = true; defer { uploading = false; photo = nil }
    do {
      guard let data = try await item.loadTransferable(type: Data.self), let image = UIImage(data: data) else { return }
      let scale = min(1, 1600 / max(1, max(image.size.width, image.size.height)))
      let size = CGSize(width: image.size.width * scale, height: image.size.height * scale)
      let format = UIGraphicsImageRendererFormat(); format.scale = 1
      let resized = UIGraphicsImageRenderer(size: size, format: format).image { _ in image.draw(in: CGRect(origin: .zero, size: size)) }
      guard let jpeg = resized.jpegData(compressionQuality: 0.8) else { return }
      attachments.append(try await store.upload(jpeg, name: "Photo.jpg"))
    } catch { store.error = error.localizedDescription }
  }
  private func addFile(_ result: Result<URL, Error>) async {
    uploading = true; defer { uploading = false }
    do {
      let url = try result.get(); let access = url.startAccessingSecurityScopedResource()
      defer { if access { url.stopAccessingSecurityScopedResource() } }
      let size = try url.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
      guard size <= 2_000_000 else { throw RemoteError("Choose a file smaller than 2 MB.") }
      attachments.append(try await store.upload(Data(contentsOf: url), name: url.lastPathComponent))
    } catch { store.error = error.localizedDescription }
  }
  private var composer: some View {
    VStack(spacing: 8) {
      if uploading { ProgressView("Uploading…") }
      if !attachments.isEmpty { ScrollView(.horizontal) { HStack { ForEach(attachments) { file in Button { attachments.removeAll { $0.id == file.id } } label: { Label(file.name, systemImage: "xmark.circle").font(.caption).padding(8) }.buttonStyle(.bordered) } } } }
      if let error = store.error { Text(error).font(.caption).foregroundStyle(.red).lineLimit(3) }
      HStack(alignment: .bottom, spacing: 10) {
        Menu {
          Button("Photo library", systemImage: "photo") { pickPhoto = true }
          Button("Choose file", systemImage: "doc") { pickFile = true }
        } label: { Image(systemName: "plus").font(.title3).frame(width: 30, height: 40) }.disabled(uploading || attachments.count >= 4).accessibilityLabel("Add attachment")
        TextField("Message", text: $draft, axis: .vertical).lineLimit(1...6).padding(.vertical, 8)
        Button { if let running { Task { await store.action("/cancel",body:["taskId":running.id]) } } else { let text = draft; let key = draftKey; Task { if await store.send(text,project:project?.id,agent:agent,attachments:attachments) { UserDefaults.standard.removeObject(forKey: key); draft = ""; attachments = [] } } } } label: { Image(systemName: running == nil ? "arrow.up.circle.fill" : "stop.circle.fill").font(.system(size: 32)).foregroundStyle(running == nil ? Color.accentColor : .orange) }
          .disabled(store.busy || uploading || (running == nil && draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && attachments.isEmpty)).accessibilityLabel(running == nil ? "Send message" : "Stop task")
      }.padding(.horizontal, 14).padding(.vertical, 5).modifier(NativeGlass())
    }.padding(.horizontal, 14).padding(.vertical, 8)
  }
  private func messageRow(_ message: ChatMessage) -> some View {
    let user = message.role == "user"
    let bot = store.snapshot?.agents.first { $0.id == message.agentId }
    let events = store.activity.filter { $0.runId == message.runId }
    return HStack(alignment: .top, spacing: 8) {
      if user { Spacer(minLength: 32) } else { LocalBotMascot(state: .success,color: palette(bot?.color)).frame(width: 28,height: 28).accessibilityLabel(bot?.name ?? "LocalBot") }
      VStack(alignment: user ? .trailing : .leading,spacing: 5) {
        if !user, let bot { Text(bot.name).font(.caption).foregroundStyle(.secondary).padding(.leading, 8) }
        Text(.init(message.content)).textSelection(.enabled).padding(14)
          .foregroundStyle(user ? .white : .primary).background(user ? Color.accentColor : Color(uiColor: .secondarySystemBackground),in: RoundedRectangle(cornerRadius: 22))
        ForEach(message.attachments) { attachment in
          Label(attachment.name, systemImage: attachment.mime.hasPrefix("image/") ? "photo" : "doc").font(.caption).lineLimit(2).padding(8).background(.thinMaterial, in: RoundedRectangle(cornerRadius: 10))
        }
        if !user && !events.isEmpty {
          Button { activity = true } label: { Label(events.last?.name.replacingOccurrences(of: "_",with: " ").capitalized ?? "Activity",systemImage: "waveform.path").font(.caption).lineLimit(1).padding(10).frame(maxWidth: .infinity) }.buttonStyle(.plain).background(.thinMaterial,in: RoundedRectangle(cornerRadius: 14)).padding(.horizontal, 12)
        }
        if !user { Button { UIPasteboard.general.string = message.content } label: { Image(systemName: "doc.on.doc").font(.caption).padding(6) }.foregroundStyle(.secondary).accessibilityLabel("Copy response") }
      }
      if !user { Spacer(minLength: 12) }
    }
  }
}
struct ActivityView: View {
  @EnvironmentObject private var store: RemoteStore
  @Environment(\.dismiss) private var dismiss
  var body: some View {
    NavigationStack {
      ScrollViewReader { proxy in
        ScrollView { LazyVStack(alignment: .leading, spacing: 18) { ForEach(store.activity) { event in
          VStack(alignment: .leading, spacing: 6) {
            Label(event.name.replacingOccurrences(of: "_",with: " "),systemImage: event.status == "running" ? "circle.dotted" : "checkmark").font(.callout.bold())
            if let output = event.output { Text(String(output.suffix(12000))).font(.system(.caption, design: .monospaced)).textSelection(.enabled) }
            Text(event.status).font(.caption).foregroundStyle(.secondary)
          }.id(event.id)
        } }.padding() }.defaultScrollAnchor(.bottom)
          .onChange(of: store.activity.last?.output) { _, _ in if let id = store.activity.last?.id { proxy.scrollTo(id,anchor: .bottom) } }
      }.navigationTitle("Activity").navigationBarTitleDisplayMode(.inline).toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
    }.presentationDetents([.medium,.large])
  }
}
struct BrowserLink: Identifiable { var url: URL; var id: String { url.absoluteString } }
struct MobileBrowser: UIViewControllerRepresentable {
  let url: URL
  func makeUIViewController(context: Context) -> SFSafariViewController { SFSafariViewController(url: url) }
  func updateUIViewController(_ uiViewController: SFSafariViewController, context: Context) {}
}
