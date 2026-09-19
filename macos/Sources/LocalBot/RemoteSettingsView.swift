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
        Label("iPhone Remote", systemImage: "iphone").font(.headline)
        Spacer()
        if busy { ProgressView().controlSize(.small) }
        Button(status?.enabled == true ? "Disconnect" : "Enable Remote") {
          perform(status?.enabled == true ? "/remote/stop" : "/remote/start")
        }.disabled(busy)
      }
      Text("Scan a pairing code in LocalBot Remote on your iPhone. Paired phones can read chats, edit workspace files, approve actions, and run terminals on this Mac. Different networks are supported. Keep this Mac awake and LocalBot open.")
        .font(.caption).foregroundStyle(.secondary)
      if status?.enabled == true {
        if status?.preview == true {
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
