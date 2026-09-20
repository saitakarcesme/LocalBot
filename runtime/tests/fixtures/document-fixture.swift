import Foundation
import AppKit
import PDFKit
let destination=CommandLine.arguments[1]
let data=NSMutableData()
let consumer=CGDataConsumer(data:data)!
var rect=CGRect(x:0,y:0,width:612,height:792)
let context=CGContext(consumer:consumer,mediaBox:&rect,nil)!
context.beginPDFPage(nil)
NSGraphicsContext.saveGraphicsState();NSGraphicsContext.current=NSGraphicsContext(cgContext:context,flipped:false)
("LocalBot document verification: ORBIT-4729" as NSString).draw(at:NSPoint(x:40,y:600),withAttributes:[.font:NSFont.systemFont(ofSize:20)])
NSGraphicsContext.restoreGraphicsState();context.endPDFPage()
let image=NSImage(size:NSSize(width:612,height:792));image.lockFocus();NSColor.white.setFill();NSRect(x:0,y:0,width:612,height:792).fill();("Scanned page verification: MEMORY-8316" as NSString).draw(at:NSPoint(x:40,y:600),withAttributes:[.font:NSFont.systemFont(ofSize:22),.foregroundColor:NSColor.black]);image.unlockFocus()
context.beginPDFPage(nil);context.draw(image.cgImage(forProposedRect:nil,context:nil,hints:nil)!,in:rect);context.endPDFPage();context.closePDF()
try data.write(to:URL(fileURLWithPath:destination))
