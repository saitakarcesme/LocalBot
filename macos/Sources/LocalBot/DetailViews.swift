import AppKit
import ImageIO
import SwiftUI
import UserNotifications

struct ApprovalCard: View {
  @EnvironmentObject var model: AppModel
  var approval: Approval
  @State var expanded = false
  var body: some View {
    VStack(alignment: .leading, spacing: 9) {
      HStack {
        Image(systemName: "hand.raised.fill").foregroundStyle(.orange)
        Text("Approval needed").font(.headline)
        Spacer()
        Button(expanded ? "Hide details" : "Review") { expanded.toggle() }
      }
      if expanded {
        ScrollView {
          Text(approval.summary).font(.system(size: 11, design: .monospaced)).textSelection(
            .enabled
          ).frame(maxWidth: .infinity, alignment: .leading)
        }.frame(height: 220)
      } else {
        Text(approval.summary).font(.system(size: 11, design: .monospaced)).lineLimit(3)
          .textSelection(.enabled)
      }
      HStack {
        Text("Always allow remembers this exact action for this agent and workspace.").font(.caption).foregroundStyle(.secondary)
        Spacer()
        Button("Deny") { decide(false) }
        Button("Always allow") { Task { await model.post("/approvals", ["id": approval.id, "allow": true, "always": true]) } }
        Button("Allow once") { decide(true) }.buttonStyle(.borderedProminent)
      }
    }.padding(14).background(.orange.opacity(0.08), in: RoundedRectangle(cornerRadius: 12)).overlay(
      RoundedRectangle(cornerRadius: 12).stroke(.orange.opacity(0.25))
    ).padding(.horizontal, 20).padding(.vertical, 5)
  }
  func decide(_ allow: Bool) {
    Task { await model.post("/approvals", ["id": approval.id, "allow": allow]) }
  }
}
struct ActivityView: View {
  @EnvironmentObject var model: AppModel
  var footer: String {
    model.currentTasks.prefix(8).reversed().map { "# task [" + $0.status + "] " + $0.prompt + ($0.error.map { "\n" + $0 } ?? "") }.joined(separator: "\n")
  }
  var body: some View {
    VStack(spacing: 0) {
      HStack {
        Text("Activity").font(.system(size: 12, design: .monospaced))
        Spacer()
        if let task = model.activeTask {
          Button("Stop") { Task { await model.post("/cancel", ["taskId": task.id]) } }.buttonStyle(.plain)
        }
        Button { model.showActivity = false } label: { Image(systemName: "xmark") }.buttonStyle(.plain).help("Close Activity")
      }.padding(16)
      Divider()
      TerminalTranscript(actions: model.activity, footer: footer)
    }
  }
}
struct NewConversationView: View {
  @EnvironmentObject var model: AppModel
  @Environment(\.dismiss) var dismiss
  @State var title = ""
  @State var selected: Set<String> = []
  @State var projectId = ""
  @State var automatic = true
  var body: some View {
    VStack(alignment: .leading, spacing: 18) {
      HStack {
        Text("New Conversation").font(.title2.bold())
        Spacer()
        Button("Cancel") { dismiss() }.keyboardShortcut(.cancelAction)
      }
      TextField("Conversation name", text: $title).textFieldStyle(.roundedBorder)
      Picker("Project", selection: $projectId) {
        Text("Direct conversation").tag("")
        ForEach(model.projects) { p in Text(p.name).tag(p.id) }
      }
      if !projectId.isEmpty {
        Toggle("Choose agents automatically for each request", isOn: $automatic)
      }
      Text(!projectId.isEmpty && automatic ? "Agents join based on your request" : "Choose your contacts").font(.headline)
      ForEach(model.agents) { a in
        Toggle(
          isOn: Binding(
            get: { selected.contains(a.id) },
            set: { if $0 { selected.insert(a.id) } else { selected.remove(a.id) } })
        ) {
          HStack {
            Avatar(agent: a, size: 32)
            VStack(alignment: .leading) {
              Text(a.name)
              Text(a.role).font(.caption).foregroundStyle(.secondary)
            }
          }
        }.toggleStyle(.checkbox).disabled(!projectId.isEmpty && automatic)
      }
      HStack {
        Button("Create Agent…") {
          dismiss()
          model.editingAgent = Agent(
            id: UUID().uuidString, name: "New Agent", avatar: "person.fill", color: "blue",
            role: "Assistant", systemPrompt: "Help the user and verify your work.",
            providerId: model.providers.first?.id ?? "local", model: "",
            workspace: FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(
              "LocalBot Workspace"
            ).path,
            permissions: Permissions(filesystem: "read", terminal: false, git: false, web: false),
            autonomy: "ask", memory: "")
        }
        Spacer()
        Button("Create") {
          Task {
            let name =
              title.isEmpty
              ? (projectId.isEmpty ? model.agents.filter { selected.contains($0.id) }.map(\.name).joined(separator: ", ") : "New project conversation")
              : title
            guard await model.post(
              "/conversations",
              [
                "title": name,
                "members": model.agents.filter { selected.contains($0.id) }.map(\.id),
                "projectId": projectId.isEmpty ? NSNull() : projectId as Any,
                "automatic": !projectId.isEmpty && automatic,
              ]) else { return }
            model.selectedId = model.conversations.first?.id
            dismiss()
          }
        }.buttonStyle(.borderedProminent).disabled(selected.isEmpty && (projectId.isEmpty || !automatic)).keyboardShortcut(
          .defaultAction)
      }
    }.padding(24).frame(width: 430).onAppear {
      projectId = model.newConversationProjectId
      model.newConversationProjectId = ""
    }
  }
}
struct ConversationEditor: View {
  @EnvironmentObject var model: AppModel
  @Environment(\.dismiss) var dismiss
  var conversation: Conversation
  @State var title = ""
  @State var selected: Set<String> = []
  @State var automatic = false
  var body: some View {
    VStack(alignment: .leading, spacing: 16) {
      Text("Conversation Details").font(.title2.bold())
      TextField("Title", text: $title).textFieldStyle(.roundedBorder)
      if conversation.projectId != nil { Toggle("Choose agents automatically", isOn: $automatic) }
      ForEach(model.agents) { agent in
        Toggle(agent.name + " · " + agent.role, isOn: Binding(get: { selected.contains(agent.id) }, set: { if $0 { selected.insert(agent.id) } else { selected.remove(agent.id) } }))
      }
      HStack {
        Button("Cancel") { dismiss() }
        Spacer()
        Button("Save") {
          Task {
            await model.post("/conversations/update", ["id": conversation.id, "title": title, "members": model.agents.filter { selected.contains($0.id) }.map(\.id), "automatic": automatic])
            if model.error == nil { dismiss() }
          }
        }.buttonStyle(.borderedProminent)
      }
    }.padding(24).frame(width: 430).onAppear {
      title = conversation.title; selected = Set(conversation.members); automatic = conversation.automatic == 1
    }
  }
}
struct ProjectEditor: View {
  @EnvironmentObject var model: AppModel
  @Environment(\.dismiss) var dismiss
  let project: Project
  @State var name = ""
  @State var workspace = ""
  @State var memory = ""
  @State var saving = false
  @State var error: String?
  var body: some View {
    VStack(alignment: .leading, spacing: 16) {
      Text("Project Details").font(.title2.bold())
      TextField("Project name", text: $name).textFieldStyle(.roundedBorder)
      Text("Workspace").font(.headline)
      HStack {
        Text(workspace).lineLimit(3).textSelection(.enabled)
        Spacer()
        Button("Choose…") {
          let panel = NSOpenPanel()
          panel.canChooseDirectories = true; panel.canChooseFiles = false
          if panel.runModal() == .OK { workspace = panel.url?.path ?? workspace }
        }
      }
      Text("Future work uses this folder. Existing files and attachments stay where they are.")
        .font(.caption).foregroundStyle(.secondary)
      Text("Shared project notes").font(.headline)
      TextEditor(text: $memory).font(.body).frame(height: 160)
        .overlay(RoundedRectangle(cornerRadius: 6).stroke(.quaternary))
        .accessibilityLabel("Shared project notes")
      Text("Shared with agents in this project. Do not include passwords or API keys.")
        .font(.caption).foregroundStyle(.secondary)
      if let error { Text(error).foregroundStyle(.red).font(.callout) }
      HStack {
        Button("Cancel") { dismiss() }.keyboardShortcut(.cancelAction)
        Spacer()
        Button(saving ? "Saving…" : "Save") {
          saving = true
          Task {
            let saved = await model.post("/projects/update", ["id": project.id, "name": name, "workspace": workspace, "memory": memory,
              "expected": ["name": project.name, "workspace": project.workspace, "memory": project.memory]])
            saving = false
            if saved { dismiss() } else { error = model.error; model.error = nil }
          }
        }.buttonStyle(.borderedProminent).keyboardShortcut(.defaultAction)
          .disabled(name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || name.count > 80 || memory.count > 12000)
      }
    }.padding(24).frame(width: 500).disabled(saving)
      .onAppear { name = project.name; workspace = project.workspace; memory = project.memory }
  }
}
struct NewProjectView: View {
  @EnvironmentObject var model: AppModel
  @Environment(\.dismiss) var dismiss
  @State var name = ""
  @State var workspace = ""
  @State private var choosingFolder = false
  @State private var creating = false
  var body: some View {
    VStack(alignment: .leading, spacing: 18) {
      Text("New Project").font(.title2.bold())
      TextField("Project name", text: $name).textFieldStyle(.roundedBorder)
      Text("Conversations share this folder and project memory. Agents join according to the work you request.")
        .font(.callout).foregroundStyle(.secondary)
      HStack {
        Text(workspace.isEmpty ? "Documents/LocalBot/" + (name.isEmpty ? "Project name" : name) : workspace).lineLimit(2)
        Spacer()
        Button("Choose…") {
          choosingFolder = true
        }
      }
      HStack {
        Button("Cancel") { dismiss() }
        Spacer()
        Button("Create Project") {
          creating = true
          Task {
            defer { creating = false }
            await model.post("/projects", ["name": name, "workspace": workspace])
            if model.error == nil {
              let projectId = model.projects.first?.id
              dismiss()
              await model.newConversation(projectId: projectId)
            }
          }
        }.buttonStyle(.borderedProminent).disabled(name.trimmingCharacters(in: .whitespaces).isEmpty || creating)
      }
    }.padding(24).frame(width: 460)
      .sheet(isPresented: $choosingFolder) { AttachmentPicker(foldersOnly: true) { urls in workspace = urls.first?.path ?? "" } }
  }
}
struct AgentEditor: View {
  @EnvironmentObject var model: AppModel
  @Environment(\.dismiss) var dismiss
  @State var agent: Agent
  private let original: Agent
  init(agent: Agent) {
    _agent = State(initialValue: agent)
    original = agent
  }
  var body: some View {
    VStack(spacing: 0) {
      HStack(spacing: 12) {
        Avatar(agent: agent, size: 52)
        VStack(alignment: .leading) {
          Text(agent.name).font(.title2.bold())
          Text("Contact Details").foregroundStyle(.secondary)
        }
        Spacer()
        Button("Cancel") { dismiss() }
        Button("Save") { Task { if await model.saveAgent(agent, expected: original) { dismiss() } } }
          .buttonStyle(.borderedProminent).keyboardShortcut(.defaultAction)
      }.padding(22)
      Divider()
      Form {
        Section("Identity") {
          TextField("Name", text: $agent.name)
          TextField("Role", text: $agent.role)
          Picker("Avatar", selection: $agent.avatar) {
            ForEach(
              [
                "person.fill", "hammer.fill", "sparkle.magnifyingglass", "checkmark.shield.fill",
                "testtube.2", "brain", "paintbrush.fill",
              ], id: \.self
            ) { Image(systemName: $0).tag($0) }
          }
          Picker("Color", selection: $agent.color) {
            ForEach(["blue", "purple", "green", "orange", "pink", "yellow"], id: \.self) {
              Text($0.capitalized).tag($0)
            }
          }
        }
        Section("Model") {
          Picker("Provider", selection: $agent.providerId) {
            ForEach(model.providers) { Text($0.name).tag($0.id) }
          }
          TextField("Model override (blank uses provider)", text: $agent.model)
        }
        Section("Workspace") {
          HStack {
            Text(agent.workspace).font(.caption).textSelection(.enabled)
            Spacer()
            Button("Choose…") {
              let panel = NSOpenPanel()
              panel.canChooseDirectories = true
              panel.canChooseFiles = false
              if panel.runModal() == .OK, let url = panel.url { agent.workspace = url.path }
            }
          }
        }
        Section("Tools & Permissions") {
          Picker("Filesystem", selection: $agent.permissions.filesystem) {
            Text("Off").tag("off")
            Text("Read only").tag("read")
            Text("Read & write").tag("write")
          }
          Toggle("Terminal & tests", isOn: $agent.permissions.terminal)
          Toggle("Git inspection", isOn: $agent.permissions.git)
          Toggle("Public web", isOn: $agent.permissions.web)
          Picker("Autonomy", selection: $agent.autonomy) {
            Text("Ask before changes").tag("ask")
            Text("Allow workspace edits").tag("trusted")
            Text("Full access — workspace").tag("full")
          }
          Button("Forget always-allowed actions") { Task { await model.post("/approvals/revoke", ["agentId": agent.id]) } }
          Stepper("Task step limit: \(agent.maxSteps ?? 24)", value: Binding(get: { agent.maxSteps ?? 24 }, set: { agent.maxSteps = $0 }), in: 1...256)
          Text("Each step is one model response, which may request several tools. Higher limits allow longer tasks and use more model capacity. Changes apply to the next task; permissions and cancellation still apply.").font(.caption).foregroundStyle(.secondary)
          Text(
            "Full access runs enabled tools without per-action approval. Disabled tools stay disabled. File tools and shell writes stay within the workspace; shell network access is blocked. Integrations still require approval."
          ).font(.caption).foregroundStyle(.secondary)
        }
        Section("System Prompt") {
          TextEditor(text: $agent.systemPrompt).font(.body).frame(minHeight: 90)
        }
        if !model.integrations.isEmpty {
          Section("MCP Integrations") {
            ForEach(model.integrations) { connection in
              Toggle(connection.name, isOn: Binding(get: { agent.integrations?.contains(connection.id) == true }, set: { enabled in
                var ids = agent.integrations ?? []
                ids.removeAll { $0 == connection.id }
                if enabled { ids.append(connection.id) }
                agent.integrations = ids
              }))
            }
            Text("Every integration tool call requires approval. External tools operate with the connected service's permissions.").font(.caption).foregroundStyle(.secondary)
          }
        }
        Section("Memory") {
          TextEditor(text: $agent.memory).font(.body).frame(minHeight: 70)
          Text("Durable notes used only by this contact.").font(.caption).foregroundStyle(
            .secondary)
        }
      }.formStyle(.grouped)
    }.frame(width: 550, height: 700)
  }
}
struct SettingsView: View {
  @EnvironmentObject var model: AppModel
  @Environment(\.dismiss) var dismiss
  @State var selection: String?
  @State var editing: Provider?
  @State var secret = ""
  @State var healthText = ""
  @State var models: [String] = []
  @State var testing = false
  @State private var centerSheet = false
  @AppStorage("appearance") var appearance = "system"
  @AppStorage("notifications") var notifications = false
  var body: some View {
    ScrollView { VStack(alignment: .leading, spacing: 15) {
      HStack {
        Text("Settings").font(.title2.bold())
        Spacer()
        Button("Done") { dismiss() }.keyboardShortcut(.cancelAction)
      }
      HStack {
        Picker("Appearance", selection: $appearance) {
          Text("System").tag("system")
          Text("Light").tag("light")
          Text("Dark").tag("dark")
        }
        Toggle("Notifications", isOn: $notifications).onChange(of: notifications) { _, enabled in
          if enabled {
            UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) {
              _, _ in
            }
          }
        }
      }
      Divider()
      RemoteSettingsView()
      Divider()
      HStack {
        Text("Model Connections").font(.headline)
        Spacer()
        Button("Connect another PC") { centerSheet = true }
        Button {
          let p = Provider(
            id: UUID().uuidString, name: "Inference Server", kind: "openai",
            endpoint: "http://127.0.0.1:8080/v1", model: "", contextLength: 4096, timeout: 180,
            concurrency: 1, temperature: 0.3, maxTokens: 1200, requiresAuth: false)
          editing = p
          selection = p.id
          secret = ""
          models = []
          healthText = ""
        } label: {
          Label("Add", systemImage: "plus")
        }
      }
      if !model.providers.isEmpty {
        Picker("Connection", selection: $selection) {
          ForEach(model.providers) { Text($0.name).tag(Optional($0.id)) }
          if let p = editing, !model.providers.contains(where: { $0.id == p.id }) {
            Text(p.name).tag(Optional(p.id))
          }
        }.onChange(of: selection) { _, id in
          if let p = model.providers.first(where: { $0.id == id }) {
            editing = p
            secret = ""
            healthText = ""
            models = []
          }
        }
      }
      if editing != nil { providerForm }
      Text(
        "Local models are primary. Ollama uses its native API; llama.cpp, vLLM and MLX use OpenAI-compatible endpoints. For another PC, open LocalBot Center there and paste its pairing code here. Connections are encrypted and work across different networks."
      ).font(.caption).foregroundStyle(.secondary)
    }.padding(24) }.frame(width: 620, height: 720)
    .sheet(isPresented: $centerSheet) { CenterConnectionView().environmentObject(model) }
    .onAppear {
      if editing == nil {
        editing = model.providers.first
        selection = editing?.id
      }
    }
  }
  var providerForm: some View {
    VStack(spacing: 10) {
      TextField("Connection name", text: field(\.name)).textFieldStyle(.roundedBorder)
      Picker("Protocol", selection: field(\.kind)) {
        Text("Ollama").tag("ollama")
        Text("OpenAI compatible").tag("openai")
        Text("Anthropic (optional)").tag("anthropic")
        Text("Codex subscription").tag("codex")
      }.pickerStyle(.segmented)
        .onChange(of: editing?.kind) { _, kind in
          if kind == "codex", editing?.timeout == 180 { editing?.timeout = 900 }
        }
      if editing?.kind == "codex" {
        Text("Uses the ChatGPT account signed in to Codex CLI on this Mac.")
          .font(.caption).foregroundStyle(.secondary)
      } else {
        TextField("Endpoint", text: field(\.endpoint)).textFieldStyle(.roundedBorder)
      }
      HStack {
        TextField("Model identifier", text: field(\.model)).textFieldStyle(.roundedBorder)
        if !models.isEmpty {
          Menu("Models") {
            ForEach(models, id: \.self) { name in Button(name) { editing?.model = name } }
          }
        }
      }
      HStack {
        Text("Context")
        TextField("4096", value: numberField(\.contextLength), format: .number).frame(width: 80)
        Text("Max output")
        TextField("1200", value: numberField(\.maxTokens), format: .number).frame(width: 80)
        Text("Timeout (s)")
        TextField("180", value: numberField(\.timeout), format: .number).frame(width: 60)
      }.textFieldStyle(.roundedBorder).font(.caption)
      HStack {
        Text("Temperature").font(.caption)
        Slider(
          value: Binding(get: { editing?.temperature ?? 0.3 }, set: { editing?.temperature = $0 }),
          in: 0...2, step: 0.1)
        Text(String(format: "%.1f", editing?.temperature ?? 0.3)).font(.caption.monospacedDigit())
      }
      if editing?.kind == "ollama" || editing?.kind == "openai" {
        Toggle("Model supports image input", isOn: Binding(get: { editing?.imageInput ?? false }, set: { editing?.imageInput = $0 }))
        Text("Enable only for a vision-capable model. Images are sent to this endpoint; up to four images, 5 MB each and 12 MB total.").font(.caption2).foregroundStyle(.secondary)
      }
      Stepper(
        "Concurrent tasks: \(editing?.concurrency ?? 1)", value: numberField(\.concurrency),
        in: 1...4)
      Text("Use 1 on an 8 GB Mac. Increase only if the model server can handle parallel requests.").font(
        .caption2
      ).foregroundStyle(.secondary)
      if editing?.kind != "codex" { Toggle(
        "Requires authentication",
        isOn: Binding(get: { editing?.requiresAuth ?? false }, set: { editing?.requiresAuth = $0 }))
      if editing?.requiresAuth == true {
        SecureField("API key — stored in macOS Keychain", text: $secret).textFieldStyle(
          .roundedBorder)
        Text("Leave blank to keep the saved key.").font(.caption2).foregroundStyle(.secondary)
      }
      }
      if editing?.kind == "ollama" {
        Button("Start local Ollama") {
          Task {
            guard await persist(), let p = editing else { return }
            await model.post("/providers/start", ["id": p.id])
            test()
          }
        }.buttonStyle(.borderless)
      }
      HStack {
        Text(healthText).font(.caption).foregroundStyle(
          healthText.hasPrefix("Connected") ? .green : .secondary
        ).textSelection(.enabled)
        Spacer()
        if testing { ProgressView().controlSize(.small) }
        Button("Save & Test") { test() }.disabled(testing)
        Button("Save") { Task { await persist() } }.buttonStyle(.borderedProminent)
      }
    }
  }
  func field(_ key: WritableKeyPath<Provider, String>) -> Binding<String> {
    Binding(get: { editing?[keyPath: key] ?? "" }, set: { editing?[keyPath: key] = $0 })
  }
  func numberField(_ key: WritableKeyPath<Provider, Int>) -> Binding<Int> {
    Binding(get: { editing?[keyPath: key] ?? 0 }, set: { editing?[keyPath: key] = $0 })
  }
  @discardableResult func persist() async -> Bool {
    guard let p = editing else { return false }
    guard await model.save(p, path: "/providers") else { return false }
    do {
      if !secret.isEmpty {
        try Keychain.save(secret, id: p.id + "@" + p.endpoint)
        _ = try await model.request("/credentials", body: ["providerId": p.id, "secret": secret])
        secret = ""
      }
      healthText = "Saved"
      return true
    } catch {
      model.error = error.localizedDescription
      return false
    }
  }
  func test() {
    testing = true
    Task {
      defer { testing = false }
      guard await persist(), let p = editing else { return }
      do {
        let h = try JSONDecoder().decode(
          Health.self, from: await model.request("/providers/health", body: ["id": p.id]))
        models = h.models
        healthText = "Connected · \(h.models.count) model(s)"
      } catch { healthText = error.localizedDescription }
    }
  }
}

struct ArtifactPreview: View {
  var artifact: Artifact
  @State private var thumbnail: NSImage?
  var body: some View {
    VStack(alignment: .leading, spacing: 5) {
      if let thumbnail {
        Image(nsImage: thumbnail).resizable().scaledToFit().frame(maxWidth: 220, maxHeight: 160)
          .clipShape(RoundedRectangle(cornerRadius: 10))
      }
      Label(artifact.name, systemImage: artifact.mime.hasPrefix("image/") ? "photo" : "doc").font(
        .callout)
    }.padding(10).background(.quaternary, in: RoundedRectangle(cornerRadius: 10))
      .task(id: artifact.id) {
        guard artifact.mime.hasPrefix("image/") else { return }
        let url = URL(fileURLWithPath: artifact.path)
        if let source = CGImageSourceCreateWithURL(url as CFURL, nil),
          let image = CGImageSourceCreateThumbnailAtIndex(
            source, 0,
            [
              kCGImageSourceCreateThumbnailFromImageAlways: true,
              kCGImageSourceThumbnailMaxPixelSize: 440,
              kCGImageSourceCreateThumbnailWithTransform: true,
            ] as CFDictionary)
        {
          thumbnail = NSImage(
            cgImage: image, size: NSSize(width: image.width, height: image.height))
        }
      }
  }
}
