import SwiftUI
struct MobileWorkspace: View {
  @EnvironmentObject private var store: RemoteStore
  @Environment(\.dismiss) private var dismiss
  var project: Project?
  @State private var choice = "Files"
  @State private var path = "."
  @State private var entries: [String] = []
  @State private var content = ""
  @State private var original = ""
  @State private var sha = ""
  @State private var file: String?
  @State private var command = ""
  @State private var busy = false
  @State private var error: String?
  @State private var sideChat = false
  @State private var showDiscard = false
  var body: some View {
    NavigationStack {
      VStack(spacing: 12) {
        Picker("Workspace",selection:$choice) { ForEach(["Files","Review","Terminal","Memory"],id: \.self) { Text($0) } }.pickerStyle(.segmented).padding(.horizontal)
          .disabled(file != nil && content != original)
        if let error { Text(error).font(.caption).foregroundStyle(.red).padding(.horizontal) }
        if busy { ProgressView().padding() }
        if choice == "Files" {
          if let file {
            HStack { Text(file).font(.caption).lineLimit(1); Spacer(); Button("Close file") { if content != original { showDiscard = true } else { self.file = nil } }; Button("Save") { run { let result=try await store.workspace("save",extras:["path":file,"content":content,"sha256":sha]); let json=try JSONSerialization.jsonObject(with:result) as? [String:Any]; sha=json?["sha256"] as? String ?? sha; original=content } }.disabled(busy || content == original) }.padding(.horizontal)
            TextEditor(text:$content).font(.system(.body,design:.monospaced)).padding(.horizontal)
          } else {
            HStack { Text(path).font(.caption).foregroundStyle(.secondary); Spacer(); if path != "." { Button("Up") { path=(path as NSString).deletingLastPathComponent; if path.isEmpty { path="." }; load() } } }.padding(.horizontal)
            List(entries,id: \.self) { entry in Button { let target=path == "." ? entry : path+"/"+entry; if entry.hasSuffix("/") { path=String(target.dropLast());load() } else { read(target) } } label: { Label(entry,systemImage:entry.hasSuffix("/") ? "folder":"doc") } }
          }
        } else {
          ScrollView([.horizontal,.vertical]) { Text(content.isEmpty ? (choice == "Review" ? "No changes to display." : "") : content).font(.system(.callout,design:.monospaced)).textSelection(.enabled).frame(maxWidth:.infinity,alignment:.leading).padding() }
          if choice == "Terminal" {
            Text("Commands run on your Mac inside this conversation’s workspace. Network access is disabled; commands stop after 60 seconds. Interactive programs are not supported yet.").font(.caption).foregroundStyle(.secondary).padding(.horizontal)
            HStack { TextField("Command",text:$command,axis:.vertical).textInputAutocapitalization(.never).autocorrectionDisabled(); Button { let value=command;command="";run { let response=try await store.workspace("command",extras:["command":value]);content += "\n$ "+value+"\n"+(try output(response)) } } label: { Image(systemName:"arrow.up.circle.fill").font(.title2) }.disabled(busy || command.isEmpty) }.padding().background(.thinMaterial,in:RoundedRectangle(cornerRadius:22)).padding()
          }
        }
      }.navigationTitle("Workspace").navigationBarTitleDisplayMode(.inline)
        .toolbar { ToolbarItem(placement:.cancellationAction) { Button("Done") { if file != nil && content != original { showDiscard = true } else { dismiss() } } }; ToolbarItem(placement:.topBarTrailing) { Button { sideChat=true } label:{ Image(systemName:"bubble.left.and.bubble.right") }.accessibilityLabel("Side chat") } }
        .task { load() }.onChange(of:choice) { _,_ in content="";file=nil;load() }
        .confirmationDialog("Discard unsaved changes?",isPresented:$showDiscard) { Button("Discard changes",role:.destructive) { file=nil;content=original } }
        .sheet(isPresented:$sideChat) { RemoteSideChat(project:project) }
        .interactiveDismissDisabled(file != nil && content != original)
    }
  }
  private func output(_ data: Data) throws -> String { (try JSONSerialization.jsonObject(with:data) as? [String:Any])?["output"] as? String ?? "" }
  private func run(_ operation: @escaping () async throws -> Void) {
    guard !busy else { return };busy=true;error=nil
    Task { defer { busy=false };do { try await operation() } catch { self.error=error.localizedDescription } }
  }
  private func load() {
    run {
      if choice == "Files" { entries=try output(await store.workspace("list",extras:["path":path])).split(separator:"\n").map(String.init) }
      if choice == "Review" { content=try output(await store.workspace("review")) }
      if choice == "Memory" {
        let notes=try JSONSerialization.jsonObject(with:await store.memory()) as? [[String:Any]] ?? []
        content=notes.map { "# \($0["topic"] ?? "Note")\n\($0["note"] ?? "")\n" }.joined(separator:"\n")
      }
    }
  }
  private func read(_ path: String) {
    run {
      let raw=try output(await store.workspace("read",extras:["path":path]));let value=try JSONSerialization.jsonObject(with:Data(raw.utf8)) as? [String:Any]
      content=value?["content"] as? String ?? "";original=content;sha=value?["sha256"] as? String ?? "";file=path
    }
  }
}
struct RemoteSideChat: View {
  @StateObject private var store=RemoteStore()
  @Environment(\.scenePhase) private var phase
  var project: Project?
  var body: some View {
    NavigationStack { MobileChat(project:project).environmentObject(store) }
      .task(id:phase) { guard phase == .active else { return };while !Task.isCancelled { await store.refresh();do { try await Task.sleep(for:.seconds(2)) } catch { return } } }
  }
}
