import AppKit
import SwiftUI

@main struct LocalBotApp: App {
  @StateObject private var model = AppModel()
  @AppStorage("appearance") private var appearance = "system"
  var body: some Scene {
    WindowGroup {
      MainView().environmentObject(model).frame(minWidth: 760, minHeight: 520)
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
        Button("New Conversation") { model.showNew = true }.keyboardShortcut("n")
        Button("New Project") { model.showProject = true }.keyboardShortcut("n", modifiers: [.command, .shift])
      }
      CommandGroup(replacing: .appSettings) {
        Button("Settings…") { model.showSettings = true }.keyboardShortcut(",")
        Button("Integrations…") { model.showIntegrations = true }
      }
      CommandMenu("Conversation") {
        Button("Show Activity") { model.showActivity.toggle() }.keyboardShortcut(
          "i", modifiers: [.command, .shift])
        Button("Stop Task") {
          if let t = model.activeTask { Task { await model.post("/cancel", ["taskId": t.id]) } }
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
  var body: some View {
    ZStack {
      Circle().fill((group ? Color.indigo : agent?.tint ?? .gray).gradient)
      Image(systemName: group ? "person.2.fill" : agent?.avatar ?? "person.fill").font(
        .system(size: size * 0.43, weight: .medium)
      ).foregroundStyle(.white)
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
            Section(model.showingArchived ? "Archived conversations" : "Conversations") {
              conversationRows(model.visibleConversations.filter { $0.projectId == nil })
            }
            ForEach(model.projects) { project in
              Section {
                conversationRows(model.visibleConversations.filter { $0.projectId == project.id })
                if !model.showingArchived { Button {
                  model.newConversationProjectId = project.id
                  model.showNew = true
                } label: { Label("New conversation", systemImage: "plus") }
                  .buttonStyle(.borderless).foregroundStyle(.secondary).font(.caption).selectionDisabled() }
              } header: { Label(project.name, systemImage: "folder").selectionDisabled() }
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
            Image(systemName: model.showingArchived ? "bubble.left.and.bubble.right" : "archivebox")
          }.buttonStyle(.plain)
            .help(model.showingArchived ? "Show conversations" : "Show archived conversations")
            .accessibilityLabel(model.showingArchived ? "Show conversations" : "Show archived conversations")
          Button {
            model.showSettings = true
          } label: {
            Image(systemName: "gearshape")
          }.buttonStyle(.plain).help("Model settings")
        }.padding(14)
      }
      .navigationSplitViewColumnWidth(min: 250, ideal: 300, max: 380)
      .toolbar {
        ToolbarItemGroup {
          Button {
            model.showNew = true
          } label: {
            Image(systemName: "square.and.pencil")
          }.help("New conversation (⌘N)")
          Button { model.showProject = true } label: { Image(systemName: "folder.badge.plus") }
            .help("New project")
        }
      }
    } detail: {
      if let c = model.selected {
        ConversationView(conversation: c).id(c.id)
      } else {
        ContentUnavailableView(
          "Your agents, one conversation away", systemImage: "bubble.left.and.bubble.right",
          description: Text("Choose a contact to begin."))
      }
    }
    .sheet(isPresented: $model.showNew) { NewConversationView() }
    .sheet(isPresented: $model.showProject) { NewProjectView() }
    .sheet(isPresented: $model.showIntegrations) { IntegrationsView() }
    .sheet(isPresented: $model.showSettings) { SettingsView() }
    .sheet(item: $model.editingAgent) { AgentEditor(agent: $0) }
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
  @ViewBuilder func conversationRows(_ conversations: [Conversation]) -> some View {
            ForEach(conversations) { c in
              ConversationRow(conversation: c).tag(c.id)
                .listRowInsets(EdgeInsets(top: 4, leading: 7, bottom: 4, trailing: 7))
                .contextMenu {
                  Button(c.archived == true ? "Restore Conversation" : "Archive Conversation") {
                    Task { await model.archiveConversation(c) }
                  }.disabled(model.tasks.contains { $0.conversationId == c.id && ($0.active || $0.status == "awaiting_input") })
                  Button("Conversation Details…") { model.editingConversation = c }
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
  var body: some View {
    HStack(alignment: .center, spacing: 10) {
      Avatar(
        agent: model.agent(conversation.members.first), group: conversation.members.count > 1,
        size: 40)
      VStack(alignment: .leading, spacing: 4) {
        HStack {
          Text(conversation.title).font(.system(size: 13, weight: .semibold)).lineLimit(1)
          Spacer(minLength: 1)
          if conversation.preview != nil {
            Text(dateFrom(conversation.updatedAt), style: .time).font(.system(size: 10))
              .foregroundStyle(.secondary)
          }
        }
        Text(
          conversation.preview.map(messagePreview)
            ?? (conversation.members.count > 1
              ? "\(conversation.members.count) agents · shared workspace"
              : model.agent(conversation.members.first)?.role ?? "Agent")
        ).font(.system(size: 12)).foregroundStyle(.secondary).lineLimit(2).frame(
          maxWidth: .infinity, alignment: .leading)
      }
    }.frame(height: 68).padding(.horizontal, 3)
  }
}
struct ConversationView: View {
  @EnvironmentObject var model: AppModel
  var conversation: Conversation
  @State var draft = ""
  @State var attachments: [Artifact] = []
  @State var following = true
  @State var initialScroll = true
  @FocusState var composing: Bool
  var members: [Agent] { conversation.members.compactMap { model.agent($0) } }
  var body: some View {
    HStack(spacing: 0) {
      VStack(spacing: 0) {
        ScrollViewReader { proxy in
          ScrollView {
            LazyVStack(spacing: 13) {
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
              if model.messages.isEmpty { emptyConversation }
              ForEach(model.messages) { m in MessageBubble(message: m, group: conversation.projectId != nil || members.count > 1).id(m.id)
                .background(m.id == model.searchFocusId ? Color.accentColor.opacity(0.12) : .clear, in: RoundedRectangle(cornerRadius: 12)) }
              if model.activeTask != nil || model.sending {
                HStack(spacing: 8) {
                  Avatar(agent: members.first { $0.name == activeName } ?? model.agent("assistant"), size: 28)
                  if model.activeTask?.status == "awaiting_approval" {
                    Text("Waiting for your approval…").font(.caption).foregroundStyle(.secondary)
                  } else { TypingDots().accessibilityLabel("\(activeName) is typing") }
                  Spacer()
                }.padding(.horizontal, 28).padding(.top, 5)
              }
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
      }.background(Color(nsColor: .textBackgroundColor))
      if model.showActivity {
        Divider()
        ActivityView().frame(width: 310)
      }
    }
    .navigationTitle("")
    .toolbar {
      ToolbarItem(placement: .principal) {
        Menu {
          ForEach(members) { a in Button("\(a.name) · \(a.role)") { model.editingAgent = a } }
        } label: {
          HStack(spacing: 9) {
            Avatar(agent: members.first, group: members.count > 1, size: 28)
            VStack(alignment: .leading, spacing: 1) {
              Text(conversation.title).font(.headline)
              Text(
                members.count > 1
                  ? members.map(\.name).joined(separator: ", ") : members.first?.role ?? "Agent"
              ).font(.system(size: 10)).foregroundStyle(.secondary)
            }
          }
        }.menuStyle(.borderlessButton).fixedSize()
      }
      ToolbarItem {
        Button {
          model.showActivity.toggle()
        } label: {
          Image(systemName: "sidebar.right")
        }.help("Activity and artifacts")
      }
      ToolbarItem {
        Menu {
          ForEach(members) { a in Button(a.name) { model.editingAgent = a } }
        } label: {
          Image(systemName: "info.circle")
        }.help("Contact details")
      }
    }
    .onAppear {
      draft = UserDefaults.standard.string(forKey: "draft.\(conversation.id)") ?? ""
      composing = true
    }
    .onChange(of: draft) { _, new in
      UserDefaults.standard.set(new, forKey: "draft.\(conversation.id)")
    }
  }
  var activeName: String {
    if let run = model.activeRuns.first(where: { $0.taskId == model.activeTask?.id }), let agent = model.agent(run.agentId) { return agent.name }
    if let a = model.activity.last, let agent = model.agent(a.agentId),
      model.activeTask?.id == a.taskId
    {
      return agent.name
    }
    return members.first?.name ?? "Agent"
  }
  var emptyConversation: some View {
    VStack(spacing: 12) {
      Avatar(agent: members.first, group: members.count > 1, size: 72)
      Text(conversation.title).font(.title2.weight(.semibold))
      Text(
        members.count > 1
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
    }.frame(maxWidth: .infinity).padding(.vertical, 80)
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
          Task { attachments += await model.attach() }
        } label: {
          Image(systemName: "plus").font(.system(size: 18)).frame(width: 30, height: 32)
        }.buttonStyle(.plain).foregroundStyle(.secondary).help("Attach files")
        HStack(alignment: .bottom, spacing: 8) {
          TextField("Message", text: $draft, axis: .vertical).lineLimit(1...7).textFieldStyle(
            .plain
          ).font(.system(size: 14)).focused($composing)
            .onKeyPress(keys: [.return]) { event in
              if event.modifiers.contains(.shift) { return .ignored }
              send()
              return .handled
            }.padding(.vertical, 9)
          if let t = model.activeTask {
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
  var outgoing: Bool { message.role == "user" }
  var body: some View {
    if message.role == "system" {
      Text(message.content).font(.caption).foregroundStyle(.secondary).multilineTextAlignment(
        .center
      ).padding(.horizontal, 40).textSelection(.enabled)
    } else {
      HStack(alignment: .bottom, spacing: 7) {
        if outgoing {
          Spacer(minLength: 80)
        } else if group {
          Avatar(agent: model.agent(message.agentId), size: 25)
        }
        VStack(alignment: outgoing ? .trailing : .leading, spacing: 4) {
          if group && !outgoing {
            Text(model.agent(message.agentId)?.name ?? "Agent").font(.system(size: 10))
              .foregroundStyle(.secondary).padding(.leading, 9)
          }
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
          HStack(spacing: 8) {
            Text(dateFrom(message.createdAt), style: .time).font(.system(size: 9)).foregroundStyle(
              .tertiary)
            if let run = message.runId {
              let count = model.activity.filter { $0.runId == run }.count
              if count > 0 {
                Button("\(count) action\(count == 1 ? "" : "s")") { model.showActivity = true }
                  .font(.system(size: 10)).buttonStyle(.plain).foregroundStyle(.secondary)
              }
            }
          }.padding(.horizontal, 6)
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
        if !outgoing { Spacer(minLength: 80) }
      }.padding(.horizontal, 24)
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
          scrollToBottom()
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
