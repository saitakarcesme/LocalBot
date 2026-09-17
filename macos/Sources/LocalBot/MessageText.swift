import SwiftUI

struct MessageText: View {
  @AppStorage("messageFontSize") private var messageFontSize = 14.0
  var content: String
  var formatted: Bool
  var body: some View {
    if formatted {
      VStack(alignment: .leading, spacing: 8) {
        ForEach(messageSections(content)) { section in
          if section.isCode {
            VStack(alignment: .leading, spacing: 5) {
              HStack {
                if let language = section.language { Text(language).font(.caption2).foregroundStyle(.secondary) }
                Spacer(minLength: 8)
                Button {
                  NSPasteboard.general.clearContents()
                  NSPasteboard.general.setString(section.text, forType: .string)
                } label: { Image(systemName: "doc.on.doc") }
                  .buttonStyle(.plain).help("Copy code").accessibilityLabel("Copy code")
              }
              ScrollView(.horizontal) {
                Text(verbatim: section.text).font(.system(size: 12, design: .monospaced))
                  .fixedSize(horizontal: true, vertical: true).textSelection(.enabled)
              }
            }.padding(9).background(.black.opacity(0.08), in: RoundedRectangle(cornerRadius: 8))
          } else {
            HoverMessageText(content: section.text, fontSize: messageFontSize)
          }
        }
      }
    } else {
      Text(verbatim: content).font(.system(size: messageFontSize)).textSelection(.enabled)
    }
  }
}
