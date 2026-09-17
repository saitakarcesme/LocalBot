import SwiftUI

/// Actual persisted tool events; animation only represents a pending or running action.
struct InlineActionView: View {
  let action: Activity
  var initiallyExpanded = false
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
  private func readable(_ value: String) -> String {
    guard let data = value.data(using: .utf8), let object = try? JSONSerialization.jsonObject(with: data),
      let pretty = try? JSONSerialization.data(withJSONObject: object, options: [.prettyPrinted, .sortedKeys, .fragmentsAllowed]),
      let text = String(data: pretty, encoding: .utf8) else { return value }
    return text
  }
  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      Button { withAnimation(.easeInOut(duration: 0.18)) { expanded.toggle() } } label: {
        HStack(spacing: 8) {
          if active { Image(systemName: "sparkle").modifier(ActivityShimmer(active: true)) }
          else { Image(systemName: action.status == "completed" ? "checkmark" : "exclamationmark.circle").foregroundStyle(action.status == "completed" ? Color.secondary : .orange) }
          Text(title).font(.system(size: 11, design: .monospaced)).lineLimit(2).frame(maxWidth: .infinity, alignment: .leading)
          Image(systemName: expanded ? "chevron.down" : "chevron.right").font(.caption2)
        }.contentShape(Rectangle())
      }.buttonStyle(.plain).foregroundStyle(.secondary)
      if active, let output = action.output, !output.isEmpty {
        Text(String(output.suffix(1200))).font(.system(size: 10, design: .monospaced)).lineLimit(6).textSelection(.enabled)
      }
      if expanded || initiallyExpanded {
        ScrollView(.vertical) {
          VStack(alignment: .leading, spacing: 12) {
            if let command = arguments["command"] { Text(command) }
            if let path = arguments["path"] { Text(path).foregroundStyle(.secondary) }
            if let content = arguments["content"] { Text(String(content.prefix(16000))) }
            else { Text(readable(String(action.arguments.prefix(16000)))) }
            if let output = action.output { Text(readable(String(output.suffix(16000)))) }
          }.font(.system(size: 11, design: .monospaced)).textSelection(.enabled).frame(maxWidth: .infinity, alignment: .leading)
        }.frame(maxHeight: 220)
        Text(action.status.capitalized).font(.caption2).foregroundStyle(.secondary)
      }
    }.padding(.vertical, 5)
  }
}


struct ActivityShimmer: ViewModifier {
  var active: Bool
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  func body(content: Content) -> some View {
    if active && !reduceMotion {
      TimelineView(.animation(minimumInterval: 0.08)) { timeline in
        let phase = timeline.date.timeIntervalSinceReferenceDate.truncatingRemainder(dividingBy: 2) / 2
        content.overlay {
          GeometryReader { geometry in
            LinearGradient(colors: [.clear, .white.opacity(0.9), .clear], startPoint: .leading, endPoint: .trailing)
              .frame(width: geometry.size.width * 0.45)
              .offset(x: geometry.size.width * (phase * 1.5 - 0.45))
          }.mask(content)
        }
      }
    } else { content }
  }
}

struct MessageActivityPanel: View {
  let actions: [Activity]
  @State private var expanded = false
  private var active: Bool { actions.contains { ["pending", "running"].contains($0.status) } }
  private var transcript: String {
    actions.map { action in
      let args = (action.arguments.data(using: .utf8).flatMap { try? JSONSerialization.jsonObject(with: $0) }) as? [String: Any] ?? [:]
      let detail = ["command", "path", "query", "url"].compactMap { args[$0] as? String }.joined(separator: " ")
      let content = (args["content"] as? String).map { "\n" + String($0.prefix(16000)) } ?? ""
      return "$ " + action.name + (detail.isEmpty ? "" : " " + detail) + content
        + (action.output.map { "\n" + String($0.suffix(16000)) } ?? "") + "\n[" + action.status + "]"
    }.joined(separator: "\n\n")
  }
  var body: some View {
    Button { expanded.toggle() } label: {
      HStack(spacing: 8) {
        Image(systemName: "terminal")
        Text(active ? "Working · " + (actions.last?.name ?? "") : "\(actions.count) actions")
          .lineLimit(1).truncationMode(.tail).modifier(ActivityShimmer(active: active))
        Spacer(minLength: 0)
        Image(systemName: "chevron.up").font(.system(size: 9))
      }.font(.system(size: 11, weight: .medium)).padding(.horizontal, 12)
        .frame(width: 256, height: 32).contentShape(Rectangle())
        .background(.quaternary.opacity(0.4), in: RoundedRectangle(cornerRadius: 10))
    }.buttonStyle(.plain).foregroundStyle(.secondary)
      .popover(isPresented: $expanded, arrowEdge: .bottom) {
        VStack(spacing: 0) {
          HStack {
            Label(active ? "Live activity" : "Activity", systemImage: "terminal")
              .modifier(ActivityShimmer(active: active))
            Spacer()
            Button { expanded = false } label: { Image(systemName: "xmark") }.buttonStyle(.plain)
          }.font(.caption).padding(12)
          Divider()
          ScrollViewReader { proxy in
            ScrollView([.vertical, .horizontal]) {
              VStack(alignment: .leading, spacing: 0) {
                Text(transcript).font(.system(size: 11, design: .monospaced)).textSelection(.enabled)
                Color.clear.frame(height: 1).id("terminalEnd")
              }.padding(12)
            }.defaultScrollAnchor(.bottom)
              .onChange(of: transcript) { _, _ in if active { proxy.scrollTo("terminalEnd", anchor: .bottom) } }
          }
        }.frame(width: 480, height: 280)
      }
  }
}
