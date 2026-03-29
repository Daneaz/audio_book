import AppKit
import CoreText

let outPath = "/Users/eugenewu/code/audio_book/tmp/font-preview-10-small.png"
let sample = "春江潮水连海平，海上明月共潮生。"
let width = 1200
let rowHeight = 90
let padding: CGFloat = 24

struct FontRow { let title: String; let fontName: String; let size: CGFloat }
func registerFont(at path: String) { CTFontManagerRegisterFontsForURL(URL(fileURLWithPath: path) as CFURL, .process, nil) }
registerFont(at: "/Users/eugenewu/code/audio_book/assets/fonts/LXGWWenKai-Regular.ttf")
registerFont(at: "/Users/eugenewu/code/audio_book/assets/fonts/NotoSansCJKsc-Regular.otf")
registerFont(at: "/Users/eugenewu/code/audio_book/assets/fonts/NotoSerifCJKsc-Regular.otf")
let rows:[FontRow] = [
  .init(title:"1. LXGW WenKai", fontName:"LXGWWenKai-Regular", size:28),
  .init(title:"2. Kaiti SC", fontName:"Kaiti SC", size:28),
  .init(title:"3. STKaiti", fontName:"STKaiti", size:28),
  .init(title:"4. Songti SC", fontName:"Songti SC", size:28),
  .init(title:"5. STFangsong", fontName:"STFangsong", size:28),
  .init(title:"6. Hiragino Sans GB", fontName:"Hiragino Sans GB", size:28),
  .init(title:"7. PingFang SC", fontName:"PingFang SC", size:28),
  .init(title:"8. Noto Serif SC", fontName:"NotoSerifSC", size:28),
  .init(title:"9. Noto Sans SC", fontName:"NotoSansSC", size:28),
  .init(title:"10. Menlo", fontName:"Menlo", size:26),
]
let height = Int(padding * 2) + rowHeight * rows.count
let image = NSImage(size: NSSize(width: width, height: height))
image.lockFocus()
NSColor.white.setFill(); NSBezierPath(rect: NSRect(x:0,y:0,width:width,height:height)).fill()
for (idx,row) in rows.enumerated() {
  let top = CGFloat(height) - padding - CGFloat(idx * rowHeight)
  let resolved = NSFont(name: row.fontName, size: row.size)
  let font = resolved ?? .systemFont(ofSize: row.size)
  (row.title as NSString).draw(at: NSPoint(x: padding, y: top - 18), withAttributes:[.font:NSFont.systemFont(ofSize:14, weight:.semibold), .foregroundColor:NSColor.darkGray])
  (sample as NSString).draw(at: NSPoint(x: 280, y: top - 22), withAttributes:[.font:font, .foregroundColor:NSColor.black])
}
image.unlockFocus()
let tiff = image.tiffRepresentation!
let rep = NSBitmapImageRep(data: tiff)!
let png = rep.representation(using: .png, properties: [:])!
try png.write(to: URL(fileURLWithPath: outPath))
print(outPath)
