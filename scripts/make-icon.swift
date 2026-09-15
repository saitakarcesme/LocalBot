import AppKit
let directory = CommandLine.arguments[1]
try FileManager.default.createDirectory(atPath: directory, withIntermediateDirectories: true)
for size in [16, 32, 128, 256, 512] {
    for scale in [1, 2] {
        let pixels = size * scale
        let image = NSImage(size: NSSize(width: pixels, height: pixels))
        image.lockFocus()
        let full = NSRect(x: 0, y: 0, width: pixels, height: pixels)
        let inset = full.insetBy(dx: CGFloat(pixels) * 0.055, dy: CGFloat(pixels) * 0.055)
        let shape = NSBezierPath(roundedRect: inset, xRadius: CGFloat(pixels) * 0.21, yRadius: CGFloat(pixels) * 0.21)
        NSGradient(starting: NSColor(calibratedRed: 0.12, green: 0.70, blue: 1, alpha: 1), ending: NSColor(calibratedRed: 0.03, green: 0.32, blue: 0.94, alpha: 1))!.draw(in: shape, angle: -90)
        if let symbol = NSImage(systemSymbolName: "bubble.left.and.bubble.right.fill", accessibilityDescription: nil)?.withSymbolConfiguration(.init(paletteColors: [.white])) {
            symbol.draw(in: full.insetBy(dx: CGFloat(pixels) * 0.22, dy: CGFloat(pixels) * 0.22))
        }
        image.unlockFocus()
        let bitmap = NSBitmapImageRep(data: image.tiffRepresentation!)!
        let name = "icon_\(size)x\(size)\(scale == 2 ? "@2x" : "").png"
        try bitmap.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: directory).appendingPathComponent(name))
    }
}
