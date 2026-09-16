import SwiftUI

struct IntegrationsView: View {
  @EnvironmentObject var model: AppModel
  @Environment(\.dismiss) var dismiss
  @State var connection = MCPConnection(id: UUID().uuidString, name: "", endpoint: "http://127.0.0.1:3000/mcp", requiresAuth: false)
  @State var secret = ""
  @State var result = ""
  @State var busy = false
  @State var command = ""
  @State var arguments = "[]"
  @State var directory = ""
  var body: some View {
    VStack(alignment: .leading, spacing: 16) {
      HStack {
        Text("Integrations").font(.title2.bold())
        Spacer()
        Button("Done") { dismiss() }
      }
      Text("Connect an MCP server, discover its tools and resources, then enable it in a contact's permissions.")
        .font(.callout).foregroundStyle(.secondary)
      HStack {
        Menu("Saved connections") {
          ForEach(model.integrations) { item in
            Button(item.name) { connection = item; secret = ""; result = ""; command = item.process?.command ?? ""; directory = item.process?.cwd ?? ""; arguments = String(data: (try? JSONEncoder().encode(item.process?.args ?? [])) ?? Data(), encoding: .utf8) ?? "[]" }
          }
        }.disabled(model.integrations.isEmpty)
        Button("New") { connection = MCPConnection(id: UUID().uuidString, name: "", endpoint: "http://127.0.0.1:3000/mcp", requiresAuth: false); secret = ""; result = "" }
      }
      TextField("Connection name", text: $connection.name).textFieldStyle(.roundedBorder)
      Picker("Connection", selection: Binding(get: { connection.transport ?? "http" }, set: { connection.transport = $0; connection.requiresAuth = false; secret = "" })) {
        Text("HTTP server").tag("http")
        Text("Local process (stdio)").tag("stdio")
      }.pickerStyle(.segmented)
      if connection.transport == "stdio" {
        TextField("Executable — absolute path", text: $command).textFieldStyle(.roundedBorder)
        TextField("Arguments — JSON array", text: $arguments).textFieldStyle(.roundedBorder)
        TextField("Working directory — absolute path", text: $directory).textFieldStyle(.roundedBorder)
        Text("Save & Test runs this executable with your account's access. Use a trusted, already-installed MCP server. Agent launches require approval. Shell expansion and inherited credentials are disabled.").font(.caption).foregroundStyle(.secondary)
      } else {
      TextField("MCP endpoint", text: $connection.endpoint).textFieldStyle(.roundedBorder)
      Text("Streamable HTTP · MCP 2025-11-25, 2025-06-18 and 2025-03-26").font(.caption).foregroundStyle(.secondary)
      Toggle("Requires authentication", isOn: $connection.requiresAuth)
      if connection.requiresAuth {
        SecureField("Access token — stored in Keychain", text: $secret).textFieldStyle(.roundedBorder)
        Text("Leave blank to keep the saved token for this endpoint.").font(.caption).foregroundStyle(.secondary)
      }
      }
      HStack {
        Button("Save & Test") { Task { await testConnection() } }
          .buttonStyle(.borderedProminent).disabled(busy || connection.name.isEmpty)
        if busy { ProgressView().controlSize(.small) }
        Spacer()
        if model.integrations.contains(where: { $0.id == connection.id }) {
          Button("Remove") {
            Task {
              await model.post("/integrations/delete", ["id": connection.id])
              if model.error == nil {
                try? Keychain.save("", id: "mcp:" + connection.id + "@" + connection.endpoint)
                connection = MCPConnection(id: UUID().uuidString, name: "", endpoint: "http://127.0.0.1:3000/mcp", requiresAuth: false)
                secret = ""; result = ""
              }
            }
          }.disabled(busy)
        }
      }
      ScrollView { Text(result).font(.system(.caption, design: .monospaced)).textSelection(.enabled).frame(maxWidth: .infinity, alignment: .leading) }
        .frame(minHeight: 160)
    }.padding(24).frame(width: 540)
  }
  func testConnection() async {
    busy = true
    defer { busy = false }
    do {
      if connection.transport == "stdio" {
        let parsed = try JSONDecoder().decode([String].self, from: Data(arguments.utf8))
        connection.process = MCPProcess(command: command, args: parsed, cwd: directory)
        connection.requiresAuth = false
        connection.endpoint = ""
      } else { connection.process = nil }
      let data = try JSONEncoder().encode(connection)
      let body = try JSONSerialization.jsonObject(with: data) as! [String: Any]
      _ = try await model.request("/integrations", body: body)
      let key = "mcp:" + connection.id + "@" + connection.endpoint
      if !secret.isEmpty { try Keychain.save(secret, id: key) }
      if connection.transport != "stdio", let token = Keychain.read(key) {
        _ = try await model.request("/integrations/credentials", body: ["id": connection.id, "secret": token])
      }
      let response = try await model.request("/integrations/test", body: ["id": connection.id])
      let object = try JSONSerialization.jsonObject(with: response) as? [String: Any]
      let tools = object?["tools"] as? [[String: Any]] ?? []
      let resourcePage = object?["resources"] as? [String: Any] ?? [:]
      let templatePage = object?["templates"] as? [String: Any] ?? [:]
      let resources = resourcePage["resources"] as? [[String: Any]] ?? []
      let templates = templatePage["resourceTemplates"] as? [[String: Any]] ?? []
      let more = resourcePage["nextCursor"] != nil || templatePage["nextCursor"] != nil
      result = "\(tools.count) tools · \(resources.count) resources · \(templates.count) templates\n"
        + (more ? "More resource pages are available to agents.\n" : "")
        + "\n" + (tools + resources + templates).compactMap { $0["name"] as? String }.joined(separator: "\n")
      await model.refresh()
    } catch { result = error.localizedDescription }
  }
}
