import AppKit
let directory = CommandLine.arguments[1]
try FileManager.default.createDirectory(atPath: directory, withIntermediateDirectories: true)
for size in [16, 32, 128, 256, 512] {
    for scale in [1, 2] {
        let pixels = size * scale
        let image = NSImage(size: NSSize(width: pixels, height: pixels))
        image.lockFocus()
        let full = NSRect(x: 0, y: 0, width: pixels, height: pixels)
        // macOS does not mask .icns artwork: retain transparent space around
        // the rounded tile instead of drawing an opaque edge-to-edge square.
        NSColor.clear.setFill()
        full.fill(using: .copy)
        let tile = full.insetBy(dx: CGFloat(pixels) * 0.08, dy: CGFloat(pixels) * 0.08)
        let radius = tile.width * 0.225
        NSBezierPath(roundedRect: tile, xRadius: radius, yRadius: radius).addClip()
        let artwork = NSImage(contentsOfFile: "macos/Sources/LocalBot/Resources/LocalBotMark.png")!
        artwork.draw(in: tile)
        image.unlockFocus()
        let bitmap = NSBitmapImageRep(data: image.tiffRepresentation!)!
        let name = "icon_\(size)x\(size)\(scale == 2 ? "@2x" : "").png"
        try bitmap.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: directory).appendingPathComponent(name))
    }
}
