import SwiftUI

/// Actual persisted tool events; animation only represents a pending or running action.
struct InlineActionView: View {
  let action: Activity
  @State private var expanded = false
  private var active: Bool { ["pending", "running"].contains(action.status) }
  private var arguments: [String: String] {
    guard let data = action.arguments.data(using: .utf8),
      let value = try? JSONSerialization.jsonObject(with: data) as? [String: String] else { return [:] }
    return value
  }
  private var title: String {
    let detail = arguments["command"] ?? arguments["path"] ?? arguments["query"] ?? arguments["url"] ?? ""
    return action.name.replacingOccurrences(of: "_", with: " ") + (detail.isEmpty ? "" : " · " + detail)
  }
  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      Button { expanded.toggle() } label: {
        HStack(spacing: 8) {
          if active { ProgressView().controlSize(.mini) }
          else { Image(systemName: action.status == "completed" ? "checkmark" : "exclamationmark.circle").foregroundStyle(action.status == "completed" ? Color.secondary : .orange) }
          Text(title).font(.system(size: 11, design: .monospaced)).lineLimit(2).frame(maxWidth: .infinity, alignment: .leading)
          Image(systemName: expanded ? "chevron.down" : "chevron.right").font(.caption2)
        }.contentShape(Rectangle())
      }.buttonStyle(.plain).foregroundStyle(.secondary)
      if active, let output = action.output, !output.isEmpty {
        Text(String(output.suffix(1200))).font(.system(size: 10, design: .monospaced)).lineLimit(6).textSelection(.enabled)
      }
      if expanded {
        ScrollView([.horizontal, .vertical]) {
          VStack(alignment: .leading, spacing: 12) {
            if let command = arguments["command"] { Text(command) }
            if let path = arguments["path"] { Text(path).foregroundStyle(.secondary) }
            if let content = arguments["content"] { Text(String(content.prefix(16000))) }
            else { Text(String(action.arguments.prefix(16000))) }
            if let output = action.output { Text(String(output.suffix(16000))) }
          }.font(.system(size: 11, design: .monospaced)).textSelection(.enabled).frame(maxWidth: .infinity, alignment: .leading)
        }.frame(maxHeight: 220)
        Text(action.status.capitalized).font(.caption2).foregroundStyle(.secondary)
      }
    }.padding(.vertical, 5)
  }
}
