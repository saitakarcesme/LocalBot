import SwiftUI

/// Public execution events, presented like a CLI session rather than an unbounded log dump.
struct ActivityFeed: View {
  let actions: [Activity]
  var footer = ""
  @State private var following = true
  var body: some View {
    ScrollViewReader { proxy in
      VStack(spacing: 0) {
        ScrollView {
          LazyVStack(alignment: .leading, spacing: 18) {
            if actions.isEmpty { Text("Activity will appear here when your agent starts working.").foregroundStyle(.secondary).padding(.vertical, 24) }
            ForEach(actions) { action in ActivityEventRow(action: action) }
            if !footer.isEmpty { Text(footer).font(.system(size: 10, design: .monospaced)).foregroundStyle(.secondary).textSelection(.enabled) }
            Color.clear.frame(height: 1).id("tail")
          }.padding(16).frame(maxWidth: .infinity, alignment: .leading)
        }
        HStack {
          Spacer()
          Button { following.toggle(); if following { proxy.scrollTo("tail", anchor: .bottom) } } label: {
            Label(following ? "Following live" : "Follow live", systemImage: following ? "arrow.down.to.line" : "pause")
          }.buttonStyle(PanelButtonStyle()).font(.caption2).foregroundStyle(.secondary).padding(8)
        }
      }.onAppear { if following { proxy.scrollTo("tail", anchor: .bottom) } }
        .onChange(of: actions) { _, _ in if following { proxy.scrollTo("tail", anchor: .bottom) } }
    }
  }
}
struct ActivityEventRow: View {
  let action: Activity
  @State private var expanded = false
  private var active: Bool { ["running", "pending"].contains(action.status) }
  private var failed: Bool { ["failed", "error", "denied"].contains(action.status) }
  private var arguments: [String: Any] {
    (action.arguments.data(using: .utf8).flatMap { try? JSONSerialization.jsonObject(with: $0) }) as? [String: Any] ?? [:]
  }
  private var detail: String {
    ["command", "path", "query", "url", "question"].compactMap { arguments[$0] as? String }.joined(separator: " ")
  }
  private var output: String { action.output.map(ActivityText.terminalOutput) ?? "" }
  var body: some View {
    VStack(alignment: .leading, spacing: 7) {
      Button { expanded.toggle() } label: {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
          Text(active ? "✦" : failed ? "!" : "•").foregroundStyle(failed ? Color.orange : active ? .accentColor : .secondary)
            .modifier(ActivityShimmer(active: active))
          Text(action.name == "thinking" ? "Thinking" : action.name.replacingOccurrences(of: "_", with: " ").capitalized)
            .fontWeight(.medium)
          Spacer(minLength: 4)
          Text(active ? "running" : action.status).font(.system(size: 9)).foregroundStyle(.secondary)
          Image(systemName: expanded ? "chevron.down" : "chevron.right").font(.system(size: 8))
        }.contentShape(Rectangle())
      }.buttonStyle(PanelButtonStyle())
      if !detail.isEmpty {
        Text(detail).font(.system(size: 11, design: .monospaced)).foregroundStyle(.secondary).lineLimit(expanded ? nil : 3).textSelection(.enabled).padding(.leading, 18)
      }
      if expanded {
        TranscriptView(text: ActivityText.transcript([action])).frame(height: 220).padding(.leading, 12)
      } else if !output.isEmpty {
        Text(ActivityPreview.make(output)).font(.system(size: 11, design: action.name == "thinking" ? .default : .monospaced))
          .foregroundStyle(.secondary).lineLimit(4).textSelection(.enabled).padding(.leading, 18)
      }
    }.font(.system(size: 12)).frame(maxWidth: .infinity, alignment: .leading)
  }
}
enum ActivityPreview {
  static func make(_ output: String) -> String {
    let lines = output.prefix(1200).split(separator: "\n", omittingEmptySubsequences: true).prefix(4)
    let text = lines.map { String($0.prefix(180)) }.joined(separator: "\n")
    return text + (text.utf8.count < output.utf8.count ? " …" : "")
  }
}
