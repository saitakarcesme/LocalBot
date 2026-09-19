import SwiftUI
import SwiftTerm

struct PhoneTerminal: View {
  @EnvironmentObject private var store: RemoteStore
  @Environment(\.scenePhase) private var phase
  @StateObject private var terminal = PhoneTerminalSession()
  var body: some View {
    VStack(spacing: 8) {
      HStack {
        Text(terminal.closed ? "Session ended" : "Terminal on your Mac").font(.caption).foregroundStyle(.secondary)
        Spacer()
        Button("Ctrl-C") { terminal.input(Data([3])) }.disabled(terminal.closed)
        Button("Keyboard") { terminal.view?.becomeFirstResponder() }
      }.font(.caption).padding(.horizontal)
      if let error = terminal.error {
        HStack { Text(error).font(.caption).foregroundStyle(.red); Button("Retry") { terminal.error = nil; terminal.flush() } }.padding(.horizontal)
      }
      PhoneTerminalSurface(session: terminal).padding(.horizontal, 12).padding(.bottom, 8)
    }
    .task(id: phase) { guard phase == .active else { return }; await terminal.run(store: store, conversation: store.selected) }
    .onDisappear { terminal.close() }
  }
}

@MainActor final class PhoneTerminalSession: ObservableObject {
  @Published var error: String?
  @Published var closed = false
  weak var view: TerminalView?
  private var store: RemoteStore?
  private var session: String?
  private var offset = 0
  private var sequence = 0
  private var pending = Data()
  private var sending = false
  private var disposed = false
  private var size = (cols: 80, rows: 24)
  private var resizeTask: Task<Void,Never>?
  private func call(_ body: [String:Any]) async throws -> [String:Any] {
    guard let store else { throw RemoteError("Terminal is not connected.") }
    var request = body; if let session { request["session"] = session }
    return try JSONSerialization.jsonObject(with: await store.terminal(request)) as? [String:Any] ?? [:]
  }
  func run(store: RemoteStore, conversation: String?) async {
    self.store = store
    do {
      if session == nil {
        guard let conversation else { throw RemoteError("Send a message before opening this terminal.") }
        let result = try await call(["action":"open","conversationId":conversation])
        guard let id = result["session"] as? String else { throw RemoteError("Could not open the terminal.") }
        session = id
        if disposed { close(); return }
        _ = try await call(["action":"resize","cols":size.cols,"rows":size.rows])
      }
      while !Task.isCancelled && !disposed && !closed {
        do {
          let result = try await call(["action":"poll","offset":offset])
          if result["reset"] as? Bool == true { view?.feed(text:"\u{1b}c[Older terminal output was discarded]\r\n") }
          if let encoded = result["data"] as? String, let bytes = Data(base64Encoded:encoded) { view?.feed(byteArray:Array(bytes)[...]) }
          offset = result["offset"] as? Int ?? offset
          closed = result["closed"] as? Bool ?? false
          if let message = result["error"] as? String { error = message }
          try await Task.sleep(for:.milliseconds(250))
        } catch {
          if Task.isCancelled { return }; self.error = error.localizedDescription
          try await Task.sleep(for:.seconds(2))
        }
      }
    } catch { if !Task.isCancelled { self.error = error.localizedDescription } }
  }
  func input(_ data: Data) {
    guard session != nil, !closed, !disposed else { return }
    guard pending.count + data.count <= 16000 else { error = "Input buffer is full. Wait for the connection."; return }
    pending.append(data); flush()
  }
  func flush() {
    guard !sending, !pending.isEmpty, session != nil, !disposed else { return }
    sending = true
    Task {
      defer { sending = false }
      try? await Task.sleep(for:.milliseconds(40))
      while !pending.isEmpty && !disposed {
        let batch = pending
        do {
          _ = try await call(["action":"input","sequence":sequence,"data":batch.base64EncodedString()])
          pending.removeFirst(batch.count); sequence += 1; error = nil
        } catch { self.error = error.localizedDescription; return }
      }
    }
  }
  func resize(cols:Int, rows:Int) {
    size = (min(500,max(2,cols)),min(300,max(2,rows)))
    resizeTask?.cancel()
    guard session != nil, !disposed else { return }
    resizeTask = Task {
      do { try await Task.sleep(for:.milliseconds(150)); _ = try await call(["action":"resize","cols":size.cols,"rows":size.rows]) } catch {}
    }
  }
  func close() {
    disposed = true; resizeTask?.cancel()
    guard session != nil else { return }
    Task { _ = try? await call(["action":"close"]); session = nil; closed = true }
  }
}

struct PhoneTerminalSurface: UIViewRepresentable {
  let session: PhoneTerminalSession
  func makeCoordinator() -> Coordinator { Coordinator(session) }
  func makeUIView(context: Context) -> TerminalView {
    let view = TerminalView(frame:.zero)
    view.font = .monospacedSystemFont(ofSize:12, weight:.regular)
    view.nativeBackgroundColor = .systemBackground
    view.nativeForegroundColor = .label
    view.terminalDelegate = context.coordinator
    session.view = view
    return view
  }
  func updateUIView(_ view: TerminalView, context: Context) {}
  final class Coordinator: NSObject, TerminalViewDelegate {
    let session: PhoneTerminalSession
    init(_ session: PhoneTerminalSession) { self.session = session }
    func send(source: TerminalView, data: ArraySlice<UInt8>) { session.input(Data(data)) }
    func sizeChanged(source: TerminalView, newCols: Int, newRows: Int) { session.resize(cols:newCols,rows:newRows) }
    func setTerminalTitle(source: TerminalView, title: String) {}
    func hostCurrentDirectoryUpdate(source: TerminalView, directory: String?) {}
    func scrolled(source: TerminalView, position: Double) {}
    func requestOpenLink(source: TerminalView, link: String, params: [String:String]) {}
    func bell(source: TerminalView) {}
    func clipboardCopy(source: TerminalView, content: Data) {}
    func iTermContent(source: TerminalView, content: ArraySlice<UInt8>) {}
    func rangeChanged(source: TerminalView, startY: Int, endY: Int) {}
  }
}
