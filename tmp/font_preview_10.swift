import AppKit
import CoreText

let outPath = "/Users/eugenewu/code/audio_book/tmp/font-preview-10.png"
let sample = "春江潮水连海平，海上明月共潮生。"
let note = "0123456789 ABCD 读书听书"
let width = 1500
let rowHeight = 150
let padding: CGFloat = 36

struct FontRow {
    let title: String
    let fontName: String
    let size: CGFloat
}

func registerFont(at path: String) {
    let url = URL(fileURLWithPath: path) as CFURL
    CTFontManagerRegisterFontsForURL(url, .process, nil)
}

registerFont(at: "/Users/eugenewu/code/audio_book/assets/fonts/LXGWWenKai-Regular.ttf")
registerFont(at: "/Users/eugenewu/code/audio_book/assets/fonts/NotoSansCJKsc-Regular.otf")
registerFont(at: "/Users/eugenewu/code/audio_book/assets/fonts/NotoSerifCJKsc-Regular.otf")

let rows: [FontRow] = [
    .init(title: "1. LXGW WenKai（当前行楷/文楷）", fontName: "LXGWWenKai-Regular", size: 40),
    .init(title: "2. Kaiti SC（系统楷体）", fontName: "Kaiti SC", size: 40),
    .init(title: "3. STKaiti（旧系统楷体）", fontName: "STKaiti", size: 40),
    .init(title: "4. Songti SC（系统宋体）", fontName: "Songti SC", size: 40),
    .init(title: "5. STFangsong（系统仿宋）", fontName: "STFangsong", size: 40),
    .init(title: "6. Hiragino Sans GB（系统黑体）", fontName: "Hiragino Sans GB", size: 40),
    .init(title: "7. PingFang SC（系统苹方）", fontName: "PingFang SC", size: 40),
    .init(title: "8. Noto Serif SC（打包宋体）", fontName: "NotoSerifSC", size: 40),
    .init(title: "9. Noto Sans SC（打包黑体）", fontName: "NotoSansSC", size: 40),
    .init(title: "10. Menlo（等宽）", fontName: "Menlo", size: 36),
]

let height = Int(padding * 2) + rowHeight * rows.count
let image = NSImage(size: NSSize(width: width, height: height))
image.lockFocus()
NSColor(calibratedWhite: 0.985, alpha: 1).setFill()
NSBezierPath(rect: NSRect(x: 0, y: 0, width: width, height: height)).fill()

for (idx, row) in rows.enumerated() {
    let top = CGFloat(height) - padding - CGFloat(idx * rowHeight)
    let resolvedFont = NSFont(name: row.fontName, size: row.size)
    let font = resolvedFont ?? .systemFont(ofSize: row.size)
    let availability = resolvedFont == nil ? "未命中，已回退系统字体" : "已命中" 

    let titleAttrs: [NSAttributedString.Key: Any] = [
        .font: NSFont.systemFont(ofSize: 22, weight: .semibold),
        .foregroundColor: NSColor(calibratedWhite: 0.16, alpha: 1)
    ]
    let metaAttrs: [NSAttributedString.Key: Any] = [
        .font: NSFont.systemFont(ofSize: 14, weight: .regular),
        .foregroundColor: resolvedFont == nil ? NSColor.systemRed : NSColor.systemBlue
    ]
    let sampleAttrs: [NSAttributedString.Key: Any] = [
        .font: font,
        .foregroundColor: NSColor(calibratedWhite: 0.08, alpha: 1)
    ]
    let noteAttrs: [NSAttributedString.Key: Any] = [
        .font: font.withSize(max(24, row.size * 0.68)),
        .foregroundColor: NSColor(calibratedWhite: 0.35, alpha: 1)
    ]

    (row.title as NSString).draw(at: NSPoint(x: padding, y: top - 26), withAttributes: titleAttrs)
    ("字体名: \(row.fontName) | \(availability)" as NSString).draw(at: NSPoint(x: padding, y: top - 50), withAttributes: metaAttrs)
    (sample as NSString).draw(at: NSPoint(x: padding, y: top - 92), withAttributes: sampleAttrs)
    (note as NSString).draw(at: NSPoint(x: padding, y: top - 124), withAttributes: noteAttrs)

    NSColor(calibratedWhite: 0.9, alpha: 1).setStroke()
    let path = NSBezierPath()
    path.move(to: NSPoint(x: padding, y: top - 138))
    path.line(to: NSPoint(x: CGFloat(width) - padding, y: top - 138))
    path.lineWidth = 1
    path.stroke()
}

image.unlockFocus()
let tiff = image.tiffRepresentation!
let rep = NSBitmapImageRep(data: tiff)!
let png = rep.representation(using: .png, properties: [:])!
try png.write(to: URL(fileURLWithPath: outPath))
print(outPath)
