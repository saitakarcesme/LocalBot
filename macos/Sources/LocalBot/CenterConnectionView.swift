import SwiftUI

struct CenterConnectionView: View {
  @EnvironmentObject var model: AppModel
  @Environment(\.dismiss) private var dismiss
  @State private var code = ""
  @State private var connecting = false
  @State private var useForAll = true
  @State private var error: String?
  var body: some View {
    VStack(alignment: .leading, spacing: 18) {
      Label("Connect another PC", systemImage: "desktopcomputer").font(.title2.bold())
      Text("Open LocalBot Center on the computer running Ollama or your model server. Copy its pairing code and paste it below.")
        .foregroundStyle(.secondary)
      SecureField("LocalBot Center pairing code", text: $code).textFieldStyle(.roundedBorder)
      Text("Your computers can be on different networks. Keep Center running while you use its models.")
        .font(.caption).foregroundStyle(.secondary)
      Toggle("Use this connection for all bots", isOn: $useForAll)
      if let error { Text(error).font(.callout).foregroundStyle(.red).textSelection(.enabled) }
      HStack {
        Button("Cancel") { dismiss() }.disabled(connecting)
        Spacer()
        if connecting { ProgressView().controlSize(.small) }
        Button(connecting ? "Connecting…" : "Connect") { connect() }
          .buttonStyle(.borderedProminent).disabled(connecting || code.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
      }
    }.padding(24).frame(width: 480)
  }
  private func connect() {
    connecting = true; error = nil
    Task {
      defer { connecting = false }
      do {
        struct Result: Decodable { let provider: Provider; let credential: String }
        let result = try JSONDecoder().decode(Result.self, from: await model.request("/center/connect", body: ["code": code, "useForAll": useForAll]))
        try Keychain.save(result.credential, id: result.provider.id + "@" + result.provider.endpoint)
        code = ""
        await model.refresh()
        dismiss()
      } catch { self.error = error.localizedDescription }
    }
  }
}
