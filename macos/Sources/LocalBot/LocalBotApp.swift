import AppKit
import SwiftUI

@main struct LocalBotApp: App {
  @StateObject private var model = AppModel()
  @AppStorage("messageFontSize") private var messageFontSize = 14.0
  @AppStorage("appearance") private var appearance = "system"
  var body: some Scene {
    WindowGroup {
      MainView().environmentObject(model).frame(minWidth: 760, minHeight: 520)
        .background(TransparentWindowChrome())
        .toolbarBackground(.hidden, for: .windowToolbar)
        .preferredColorScheme(appearance == "dark" ? .dark : appearance == "light" ? .light : nil)
        .task {
          model.start()
          NSApp.setActivationPolicy(.regular)
          NSApp.activate(ignoringOtherApps: true)
        }
    }
    .defaultSize(width: 1100, height: 740)
    .windowToolbarStyle(.unified)
    .commands {
      CommandGroup(replacing: .newItem) {
        Button("New Conversation") { Task { await model.newConversation() } }.keyboardShortcut("n")
        Button("New Project") { model.showProject = true }.keyboardShortcut("n", modifiers: [.command, .shift])
      }
      CommandGroup(replacing: .appSettings) {
        Button("Settings…") { model.showSettings = true }.keyboardShortcut(",")
        Button("Integrations…") { model.showIntegrations = true }
      }
      CommandMenu("Text Size") {
        Button("Increase Text Size") { messageFontSize = min(24, messageFontSize + 1) }.keyboardShortcut("+")
        Button("Increase Text Size") { messageFontSize = min(24, messageFontSize + 1) }.keyboardShortcut("=")
        Button("Decrease Text Size") { messageFontSize = max(11, messageFontSize - 1) }.keyboardShortcut("-")
        Button("Actual Size") { messageFontSize = 14 }.keyboardShortcut("0")
      }
      CommandMenu("Workspace") {
        Button("Browser") { model.openWorkspace(.browser) }.keyboardShortcut("t")
        Button("Terminal") { model.openWorkspace(.terminal) }.keyboardShortcut("`", modifiers: [.control])
        Button("Files") { model.openWorkspace(.files) }.keyboardShortcut("p")
        Button("Review") { model.openWorkspace(.review) }.keyboardShortcut("g", modifiers: [.control, .shift])
        Button("Side Chat") { model.openWorkspace(.chat) }.keyboardShortcut("s", modifiers: [.command, .option])
      }
      CommandMenu("Conversation") {
        Button("Show Activity") { model.showActivity.toggle() }.keyboardShortcut(
          "i", modifiers: [.command, .shift])
        Button("Stop Task") {
          if let t = model.stoppableTask { Task { await model.post("/cancel", ["taskId": t.id]) } }
        }.keyboardShortcut(".")
        Button("Find Messages") {
          NotificationCenter.default.post(name: .init("FocusSearch"), object: nil)
        }.keyboardShortcut("f")
      }
    }
  }
}
struct Avatar: View {
  var agent: Agent?
  var group = false
  var size: CGFloat = 40
  var motion: LocalBotAnimation? = nil
  var palette: LocalBotPalette {
    switch agent?.color { case "purple": return .lavender; case "orange": return .peach
    case "green": return .mint; case "pink": return .rose; default: return group ? .lilac : .sky }
  }
  var body: some View {
    Group {
      if let motion { LocalBotMascot(state: motion, color: palette) }
      else { LocalBotDrawing(pose: LocalBotMotion.neutral, color: palette) }
    }.frame(width: size, height: size).accessibilityHidden(true)
  }
}
struct TypingDots: View {
  @Environment(\.accessibilityReduceMotion) var reduceMotion
  var body: some View {
    TimelineView(.animation(minimumInterval: 0.15, paused: reduceMotion)) { timeline in
      HStack(spacing: 4) {
        ForEach(0..<3) { index in
          let phase = timeline.date.timeIntervalSinceReferenceDate * 4 - Double(index) * 0.8
          Circle().fill(.secondary.opacity(reduceMotion ? 0.6 : 0.35 + 0.5 * (sin(phase) + 1) / 2))
            .frame(width: 6, height: 6)
            .offset(y: reduceMotion ? 0 : -2 * max(0, sin(phase)))
        }
      }.padding(.horizontal, 13).padding(.vertical, 12)
        .background(.quaternary, in: Capsule())
    }
  }
}
struct MainView: View {
  @EnvironmentObject var model: AppModel
  @FocusState var searchFocused: Bool
  @State private var collapsedProjects = Set(UserDefaults.standard.stringArray(forKey: "collapsedProjects") ?? [])
  var body: some View {
    NavigationSplitView {
      VStack(spacing: 0) {
        HStack(spacing: 6) {
          Image(systemName: "magnifyingglass").foregroundStyle(.secondary)
          TextField("Search", text: $model.search).textFieldStyle(.plain).focused($searchFocused)
          if !model.search.isEmpty {
            Button {
              model.search = ""
            } label: {
              Image(systemName: "xmark.circle.fill")
            }.buttonStyle(.plain).foregroundStyle(.secondary)
          }
        }.padding(9).background(.quaternary.opacity(0.4), in: RoundedRectangle(cornerRadius: 10))
          .padding(.horizontal, 12).padding(.bottom, 8)
        if model.search.isEmpty {
          List(selection: $model.selectedId) {
            ForEach(model.projects.filter { project in
              !model.showingArchived || model.visibleConversations.contains { $0.projectId == project.id }
            }) { project in
              HStack(spacing: 9) {
                Button { toggleProject(project.id) } label: {
                  HStack(spacing: 9) {
                    Image(systemName: "chevron.right").font(.system(size: 10, weight: .semibold))
                      .rotationEffect(.degrees(collapsedProjects.contains(project.id) ? 0 : 90))
                    Image(systemName: collapsedProjects.contains(project.id) ? "folder" : "folder.fill").font(.system(size: 17))
                    Text(project.name).font(.system(size: 12, weight: .medium)).lineLimit(1)
                    Spacer(minLength: 0)
                  }.contentShape(Rectangle())
                }.buttonStyle(.plain)
                Button { model.editingProject = project } label: { Image(systemName: "ellipsis") }
                  .buttonStyle(.plain).help("Project details")
              }.foregroundStyle(.secondary).padding(.vertical, 7).selectionDisabled()
              if !collapsedProjects.contains(project.id) {
                conversationRows(model.visibleConversations.filter { $0.projectId == project.id })
                if !model.showingArchived {
                  Button { Task { await model.newConversation(projectId: project.id) } } label: {
                    Label("New conversation", systemImage: "plus").font(.caption)
                  }.buttonStyle(.borderless).foregroundStyle(.secondary).selectionDisabled()
                }
              }
            }

            Section(model.showingArchived ? "Archived conversations" : "Recents") {
              conversationRows(model.visibleConversations.filter { $0.projectId == nil })
              if model.showingArchived && model.visibleConversations.isEmpty {
                Text("No archived conversations").foregroundStyle(.secondary).selectionDisabled()
              }
            }
          }.listStyle(.sidebar)
        } else {
          List(model.searchResults) { m in
            Button {
              Task { await model.openSearchResult(m) }
            } label: {
              VStack(alignment: .leading, spacing: 4) {
                Text(
                  model.conversations.first { $0.id == m.conversationId }?.title ?? "Conversation"
                ).font(.headline)
                if model.conversations.first(where: { $0.id == m.conversationId })?.archived == true {
                  Label("Archived", systemImage: "archivebox").font(.caption).foregroundStyle(.secondary)
                }
                Text(messagePreview(m.content)).font(.caption).lineLimit(3).foregroundStyle(.secondary)
              }.frame(maxWidth: .infinity, alignment: .leading)
            }.buttonStyle(.plain)
          }
          if model.searchResults.isEmpty {
            Text("No messages found").foregroundStyle(.secondary).padding()
          }
        }
        HStack(spacing: 7) {
          Circle().fill(model.connected ? .green : .orange).frame(width: 6, height: 6)
          Text(model.connected ? "Local runtime" : "Connecting…").font(.caption).foregroundStyle(
            .secondary)
          Spacer()
          Button { model.toggleArchiveList() } label: {
            Image(systemName: model.showingArchived ? "bubble.left.and.bubble.right" : "archivebox").font(.system(size: 17))
          }.buttonStyle(.plain)
            .help(model.showingArchived ? "Show conversations" : "Show archived conversations")
            .accessibilityLabel(model.showingArchived ? "Show conversations" : "Show archived conversations")
          Button {
            model.showSettings = true
          } label: {
            Image(systemName: "gearshape").font(.system(size: 17))
          }.buttonStyle(.plain).help("Model settings")
        }.padding(14)
      }
      .navigationSplitViewColumnWidth(min: 250, ideal: 300, max: 380)
      .toolbar {
        ToolbarItemGroup {
          Button {
            Task { await model.newConversation() }
          } label: {
            Image(systemName: "square.and.pencil")
          }.help("New conversation (⌘N)")
          Button { model.showProject = true } label: { Image(systemName: "folder.badge.plus") }
            .help("New project")
        }
      }
    } detail: {
      if let c = model.selected {
        ConversationView(conversation: c)
      } else {
        ContentUnavailableView(
          "Your agents, one conversation away", systemImage: "bubble.left.and.bubble.right",
          description: Text("Choose a contact to begin."))
      }
    }
    .overlay {
      if !model.hasLoaded {
        VStack(spacing: 18) {
          BotMark(tint: .blue).frame(width: 88, height: 88).clipShape(RoundedRectangle(cornerRadius: 22))
          Text("LocalBot").font(.largeTitle.bold())
          Text("Your team, right here.").foregroundStyle(.secondary)
          ProgressView().controlSize(.small)
          Text(model.connected ? "Opening conversations…" : "Connecting to your local runtime…").font(.caption).foregroundStyle(.secondary)
          if let error = model.error { Text(error).font(.caption).textSelection(.enabled) }
          Button("Retry connection") { Task { await model.connect(); await model.refresh() } }.buttonStyle(.plain)
        }.frame(maxWidth: .infinity, maxHeight: .infinity).background(.background)
      }
    }
    .sheet(isPresented: $model.showNew) { NewConversationView() }
    .sheet(isPresented: $model.showProject) { NewProjectView() }
    .sheet(isPresented: $model.showIntegrations) { IntegrationsView() }
    .sheet(isPresented: $model.showSettings) { SettingsView() }
    .sheet(item: $model.editingAgent) { AgentEditor(agent: $0) }
    .sheet(item: $model.editingProject) { ProjectEditor(project: $0) }
    .sheet(item: $model.editingConversation) { ConversationEditor(conversation: $0) }
    .alert(
      "LocalBot",
      isPresented: Binding(get: { model.error != nil }, set: { if !$0 { model.error = nil } })
    ) {
      Button("OK") { model.error = nil }
    } message: {
      Text(model.error ?? "")
    }
    .task(id: model.search) {
      try? await Task.sleep(for: .milliseconds(250))
      if !Task.isCancelled { await model.runSearch() }
    }
    .onReceive(NotificationCenter.default.publisher(for: .init("FocusSearch"))) { _ in
      searchFocused = true
    }
  }
  private func toggleProject(_ id: String) {
    withAnimation(.easeInOut(duration: 0.2)) {
      if !collapsedProjects.insert(id).inserted { collapsedProjects.remove(id) }
    }
    UserDefaults.standard.set(Array(collapsedProjects), forKey: "collapsedProjects")
  }
  @ViewBuilder func conversationRows(_ conversations: [Conversation]) -> some View {
            ForEach(conversations) { c in
              ConversationRow(conversation: c).tag(c.id)
                .draggable("localbot-conversation:" + c.id)
                .listRowInsets(EdgeInsets(top: 4, leading: 7, bottom: 4, trailing: 7))
                .contextMenu {
                  Button(c.archived == true ? "Restore Conversation" : "Archive Conversation") {
                    Task { await model.archiveConversation(c) }
                  }.disabled(model.tasks.contains { $0.conversationId == c.id && ($0.active || $0.status == "awaiting_input") })
                  Button("Open in Side Chat") { model.openWorkspace(.chat, conversationId: c.id) }
                  Button("Conversation Details…") { model.editingConversation = c }
                  if let project = model.projects.first(where: { $0.id == c.projectId }) {
                    Button("Project Details…") { model.editingProject = project }
                  }
                  Button("New conversation with these agents") {
                    Task {
                      await model.post("/conversations", ["title": c.title, "members": c.members, "projectId": c.projectId as Any? ?? NSNull(), "automatic": c.automatic == 1])
                      model.selectedId = model.conversations.first?.id
                    }
                  }
                  if c.members.count == 1, let agent = model.agent(c.members[0]) {
                    Button("Contact Details…") { model.editingAgent = agent }
                  }
                }
            }
  }
}
struct ConversationRow: View {
  @EnvironmentObject var model: AppModel
  var conversation: Conversation
  var title: String {
    guard let name = model.agent(conversation.members.first)?.name,
      conversation.title.hasPrefix(name + " · ") else { return conversation.title }
    return String(conversation.title.dropFirst(name.count + 3))
  }
  var body: some View {
    HStack(spacing: 7) {
      if conversation.projectId != nil {
        AvatarStack(agents: conversation.members.compactMap { model.agent($0) }, size: 22)
      }
      VStack(alignment: .leading, spacing: 4) {
        Text(title).font(.system(size: 13, weight: .regular)).lineLimit(1).truncationMode(.tail)

      }
      Spacer(minLength: 0)
      if model.tasks.contains(where: { $0.conversationId == conversation.id && $0.active }) {
        Circle().fill(Color.accentColor).frame(width: 6, height: 6).help("Work in progress")
      }
    }.frame(height: 28).contentShape(Rectangle()).help(title)
  }
}

struct ConversationView: View {
  @AppStorage("messageFontSize") private var messageFontSize = 14.0
  @EnvironmentObject var model: AppModel
  var conversation: Conversation
  var isSideChat = false
  @AppStorage("workspacePanelWidth") private var panelWidth = 440.0
  @State private var resizeOrigin: Double?
  @State var draft = ""
  @State var attachments: [Artifact] = []
  @State private var showingAttachments = false
  @State var following = true
  @State var initialScroll = true
  @FocusState var composing: Bool
  var members: [Agent] { conversation.members.compactMap { model.agent($0) } }
  var body: some View {
    GeometryReader { geometry in
    HStack(spacing: 0) {
      VStack(spacing: 0) {
        if model.messages.isEmpty {
          emptyConversation.frame(maxWidth: .infinity, maxHeight: .infinity)
        } else {
        ScrollViewReader { proxy in
          ScrollView {
            VStack(spacing: 4) {
              Text("LocalBot").font(.system(size: 11, weight: .semibold)).foregroundStyle(.tertiary)
                .padding(.top, 20)
              if model.hasEarlierMessages {
                Button {
                  following = false
                  Task {
                    if let anchor = await model.loadEarlierMessages() {
                      // Wait for the prepended rows to enter the lazy layout.
                      try? await Task.sleep(for: .milliseconds(80))
                      guard model.selectedId == conversation.id else { return }
                      proxy.scrollTo(anchor, anchor: .top)
                    }
                  }
                } label: {
                  if model.loadingEarlierMessages { ProgressView().controlSize(.small) }
                  else { Text("Load earlier messages") }
                }.buttonStyle(.borderless).disabled(model.loadingEarlierMessages)
              }
              ForEach(Array(model.messages.enumerated()), id: \.element.id) { index, m in
                let begins = index == 0 || !sameMessageGroup(model.messages[index - 1], m)
                let ends = index == model.messages.count - 1 || !sameMessageGroup(m, model.messages[index + 1])
                MessageBubble(message: m, group: conversation.projectId != nil || members.count > 1, beginsGroup: begins, endsGroup: ends).id(m.id)
                .padding(.top, begins ? 12 : 0)
                .background(m.id == model.searchFocusId ? Color.accentColor.opacity(0.12) : .clear, in: RoundedRectangle(cornerRadius: 12))

              }
              if progress != .hidden { progressIndicator }
              Color.clear.frame(height: 1).id("bottom")
            }.padding(.bottom, 16)
          }
          .defaultScrollAnchor(.bottom)
          .modifier(ScrollPositionObserver(isAtBottom: $following, hasMessages: !model.messages.isEmpty) {
            proxy.scrollTo("bottom", anchor: .bottom)
          })
          .onChange(of: model.messages.count) { _, _ in
            if following && !initialScroll {
              withAnimation(.easeOut(duration: 0.18)) { proxy.scrollTo("bottom", anchor: .bottom) }
            }
          }
          .task(id: model.messages.last?.id) {
            if let focus = model.searchFocusId, model.messages.contains(where: { $0.id == focus }) {
              following = false
              initialScroll = false
              try? await Task.sleep(for: .milliseconds(80))
              guard !Task.isCancelled else { return }
              proxy.scrollTo(focus, anchor: .center)
              return
            }
            guard initialScroll && !model.messages.isEmpty else { return }
            // Let the lazy transcript resolve its row heights before the first jump.
            try? await Task.sleep(for: .milliseconds(80))
            guard !Task.isCancelled else { return }
            proxy.scrollTo("bottom", anchor: .bottom)
            initialScroll = false
          }
          .overlay(alignment: .bottomTrailing) {
            if !following && !model.messages.isEmpty {
              Button {
                following = true
                withAnimation { proxy.scrollTo("bottom", anchor: .bottom) }
              } label: {
                Image(systemName: "arrow.down").padding(8)
              }.buttonStyle(.bordered).clipShape(Circle()).padding()
            }
          }
        }
        }
        if model.searchFocusId != nil {
          HStack {
            Text("Viewing search result").font(.caption).foregroundStyle(.secondary)
            Spacer()
            Button("Latest messages") {
              following = true
              initialScroll = true
              Task { await model.showLatestMessages() }
            }.buttonStyle(.borderless)
          }.padding(.horizontal, 24).padding(.vertical, 8)
        }
        ForEach(model.approvals.filter { a in model.currentTasks.contains { $0.id == a.taskId } }) {
          a in ApprovalCard(approval: a)
        }
        composer
      }.frame(width: max(0, geometry.size.width - (!isSideChat && model.rightPanel != nil
        ? min(max(280, panelWidth), max(280, geometry.size.width - 360)) + 10 : 0)))
        .clipped().background(Color(nsColor: .textBackgroundColor)).transaction { $0.animation = nil }
        .overlay(alignment: .top) {
          Rectangle().fill(.ultraThinMaterial)
            .frame(height: geometry.safeAreaInsets.top + 12)
            .mask(LinearGradient(stops: [.init(color: .black, location: 0), .init(color: .black, location: 0.72), .init(color: .clear, location: 1)], startPoint: .top, endPoint: .bottom))
            .offset(y: -geometry.safeAreaInsets.top)
            .allowsHitTesting(false).accessibilityHidden(true)
        }
      if !isSideChat, let panel = model.rightPanel {
        VStack(spacing: 0) {
          HStack { Spacer(); RightPanelControls() }.padding(.horizontal, 16).padding(.vertical, 10)
          if panel == .activity { ActivityView() }
          else { WorkspacePanel(state: model.workspace) }
        }
        .frame(width: min(max(280, panelWidth), max(280, geometry.size.width - 360)))
        .modifier(PanelGlass())
        .clipShape(RoundedRectangle(cornerRadius: 22))
        .overlay(RoundedRectangle(cornerRadius: 22).strokeBorder(.primary.opacity(0.12), lineWidth: 0.7))
        .padding(.trailing, 10).padding(.bottom, 10).padding(.top, 8)
        .ignoresSafeArea(.container, edges: .top)
        .overlay(alignment: .leading) {
          PanelResizeHandle { delta in panelWidth = max(280, min(900, panelWidth - delta)) }.frame(width: 8)
        }
        .transition(.opacity.combined(with: .offset(x: 14)))
      }
    }
    .animation(.easeInOut(duration: 0.18), value: model.rightPanel)
    .overlay(alignment: .trailing) {
      if !isSideChat && model.rightPanel == nil {
        Color.clear.frame(width: 32).dropDestination(for: String.self) { values, _ in
          guard let value = values.first, value.hasPrefix("localbot-conversation:") else { return false }
          model.openWorkspace(.chat, conversationId: String(value.dropFirst(22)))
          return true
        }
      }
    }
    }
    .background(Color(nsColor: .textBackgroundColor).ignoresSafeArea())
    .navigationTitle("")
    .toolbarBackground(.hidden, for: .windowToolbar)
    .toolbar {
      if !isSideChat {
      ToolbarItem(placement: .navigation) {
        Menu {
          ForEach(members) { a in Button("\(a.name) · \(a.role)") { model.editingAgent = a } }
        } label: {
          HStack(spacing: 9) {
            AvatarStack(agents: members, size: 28)
            VStack(alignment: .leading, spacing: 1) {
              Text(conversation.title).font(.headline).lineLimit(1).truncationMode(.tail)
              Text(
                members.count > 1
                  ? members.map(\.name).joined(separator: ", ") : members.first?.role ?? "Agent"
              ).font(.system(size: 10)).foregroundStyle(.secondary)
            }
          }
        }.menuStyle(.borderlessButton).padding(.horizontal, 12).frame(maxWidth: model.rightPanel != nil ? 240 : 420)
      }
      if model.rightPanel == nil {
        ToolbarItem { RightPanelControls().padding(.horizontal, 12).fixedSize() }
      }
    }
    }
    .onAppear {
      draft = UserDefaults.standard.string(forKey: "draft.\(conversation.id)") ?? ""
      composing = true
    }
    .onChange(of: conversation.id) { _, id in
      draft = UserDefaults.standard.string(forKey: "draft.\(id)") ?? ""
      attachments = []; following = true; initialScroll = true
    }
    .onChange(of: draft) { _, new in
      UserDefaults.standard.set(new, forKey: "draft.\(conversation.id)")
    }
  }
  var progressIndicator: some View {
    HStack(spacing: 7) {
      if let activeAgent { Avatar(agent: activeAgent, size: 32, motion: progress == .approval ? .needsInput : (model.activity.last?.status == "running" && model.activity.last?.name != "thinking" ? .working : .thinking)) }
      switch progress {
      case .typing:
        TypingDots().accessibilityLabel("\(activeAgent?.name ?? "Agent") is typing")
      case .approval:
        Text("Waiting for your approval…").font(.caption).foregroundStyle(.secondary)
      case .queued:
        Text("Queued…").font(.caption).foregroundStyle(.secondary)
      case .sending:
        Text("Sending…").font(.caption).foregroundStyle(.secondary)
      case .preparing:
        Image(systemName: "sparkles").font(.system(size: 16)).foregroundStyle(.secondary)
          .modifier(ActivityShimmer(active: true)).accessibilityLabel("Preparing your team")
      case .hidden: EmptyView()
      }
      Spacer()
    }.padding(.horizontal, 24).padding(.top, 5)
  }
  var activeRun: ActiveRun? {
    model.activeRuns.first { $0.taskId == model.activeTask?.id }
  }
  var activeAgent: Agent? {
    if let activeRun { return model.agent(activeRun.agentId) }
    return nil
  }
  var progress: ConversationProgress.Indicator {
    if model.activity.contains(where: { $0.taskId == model.activeTask?.id && $0.name != "thinking" && $0.status == "running" }) { return .hidden }
    return ConversationProgress.indicator(task: model.activeTask, run: activeRun, sending: model.sending && model.sendingConversationId == conversation.id)
  }
  var emptyConversation: some View {
    VStack(spacing: 12) {
      AvatarStack(agents: members, size: 72)
      Text(conversation.title).font(.title2.weight(.semibold))
      Text(
        conversation.automatic == 1
          ? "Describe what you want to build.\nThe right agents will join automatically."
          : members.count > 1
          ? "Different perspectives. One local model.\nYour team works in sequence and shares its results."
          : "\(members.first?.role ?? "Your agent"), right here on your Mac.\nSend a message to start working together."
      ).font(.callout).foregroundStyle(.secondary).multilineTextAlignment(.center)
      if let a = members.first {
        Button {
          model.editingAgent = a
        } label: {
          Label("Choose workspace & permissions", systemImage: "folder")
        }.buttonStyle(.borderless).padding(.top, 4)
      }
    }.frame(maxWidth: .infinity).padding(32)
  }
  var composer: some View {
    VStack(spacing: 8) {
      if !attachments.isEmpty {
        HStack {
          ForEach(attachments) { a in
            HStack {
              Image(systemName: "paperclip")
              Text(a.name).lineLimit(1)
              Button {
                attachments.removeAll { $0.id == a.id }
              } label: {
                Image(systemName: "xmark.circle.fill")
              }.buttonStyle(.plain)
            }.font(.caption).padding(6).background(.quaternary, in: Capsule())
          }
          Spacer()
        }.padding(.horizontal, 55)
      }
      HStack(alignment: .bottom, spacing: 10) {
        Button {
          showingAttachments = true
        } label: {
          Image(systemName: "plus").font(.system(size: 18)).frame(width: 30, height: 32)
        }.buttonStyle(.plain).foregroundStyle(.secondary).help("Attach files").disabled(model.attaching)
        .sheet(isPresented: $showingAttachments) {
          AttachmentPicker { urls in attachments += await model.attach(urls: urls) }
        }
        HStack(alignment: .bottom, spacing: 8) {
          ComposerEditor(text: $draft, fontSize: messageFontSize, send: send)
            .overlay(alignment: .topLeading) {
              if draft.isEmpty { Text("Message").foregroundStyle(.tertiary).allowsHitTesting(false).padding(.top, 2) }
            }.padding(.vertical, 9)
          if let t = model.stoppableTask {
            Button {
              Task { await model.post("/cancel", ["taskId": t.id]) }
            } label: {
              Image(systemName: "stop.circle.fill").font(.system(size: 25)).foregroundStyle(.orange)
            }.buttonStyle(.plain).padding(.bottom, 5).help("Stop task (⌘.)")
          } else {
            Button(action: send) {
              Image(systemName: "arrow.up.circle.fill").font(.system(size: 25)).foregroundStyle(
                draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && attachments.isEmpty
                  ? Color.gray.opacity(0.3) : .blue)
            }.buttonStyle(.plain).disabled(
              model.sending || !model.connected
                || (draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                  && attachments.isEmpty)
            ).padding(.bottom, 5).help("Send message")
          }
        }.padding(.leading, 13).padding(.trailing, 6).background(
          Color(nsColor: .controlBackgroundColor).opacity(0.45),
          in: RoundedRectangle(cornerRadius: 20)
        ).overlay(RoundedRectangle(cornerRadius: 20).stroke(.gray.opacity(0.25), lineWidth: 1))
      }.padding(.horizontal, 16).padding(.bottom, 16).padding(.top, 7)
    }
  }
  func send() {
    let content = draft.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !content.isEmpty || !attachments.isEmpty else { return }
    let files = attachments
    Task {
      if await model.send(content, attachments: files) {
        if draft.trimmingCharacters(in: .whitespacesAndNewlines) == content { draft = "" }
        attachments = []
        following = true
      }
    }
  }
}
struct MessageBubble: View {
  @EnvironmentObject var model: AppModel
  @Environment(\.colorScheme) var colorScheme
  var message: ChatMessage
  var group: Bool
  var beginsGroup = true
  var endsGroup = true
  @State private var bubbleWidth: CGFloat = 256
  var outgoing: Bool { message.role == "user" }
  var avatarMotion: LocalBotAnimation? {
    guard message.id == model.messages.last(where: { $0.role == "assistant" })?.id else { return nil }
    if let run = model.activeRuns.first(where: { $0.id == message.runId }), run.taskId == model.activeTask?.id {
      if model.activeTask?.status == "awaiting_approval" { return .needsInput }
      return actions.last?.status == "running" && actions.last?.name != "thinking" ? .working : .thinking
    }
    guard abs(dateFrom(message.createdAt).timeIntervalSinceNow) < 4, model.activeTask == nil else { return nil }
    let status = model.currentTasks.first(where: { $0.id == message.taskId })?.status ?? ""
    if status == "cancelled" { return .stopped }
    if status.contains("error") || status == "failed" { return .error }
    return status == "completed" ? .success : nil
  }
  var actions: [Activity] {
    guard message.role == "assistant", let run = message.runId else { return [] }
    let next = model.messages.first { $0.runId == run && $0.role == "assistant" && $0.createdAt > message.createdAt }
    let first = !model.messages.contains { $0.runId == run && $0.role == "assistant" && $0.createdAt < message.createdAt }
    return model.activity.filter { $0.runId == run && (first || $0.createdAt >= message.createdAt) && (next == nil || $0.createdAt < next!.createdAt) }
  }
  var body: some View {
    if message.role == "system" {
      Text(message.content).font(.caption).foregroundStyle(.secondary).multilineTextAlignment(
        .center
      ).padding(.horizontal, 40).textSelection(.enabled)
    } else {
      HStack(alignment: .top, spacing: 7) {
        if outgoing {
          Spacer(minLength: 12)
        } else {
          Avatar(agent: model.agent(message.agentId), size: 32, motion: avatarMotion).padding(.top, group && beginsGroup ? 16 : 2)
        }
        VStack(alignment: outgoing ? .trailing : .leading, spacing: 4) {
          if group && !outgoing && beginsGroup {
            Text(model.agent(message.agentId)?.name ?? "Agent").font(.system(size: 10))
              .foregroundStyle(.secondary).padding(.leading, 9)
          }
          VStack(alignment: .center, spacing: -18) {
          if !message.content.isEmpty {
            MessageText(content: message.content, formatted: !outgoing).font(.system(size: 14)).padding(
              .horizontal, 13
            ).padding(.vertical, 9).foregroundStyle(outgoing ? Color.white : Color.primary)
              .background(
                outgoing
                  ? Color(nsColor: .systemBlue)
                  : (colorScheme == .dark ? Color(white: 0.23) : Color(white: 0.9)),
                in: RoundedRectangle(cornerRadius: 18)
              ).fixedSize(horizontal: false, vertical: true)
              .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { bubbleWidth = $0 }
              .zIndex(1)
          }
          if !actions.isEmpty { MessageActivityPanel(actions: actions, width: bubbleWidth * 0.9).zIndex(0) }
          }
          ForEach(message.attachments) { a in
            Button {
              model.openArtifact(a)
            } label: {
              ArtifactPreview(artifact: a)
            }.buttonStyle(.plain)
          }
          if !message.reactions.isEmpty {
            HStack(spacing: 2) {
              ForEach(Array(Set(message.reactions.map(\.emoji))).sorted(), id: \.self) { emoji in
                let reactions = message.reactions.filter { $0.emoji == emoji }
                Text(emoji + (reactions.count > 1 ? " \(reactions.count)" : "")).font(.system(size: 13)).help(
                  reactions.map { $0.actor == "user" ? "You" : model.agent($0.actor)?.name ?? $0.actor }.joined(separator: ", "))
              }
            }.padding(.horizontal, 8).padding(.vertical, 3).background(.quaternary, in: Capsule())
              .padding(.horizontal, 6)
          }
          if !outgoing {
            Button {
              NSPasteboard.general.clearContents()
              NSPasteboard.general.setString(message.content, forType: .string)
            } label: { Image(systemName: "doc.on.doc").font(.system(size: 10)).frame(width: 24, height: 22) }
              .buttonStyle(PanelButtonStyle()).foregroundStyle(.secondary).help("Copy response").accessibilityLabel("Copy response")
          }
          if endsGroup { HStack(spacing: 8) {
            Text(dateFrom(message.createdAt), style: .time).font(.system(size: 9)).foregroundStyle(
              .tertiary)
            if let run = message.runId {
              let count = model.activity.filter { $0.runId == run && $0.name != "thinking" }.count
              if count > 0 {
                Button("\(count) action\(count == 1 ? "" : "s")") { model.showActivity = true }
                  .font(.system(size: 10)).buttonStyle(.plain).foregroundStyle(.secondary)
              }
            }
          }.padding(.horizontal, 6) }
        }.frame(maxWidth: 560, alignment: outgoing ? .trailing : .leading)
          .contextMenu {
            Button("Copy") {
              NSPasteboard.general.clearContents()
              NSPasteboard.general.setString(message.content, forType: .string)
            }
            Menu("React") {
              ForEach(["👍", "❤️", "👀", "✅", "😂", "❓"], id: \.self) { emoji in
                Button(emoji) {
                  Task {
                    await model.post("/reactions", ["messageId": message.id, "emoji": emoji])
                  }
                }
              }
            }
          }
        if !outgoing { Spacer(minLength: 12) }
      }.padding(.horizontal, 16)
    }
  }
}

private struct TranscriptGeometry: Equatable {
  var contentHeight: CGFloat
  var viewportSize: CGSize
  var nearBottom: Bool
}

struct ScrollPositionObserver: ViewModifier {
  @Binding var isAtBottom: Bool
  var hasMessages: Bool
  var scrollToBottom: () -> Void
  @State private var userScrolling = false
  @State private var nearBottom = true
  func body(content: Content) -> some View {
    if #available(macOS 15.0, *) {
      content.onScrollGeometryChange(for: TranscriptGeometry.self) { geometry in
        TranscriptGeometry(contentHeight: geometry.contentSize.height, viewportSize: geometry.containerSize,
          nearBottom: geometry.contentOffset.y + geometry.containerSize.height >= geometry.contentSize.height - 60)
      } action: { old, new in
        nearBottom = new.nearBottom
        if !userScrolling && hasMessages && isAtBottom && old.viewportSize != new.viewportSize {
          // Width/height changes may reflow the transcript. Never treat lazy row
          // measurements during history navigation as a request to jump to the end.
          // Reflow is handled by the scroll view's bottom anchor. Never mutate
          // its position synchronously from a geometry measurement callback.
        } else {
          isAtBottom = new.nearBottom
        }
      }
      .onScrollPhaseChange { _, phase in
        switch phase {
        case .tracking, .interacting, .decelerating:
          userScrolling = true
          isAtBottom = nearBottom
        case .idle:
          if userScrolling { isAtBottom = nearBottom }
          userScrolling = false
        case .animating:
          break
        @unknown default:
          break
        }
      }
    } else {
      content
    }
  }
}

func sameMessageGroup(_ first: ChatMessage, _ second: ChatMessage) -> Bool {
  first.role != "system" && first.role == second.role && first.agentId == second.agentId
    && abs(dateFrom(second.createdAt).timeIntervalSince(dateFrom(first.createdAt))) < 300
}

struct AvatarStack: View {
  let agents: [Agent]
  var size: CGFloat
  var body: some View {
    ZStack(alignment: .leading) {
      if agents.isEmpty {
        Image(systemName: "sparkles").font(.system(size: size * 0.5)).foregroundStyle(.secondary)
          .frame(width: size, height: size)
      }
      ForEach(Array(agents.prefix(3).enumerated()), id: \.element.id) { index, agent in
        Avatar(agent: agent, size: size)
          .offset(x: CGFloat(index) * size * 0.36)
      }
    }.frame(width: size * (1 + CGFloat(max(0, min(3, agents.count) - 1)) * 0.36), height: size)
  }
}
struct TransparentWindowChrome: NSViewRepresentable {
  func makeNSView(context: Context) -> ChromeView { ChromeView() }
  func updateNSView(_ view: ChromeView, context: Context) {}
  final class ChromeView: NSVisualEffectView {
    private var observers: [NSObjectProtocol] = []
    override func viewDidMoveToWindow() {
      super.viewDidMoveToWindow()
      observers.forEach(NotificationCenter.default.removeObserver)
      observers.removeAll()
      guard let window else { return }
      configure(window)
      for name in [NSWindow.didEnterFullScreenNotification, NSWindow.didExitFullScreenNotification] {
        observers.append(NotificationCenter.default.addObserver(forName: name, object: window, queue: .main) { [weak self, weak window] _ in
          MainActor.assumeIsolated { if let window { self?.configure(window) } }
        })
      }
    }
    private func configure(_ window: NSWindow) {
      material = .underWindowBackground
      blendingMode = .behindWindow
      state = .active
      window.backgroundColor = .clear
      window.isOpaque = false
      window.styleMask.insert(.fullSizeContentView)
      window.titlebarAppearsTransparent = true
      window.toolbarStyle = .unified
      window.toolbar?.isVisible = true
      if window.styleMask.contains(.fullScreen), NSApp.presentationOptions.contains(.autoHideToolbar) {
        NSApp.presentationOptions.remove(.autoHideToolbar)
      }
      window.titlebarSeparatorStyle = .none
    }
    deinit { observers.forEach(NotificationCenter.default.removeObserver) }
  }
}
