import AppKit
let image = NSImage(size: NSSize(width: 600, height: 300))
image.lockFocus()
NSColor.white.setFill();NSRect(x: 0, y: 0, width: 600, height: 300).fill()
NSColor.systemBlue.setFill();NSBezierPath(ovalIn: NSRect(x: 40, y: 100, width: 100, height: 100)).fill()
NSColor.systemOrange.setFill();NSRect(x: 210, y: 100, width: 90, height: 90).fill();NSRect(x: 350, y: 100, width: 90, height: 90).fill()
("7419" as NSString).draw(at: NSPoint(x: 205, y: 225), withAttributes: [.font: NSFont.boldSystemFont(ofSize: 40), .foregroundColor: NSColor.black])
image.unlockFocus()
let bitmap = NSBitmapImageRep(data: image.tiffRepresentation!)!
try bitmap.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: CommandLine.arguments[1]))
