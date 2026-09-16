import Foundation
@main struct CheckFormatting {
  static func main() {
    let source = "Before **bold**\n```swift\nlet x = `value`\n```\nAfter"
    let blocks = messageSections(source)
    precondition(blocks.count == 3 && blocks[1].isCode && blocks[1].language == "swift")
    precondition(blocks[1].text == "let x = `value`")
    precondition(messageSections("````\n```\n````").first?.text == "```")
    precondition(messageSections("~~~text\n  a\n\n b\n~~~").first?.text == "  a\n\n b")
    precondition(messageSections("```js\nunclosed").first?.isCode == true)
    precondition(messageSections("text `inline` here").first?.isCode == false)
    let inline = inlineMessage("**bold** and `code`\nnext line")
    precondition(String(inline.characters) == "bold and code\nnext line")
    precondition(inline.runs.contains { $0.inlinePresentationIntent?.contains(.stronglyEmphasized) == true })
    precondition(inline.runs.contains { $0.inlinePresentationIntent?.contains(.code) == true })
    precondition(!inlineMessage("[bad](file:///tmp/test)").runs.contains { $0.link != nil })
    precondition(inlineMessage("[web](https://example.com)").runs.contains { $0.link?.scheme == "https" })
    precondition(messagePreview(source) == "Before bold let x = `value` After")
    let bare = inlineMessage("Türkçe 🚀 kaynak: https://www.sqlite.org/wal.html.")
    precondition(bare.runs.contains { $0.link?.absoluteString == "https://www.sqlite.org/wal.html" })
    precondition(String(bare.characters) == "Türkçe 🚀 kaynak: https://www.sqlite.org/wal.html.")
    precondition(!inlineMessage("`https://example.com/code`").runs.contains { $0.link != nil })
    let explicit = inlineMessage("[https://example.com/label](https://example.org/actual)")
    precondition(explicit.runs.contains { $0.link?.absoluteString == "https://example.org/actual" })
    precondition(!explicit.runs.contains { $0.link?.host == "example.com" })
    precondition(!inlineMessage("file:///tmp/local user@example.com").runs.contains { $0.link != nil })
    precondition(!inlineMessage("https://user:password@example.com/private").runs.contains { $0.link != nil })
    print("Message formatting checks passed")
  }
}
