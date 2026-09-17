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
  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      Button { withAnimation(.easeInOut(duration: 0.2)) { expanded.toggle() } } label: {
        HStack(spacing: 7) {
          Image(systemName: active ? "sparkle" : "checkmark.circle")
          Text(active ? "Working · " + (actions.last?.name.replacingOccurrences(of: "_", with: " ") ?? "") : "\(actions.count) action\(actions.count == 1 ? "" : "s")")
            .font(.system(size: 11, weight: .medium)).modifier(ActivityShimmer(active: active))
          Spacer()
          Image(systemName: expanded ? "chevron.up" : "chevron.down").font(.caption2)
        }.padding(.horizontal, 12).padding(.vertical, 9).contentShape(Rectangle())
      }.buttonStyle(.plain).foregroundStyle(.secondary)
      if expanded {
        ScrollViewReader { proxy in
          ScrollView {
            VStack(alignment: .leading, spacing: 8) {
              ForEach(actions) { action in InlineActionView(action: action, initiallyExpanded: true) }
              Color.clear.frame(height: 1).id("activityEnd")
            }.padding(10)
          }.frame(height: 240)
            .defaultScrollAnchor(.bottom)
            .onChange(of: actions.last?.output) { _, _ in if active { proxy.scrollTo("activityEnd", anchor: .bottom) } }
        }
      }
    }.background(.quaternary.opacity(0.4), in: RoundedRectangle(cornerRadius: 12))
      .overlay(RoundedRectangle(cornerRadius: 12).stroke(.quaternary, lineWidth: 0.5))
  }
}
