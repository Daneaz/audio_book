import AppKit
import CoreText

let outPath = "/Users/eugenewu/code/audio_book/tmp/font-preview.png"
let sample = "春江潮水连海平，海上明月共潮生。"
let note = "0123456789 ABCD 读书听书"
let width = 1400
let rowHeight = 180
let padding: CGFloat = 40

struct FontRow {
    let title: String
    let makeFont: () -> NSFont
}

func registerFont(at path: String) {
    let url = URL(fileURLWithPath: path) as CFURL
    CTFontManagerRegisterFontsForURL(url, .process, nil)
}

registerFont(at: "/Users/eugenewu/code/audio_book/assets/fonts/LXGWWenKai-Regular.ttf")
registerFont(at: "/Users/eugenewu/code/audio_book/assets/fonts/NotoSansCJKsc-Regular.otf")
registerFont(at: "/Users/eugenewu/code/audio_book/assets/fonts/NotoSerifCJKsc-Regular.otf")

let rows: [FontRow] = [
    FontRow(title: "LXGW WenKai（当前楷体，偏手写）") { NSFont(name: "LXGWWenKai-Regular", size: 44) ?? .systemFont(ofSize: 44) },
    FontRow(title: "Kaiti SC（系统楷体，若存在）") { NSFont(name: "Kaiti SC", size: 44) ?? .systemFont(ofSize: 44) },
    FontRow(title: "Songti SC（系统宋体）") { NSFont(name: "Songti SC", size: 44) ?? .systemFont(ofSize: 44) },
    FontRow(title: "Hiragino Sans GB（系统黑体）") { NSFont(name: "Hiragino Sans GB", size: 44) ?? .systemFont(ofSize: 44) },
    FontRow(title: "Noto Serif SC（打包宋体）") { NSFont(name: "NotoSerifSC", size: 44) ?? .systemFont(ofSize: 44) },
    FontRow(title: "Noto Sans SC（打包黑体）") { NSFont(name: "NotoSansSC", size: 44) ?? .systemFont(ofSize: 44) },
]

let height = Int(padding * 2) + rowHeight * rows.count
let image = NSImage(size: NSSize(width: width, height: height))
image.lockFocus()
NSColor(calibratedWhite: 0.98, alpha: 1).setFill()
NSBezierPath(rect: NSRect(x: 0, y: 0, width: width, height: height)).fill()

for (idx, row) in rows.enumerated() {
    let top = CGFloat(height) - padding - CGFloat(idx * rowHeight)
    let titleAttrs: [NSAttributedString.Key: Any] = [
        .font: NSFont.systemFont(ofSize: 24, weight: .semibold),
        .foregroundColor: NSColor(calibratedWhite: 0.2, alpha: 1)
    ]
    let sampleAttrs: [NSAttributedString.Key: Any] = [
        .font: row.makeFont(),
        .foregroundColor: NSColor(calibratedWhite: 0.1, alpha: 1)
    ]
    let noteAttrs: [NSAttributedString.Key: Any] = [
        .font: row.makeFont().withSize(28),
        .foregroundColor: NSColor(calibratedWhite: 0.35, alpha: 1)
    ]
    (row.title as NSString).draw(at: NSPoint(x: padding, y: top - 30), withAttributes: titleAttrs)
    (sample as NSString).draw(at: NSPoint(x: padding, y: top - 92), withAttributes: sampleAttrs)
    (note as NSString).draw(at: NSPoint(x: padding, y: top - 132), withAttributes: noteAttrs)

    NSColor(calibratedWhite: 0.88, alpha: 1).setStroke()
    let path = NSBezierPath()
    path.move(to: NSPoint(x: padding, y: top - 155))
    path.line(to: NSPoint(x: CGFloat(width) - padding, y: top - 155))
    path.lineWidth = 1
    path.stroke()
}

image.unlockFocus()
let tiff = image.tiffRepresentation!
let rep = NSBitmapImageRep(data: tiff)!
let png = rep.representation(using: .png, properties: [:])!
try png.write(to: URL(fileURLWithPath: outPath))
print(outPath)
