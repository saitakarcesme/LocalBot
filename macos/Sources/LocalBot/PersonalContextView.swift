import SwiftUI

struct PersonalContextRecord: Codable { var text: String; var revision: Int }
struct PersonalContextView: View {
  @Environment(\.dismiss) private var dismiss
  var load: () async throws -> Data
  var save: ([String: Any]) async throws -> Data
  @State private var record = PersonalContextRecord(text: "", revision: 0)
  @State private var ready = false
  @State private var busy = false
  @State private var error: String?
  @State private var saved = false
  var body: some View {
    VStack(alignment: .leading, spacing: 18) {
      HStack { Label("Personal context", systemImage: "person.text.rectangle").font(.title2.bold()); Spacer(); Button("Done") { dismiss() } }
      Text("Your background, preferences, projects and important details.").font(.callout).foregroundStyle(.secondary)
      TextEditor(text: $record.text).font(.body).scrollContentBackground(.hidden).padding(12)
        .frame(minHeight: 220).background(.thinMaterial, in: RoundedRectangle(cornerRadius: 20))
        .accessibilityLabel("Personal facts and preferences").disabled(!ready || busy)
        .onChange(of: record.text) { _, _ in saved = false }
      Label("Shared with your connected local models", systemImage: "desktopcomputer").font(.caption).foregroundStyle(.secondary)
      Text("Passwords stay in Keychain. This context is stored on your Mac; existing chats and shared memories remain separate.").font(.caption).foregroundStyle(.secondary)
      if let error { Text(error).font(.callout).foregroundStyle(.red).textSelection(.enabled) }
      HStack { Button("Reload") { Task { await refresh() } }.disabled(busy); Spacer(); if saved { Label("Saved", systemImage: "checkmark").font(.caption).foregroundStyle(.secondary) }; Button("Save context") { Task { busy = true; defer { busy = false }; do { record = try JSONDecoder().decode(PersonalContextRecord.self, from: await save(["text":record.text,"revision":record.revision])); saved = true; error = nil } catch { self.error = error.localizedDescription } } }.buttonStyle(.borderedProminent).disabled(!ready || busy || record.text.count > 30000) }
    }.padding(24).frame(idealWidth: 560, minHeight: 420)
      .task { await refresh() }
  }
  private func refresh() async { busy = true; defer { busy = false }; do { record = try JSONDecoder().decode(PersonalContextRecord.self, from: await load()); ready = true; error = nil } catch { self.error = error.localizedDescription } }
}
