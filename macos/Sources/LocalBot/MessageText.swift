import SwiftUI

struct MessageText: View {
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
            HoverMessageText(content: section.text)
          }
        }
      }
    } else {
      Text(verbatim: content).textSelection(.enabled)
    }
  }
}
