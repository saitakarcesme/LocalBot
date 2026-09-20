import SwiftUI
import CoreImage.CIFilterBuiltins

struct RemoteSettingsView: View {
  @EnvironmentObject var model: AppModel
  @State private var status: Status?
  @State private var code: String?
  @State private var qr: NSImage?
  @State private var busy = false
  @State private var error: String?
  struct Device: Decodable, Identifiable { let id: String; let name: String; let paired: Bool }
  struct Status: Decodable { let enabled: Bool; let preview: Bool; let persistentPairing: Bool?; let devices: [Device]; let code: String? }
  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      HStack {
        Label("Workspace host", systemImage: "desktopcomputer").font(.headline)
        Spacer()
        Menu(model.workspaceProviderId == nil ? "This Mac" : "Model PC") {
          Button("This Mac") { switchHost(nil) }
          ForEach(model.centerConnections) { provider in Button(provider.name) { switchHost(provider.id) } }
        }.disabled(busy)
      }
      if let host=model.workspaceProviderId {
        Button("Sync Mac conversation history") {Task {busy=true;defer{busy=false};do {_ = try await model.request("/workspace-host/sync-history",body:["providerId":host]);await model.refresh();error=nil}catch{self.error=error.localizedDescription}}}.disabled(busy)
        Text("Copies missing conversations and project history. Project files remain on this Mac.").font(.caption).foregroundStyle(.secondary)
      }
      Text(model.workspaceProviderId == nil ? "Choose a model PC with Workspace host enabled to work while this Mac is off. Mac-only projects stay on this Mac." : "Conversations live on the model PC. Your Mac and iPhone reconnect to the same workspace.")
        .font(.caption).foregroundStyle(.secondary)
      HStack {
        Label("iPhone Remote", systemImage: "iphone").font(.headline)
        Spacer()
        if busy { ProgressView().controlSize(.small) }
        Button(status?.enabled == true ? "Disconnect" : "Enable Remote") {
          perform(status?.enabled == true ? "/remote/stop" : "/remote/start")
        }.disabled(busy)
      }
      Text(model.workspaceProviderId == nil ? "Scan the code in LocalBot Remote. Keep this Mac awake for Mac-hosted conversations." : "Scan a new code to connect your iPhone directly to the model PC. Keep that PC and Center running; this Mac can be off.")
        .font(.caption).foregroundStyle(.secondary)
      if status?.enabled == true {
        if status?.preview == true && model.workspaceProviderId == nil {
          Text(status?.persistentPairing == true ? "Preview service. Paired phones reconnect when LocalBot is running. Keep this Mac awake." : "Preview connection: after restarting LocalBot, enable Remote and pair your phone again.")
            .font(.caption).foregroundStyle(.secondary)
        }
        HStack(alignment: .center, spacing: 18) {
          if let qr { Image(nsImage: qr).interpolation(.none).resizable().frame(width: 170, height: 170).padding(10).background(.white, in: RoundedRectangle(cornerRadius: 16)) }
          VStack(alignment: .leading, spacing: 10) {
            Button(code == nil ? "Show pairing code" : "New pairing code") { perform("/remote/pair") }.disabled(busy)
            if let code {
              Text("Single use · expires in 10 minutes").font(.caption).foregroundStyle(.secondary)
              Button("Copy pairing code") { NSPasteboard.general.clearContents(); NSPasteboard.general.setString(code, forType: .string) }
            }
          }
        }
        ForEach(status?.devices.filter(\.paired) ?? []) { device in
          HStack { Label(device.name, systemImage: "iphone"); Spacer(); Button("Revoke") { perform("/remote/revoke", body: ["id":device.id]) }.disabled(busy) }.font(.callout)
        }
      }
      if let error { Text(error).font(.caption).foregroundStyle(.red).textSelection(.enabled) }
    }.task { await refresh() }
  }
  private func switchHost(_ id: String?) {
    busy = true;error = nil
    Task { defer { busy = false };do { try await model.selectWorkspaceHost(id);code=nil;qr=nil;await refresh() } catch { self.error=error.localizedDescription } }
  }
  private func refresh() async {
    do { status = try JSONDecoder().decode(Status.self, from: await model.request("/remote/status")) }
    catch { self.error = error.localizedDescription }
  }
  private func perform(_ path: String, body: [String:Any] = [:]) {
    busy = true; error = nil
    Task {
      defer { busy = false }
      do {
        let result = try JSONDecoder().decode(Status.self, from: await model.request(path, body: body))
        status = result
        if let code = result.code { self.code = code; qr = makeQR(code) }
        if !result.enabled { code = nil; qr = nil }
      } catch { self.error = error.localizedDescription }
    }
  }
  private func makeQR(_ code: String) -> NSImage? {
    let filter = CIFilter.qrCodeGenerator(); filter.message = Data(code.utf8); filter.correctionLevel = "M"
    guard let output = filter.outputImage,
      let image = CIContext().createCGImage(output.transformed(by: CGAffineTransform(scaleX: 4,y: 4)), from: output.extent.applying(CGAffineTransform(scaleX: 4,y: 4))) else { return nil }
    return NSImage(cgImage: image, size: NSSize(width: image.width, height: image.height))
  }
}
