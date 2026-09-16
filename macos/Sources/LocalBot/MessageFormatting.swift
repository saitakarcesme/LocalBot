import Foundation

struct MessageSection: Identifiable, Equatable {
  var id: Int
  var text: String
  var language: String?
  var isCode: Bool
}

/// Keep code verbatim. Only standalone backtick/tilde fences delimit code sections.
func messageSections(_ source: String) -> [MessageSection] {
  var sections: [MessageSection] = []
  var lines: [String] = []
  var fence: Character?
  var fenceLength = 0
  var language: String?
  func append(_ code: Bool) {
    if !lines.isEmpty {
      sections.append(MessageSection(id: sections.count, text: lines.joined(separator: "\n"), language: language, isCode: code))
      lines.removeAll()
    }
  }
  for line in source.components(separatedBy: "\n") {
    let trimmed = line.trimmingCharacters(in: .whitespaces)
    let indentation = line.prefix(while: { $0 == " " }).count
    if let active = fence {
      let count = trimmed.prefix(while: { $0 == active }).count
      if indentation <= 3 && count >= fenceLength && trimmed.dropFirst(count).isEmpty {
        append(true); fence = nil; language = nil
      } else { lines.append(line) }
    } else if indentation <= 3, let first = trimmed.first, first == "`" || first == "~" {
      let count = trimmed.prefix(while: { $0 == first }).count
      let suffix = String(trimmed.dropFirst(count)).trimmingCharacters(in: .whitespaces)
      if count >= 3 && !(first == "`" && suffix.contains("`")) {
        append(false); fence = first; fenceLength = count
        language = suffix.isEmpty ? nil : String(suffix.prefix(40))
      } else { lines.append(line) }
    } else { lines.append(line) }
  }
  append(fence != nil)
  return sections
}

func inlineMessage(_ source: String) -> AttributedString {
  var text = (try? AttributedString(markdown: source, options: .init(interpretedSyntax: .inlineOnlyPreservingWhitespace))) ?? AttributedString(source)
  // Model-supplied custom schemes must not launch local apps; credentials must not travel in links.
  let links = text.runs.compactMap { run -> (Range<AttributedString.Index>, URL)? in
    guard let link = run.link else { return nil }
    return (run.range, link)
  }
  for (range, link) in links where !["https", "http"].contains(link.scheme?.lowercased() ?? "") || link.user != nil || link.password != nil {
    text[range].link = nil
  }
  return text
}

func messagePreview(_ source: String) -> String {
  messageSections(source).map { section in
    section.isCode ? section.text : String(inlineMessage(section.text).characters)
  }.joined(separator: " ").components(separatedBy: .whitespacesAndNewlines)
    .filter { !$0.isEmpty }.joined(separator: " ")
}
