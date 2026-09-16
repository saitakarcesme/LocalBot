import SwiftUI

struct IntegrationsView: View {
  @EnvironmentObject var model: AppModel
  @Environment(\.dismiss) var dismiss
  @State var connection = MCPConnection(id: UUID().uuidString, name: "", endpoint: "http://127.0.0.1:3000/mcp", requiresAuth: false)
  @State var secret = ""
  @State var result = ""
  @State var busy = false
  var body: some View {
    VStack(alignment: .leading, spacing: 16) {
      HStack {
        Text("Integrations").font(.title2.bold())
        Spacer()
        Button("Done") { dismiss() }
      }
      Text("Connect an MCP server, test its real tools, then enable it in a contact's permissions.")
        .font(.callout).foregroundStyle(.secondary)
      HStack {
        Menu("Saved connections") {
          ForEach(model.integrations) { item in
            Button(item.name) { connection = item; secret = ""; result = "" }
          }
        }.disabled(model.integrations.isEmpty)
        Button("New") { connection = MCPConnection(id: UUID().uuidString, name: "", endpoint: "http://127.0.0.1:3000/mcp", requiresAuth: false); secret = ""; result = "" }
      }
      TextField("Connection name", text: $connection.name).textFieldStyle(.roundedBorder)
      TextField("MCP endpoint", text: $connection.endpoint).textFieldStyle(.roundedBorder)
      Text("Streamable HTTP · MCP 2025-11-25, 2025-06-18 and 2025-03-26").font(.caption).foregroundStyle(.secondary)
      Toggle("Requires authentication", isOn: $connection.requiresAuth)
      if connection.requiresAuth {
        SecureField("Access token — stored in Keychain", text: $secret).textFieldStyle(.roundedBorder)
        Text("Leave blank to keep the saved token for this endpoint.").font(.caption).foregroundStyle(.secondary)
      }
      HStack {
        Button("Save & Test") { Task { await testConnection() } }
          .buttonStyle(.borderedProminent).disabled(busy || connection.name.isEmpty)
        if busy { ProgressView().controlSize(.small) }
      }
      ScrollView { Text(result).font(.system(.caption, design: .monospaced)).textSelection(.enabled).frame(maxWidth: .infinity, alignment: .leading) }
        .frame(minHeight: 160)
    }.padding(24).frame(width: 540)
  }
  func testConnection() async {
    busy = true
    defer { busy = false }
    do {
      let data = try JSONEncoder().encode(connection)
      let body = try JSONSerialization.jsonObject(with: data) as! [String: Any]
      _ = try await model.request("/integrations", body: body)
      let key = "mcp:" + connection.id + "@" + connection.endpoint
      if !secret.isEmpty { try Keychain.save(secret, id: key) }
      if let token = Keychain.read(key) {
        _ = try await model.request("/integrations/credentials", body: ["id": connection.id, "secret": token])
      }
      let response = try await model.request("/integrations/test", body: ["id": connection.id])
      let object = try JSONSerialization.jsonObject(with: response) as? [String: Any]
      let tools = object?["tools"] as? [[String: Any]] ?? []
      result = "\(tools.count) tools discovered\n\n" + tools.compactMap { $0["name"] as? String }.joined(separator: "\n")
      await model.refresh()
    } catch { result = error.localizedDescription }
  }
}
