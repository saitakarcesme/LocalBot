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
    print("Message formatting checks passed")
  }
}
