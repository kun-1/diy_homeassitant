import Foundation
import CoreGraphics
import CoreText
import ImageIO

struct Coupon: Codable { let name: String?; let code: String?; let expiry: String? }
enum PrescriptionPayload: Decodable {
    case legacy([String])
    case detailed(diagnosis: String?, rp: [String], advice: String?)

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let items = try? container.decode([String].self) {
            self = .legacy(items)
            return
        }
        let object = try container.decode([String: AnyCodable].self)
        self = .detailed(
            diagnosis: object["diagnosis"]?.stringValue,
            rp: object["rp"]?.arrayValue ?? [],
            advice: object["advice"]?.stringValue
        )
    }

    func values(body: String) -> (diagnosis: String, rp: [String], advice: String) {
        switch self {
        case .legacy(let items):
            return (body, items, "\u{4e0d}\u{8bb8}\u{786c}\u{6491}")
        case .detailed(let diagnosis, let rp, let advice):
            return (diagnosis?.isEmpty == false ? diagnosis! : body, rp, advice?.isEmpty == false ? advice! : "\u{4e0d}\u{8bb8}\u{786c}\u{6491}")
        }
    }
}

struct AnyCodable: Decodable {
    let value: Any
    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if let s = try? c.decode(String.self) { value = s }
        else if let a = try? c.decode([String].self) { value = a }
        else { value = NSNull() }
    }
    var stringValue: String? { value as? String }
    var arrayValue: [String] { value as? [String] ?? [] }
}

struct Metadata: Decodable {
    let content: String
    let fontProfile: String?
    let coupon: Coupon?
    let ghostEmoji: String?
    let prescription: PrescriptionPayload?
    let imageData: String?
}
struct Input: Decodable {
    let title: String
    let body: String
    let signature: String
    let paper: String
    let metadata: Metadata
    let createdAt: String?
}

let input = try JSONDecoder().decode(Input.self, from: FileHandle.standardInput.readDataToEndOfFile())
let fontProfile = input.metadata.fontProfile ?? "system"
let fontsDirectory = URL(fileURLWithPath: #filePath)
    .deletingLastPathComponent()
    .deletingLastPathComponent()
    .appendingPathComponent("assets/fonts", isDirectory: true)

func registerBundledFont(_ fileName: String) {
    let url = fontsDirectory.appendingPathComponent(fileName)
    var error: Unmanaged<CFError>?
    _ = CTFontManagerRegisterFontsForURL(url as CFURL, .process, &error)
}

registerBundledFont("SourceHanSansCN-Medium.otf")
registerBundledFont("SourceHanSansCN-Bold.otf")
registerBundledFont("fusion-pixel-12px-monospaced-zh_hans.otf")
let width = 384
let height = 480
let bytesPerRow = width
let colorSpace = CGColorSpaceCreateDeviceGray()
let context = CGContext(data: nil, width: width, height: height, bitsPerComponent: 8,
                        bytesPerRow: bytesPerRow, space: colorSpace,
                        bitmapInfo: CGImageAlphaInfo.none.rawValue)!
context.setFillColor(gray: 1, alpha: 1)
context.fill(CGRect(x: 0, y: 0, width: width, height: height))

func drawText(_ text: String, x: CGFloat, y: CGFloat, size: CGFloat, gray: CGFloat = 0.04, bold: Bool = false, profile: String? = nil) {
    let selectedProfile = profile ?? fontProfile
    let fontName: String
    switch selectedProfile {
    case "thermal-sans":
        fontName = bold ? "SourceHanSansCN-Bold" : "SourceHanSansCN-Medium"
    case "pixel", "pixel-large", "pixel-hard", "pixel-soft":
        fontName = "Fusion-Pixel-12px-Mono-zh_hans-Regular"
    case "heiti":
        fontName = "STHeiti-Medium"
    case "hybrid":
        fontName = text.range(of: "[\\u{4e00}-\\u{9fff}]", options: .regularExpression) != nil
            ? "Fusion-Pixel-12px-Mono-zh_hans-Regular"
            : "STHeiti-Medium"
    default:
        fontName = bold ? "PingFangSC-Semibold" : "PingFangSC-Medium"
    }
    let font = CTFontCreateWithName(fontName as CFString, size, nil)
    let attrs: [NSAttributedString.Key: Any] = [
        NSAttributedString.Key(kCTFontAttributeName as String): font,
        NSAttributedString.Key(kCTForegroundColorAttributeName as String): CGColor(gray: gray, alpha: 1)
    ]
    let line = CTLineCreateWithAttributedString(NSAttributedString(string: text, attributes: attrs))
    context.saveGState()
    // Thermal paper has no gray levels. Keep the thermal and pixel profiles
    // on whole black/white dots so antialiased edge pixels do not turn into
    // fuzzy, over-wide strokes after packing.
    context.setShouldAntialias(true)
    context.setShouldSmoothFonts(true)
    context.textPosition = CGPoint(x: x, y: y)
    CTLineDraw(line, context)
    context.restoreGState()
}

func wrap(_ text: String, max: Int) -> [String] {
    var result: [String] = []
    for paragraph in text.split(separator: "\n", omittingEmptySubsequences: false) {
        let chars = Array(paragraph)
        if chars.isEmpty { result.append(""); continue }
        var index = 0
        while index < chars.count {
            let end = min(index + max, chars.count)
            result.append(String(chars[index..<end]))
            index = end
        }
    }
    return result
}

func strokeRect(_ rect: CGRect, width: CGFloat = 2, gray: CGFloat = 0.08) {
    context.setStrokeColor(gray: gray, alpha: 1)
    context.setLineWidth(width)
    context.stroke(rect)
}

func dashedLine(from: CGPoint, to: CGPoint, gray: CGFloat = 0.35) {
    context.saveGState()
    context.setStrokeColor(gray: gray, alpha: 1)
    context.setLineWidth(2)
    context.setLineDash(phase: 0, lengths: [5, 4])
    context.move(to: from)
    context.addLine(to: to)
    context.strokePath()
    context.restoreGState()
}

func drawGhost(x: CGFloat, y: CGFloat, scale: CGFloat = 1) {
    context.saveGState()
    context.translateBy(x: x, y: y)
    context.scaleBy(x: scale, y: scale)
    let ghost = CGMutablePath()
    ghost.move(to: CGPoint(x: 5, y: 0))
    ghost.addCurve(to: CGPoint(x: 12, y: 96), control1: CGPoint(x: -2, y: 30), control2: CGPoint(x: 5, y: 77))
    ghost.addLine(to: CGPoint(x: 34, y: 122))
    ghost.addLine(to: CGPoint(x: 49, y: 100))
    ghost.addCurve(to: CGPoint(x: 59, y: 0), control1: CGPoint(x: 61, y: 72), control2: CGPoint(x: 51, y: 30))
    ghost.addCurve(to: CGPoint(x: 5, y: 0), control1: CGPoint(x: 46, y: -8), control2: CGPoint(x: 17, y: -8))
    // Thermal-paper edition: use an airy outline instead of a large solid fill.
    // It preserves the Ink Shadow silhouette while avoiding a dense black block.
    context.setFillColor(gray: 1, alpha: 1)
    context.addPath(ghost); context.fillPath()
    context.setStrokeColor(gray: 0.04, alpha: 1); context.setLineWidth(3)
    context.addPath(ghost); context.strokePath()
    context.move(to: CGPoint(x: 14, y: 8)); context.addCurve(to: CGPoint(x: 19, y: 98), control1: CGPoint(x: 8, y: 40), control2: CGPoint(x: 10, y: 76)); context.strokePath()
    context.setFillColor(gray: 1, alpha: 1)
    context.move(to: CGPoint(x: 34, y: 122)); context.addLine(to: CGPoint(x: 35, y: 101)); context.addLine(to: CGPoint(x: 49, y: 100)); context.closePath(); context.fillPath()
    context.move(to: CGPoint(x: 34, y: 122)); context.addLine(to: CGPoint(x: 35, y: 101)); context.addLine(to: CGPoint(x: 49, y: 100)); context.closePath(); context.strokePath()
    context.setFillColor(gray: 0.05, alpha: 1)
    context.fillEllipse(in: CGRect(x: 18, y: 76, width: 3, height: 7))
    context.fillEllipse(in: CGRect(x: 27, y: 76, width: 3, height: 7))
    context.setFillColor(gray: 1, alpha: 1)
    context.fill(CGRect(x: 39, y: 61, width: 12, height: 24))
    strokeRect(CGRect(x: 39, y: 61, width: 12, height: 24), width: 2, gray: 0.04)
    context.move(to: CGPoint(x: 45, y: 61)); context.addLine(to: CGPoint(x: 45, y: 85)); context.strokePath()
    context.restoreGState()
}

func decodedImage(_ dataURL: String?) -> CGImage? {
    guard let dataURL, let comma = dataURL.firstIndex(of: ",") else { return nil }
    let encoded = String(dataURL[dataURL.index(after: comma)...])
    guard let data = Data(base64Encoded: encoded), let source = CGImageSourceCreateWithData(data as CFData, nil) else { return nil }
    return CGImageSourceCreateImageAtIndex(source, 0, nil)
}

func drawFontComparison() {
    drawText("203 DPI 字体实物对照", x: 24, y: 442, size: 25, bold: true, profile: "thermal-sans")
    dashedLine(from: CGPoint(x: 20, y: 422), to: CGPoint(x: 364, y: 422), gray: 0.25)

    drawText("A  系统苹方 24px", x: 24, y: 386, size: 15, profile: "system")
    drawText("今天也要好好生活", x: 24, y: 352, size: 24, profile: "system")

    drawText("B  思源黑体 Medium 24px", x: 24, y: 310, size: 15, profile: "thermal-sans")
    drawText("今天也要好好生活", x: 24, y: 274, size: 24, profile: "thermal-sans")

    drawText("C  思源黑体 Bold 24px", x: 24, y: 232, size: 15, profile: "thermal-sans")
    drawText("今天也要好好生活", x: 24, y: 196, size: 24, bold: true, profile: "thermal-sans")

    drawText("D  Fusion Pixel 24px (2x)", x: 24, y: 154, size: 15, profile: "thermal-sans")
    drawText("今天也要好好生活", x: 24, y: 120, size: 24, profile: "pixel")

    drawText("数字 0123456789 · GUOZI", x: 24, y: 78, size: 18, profile: "thermal-sans")
    drawText("像素 0123456789 · GUOZI", x: 24, y: 42, size: 24, profile: "pixel")
}

func drawReceiptPrescription() {
    let rx: (diagnosis: String, rp: [String], advice: String) = input.metadata.prescription?.values(body: input.body) ?? (input.body, [], "\u{4e0d}\u{8bb8}\u{786c}\u{6491}")
    drawText("LOVE LETTER", x: 124, y: 438, size: 24, bold: true, profile: "thermal-sans")
    dashedLine(from: CGPoint(x: 44, y: 414), to: CGPoint(x: 340, y: 414))
    context.setStrokeColor(gray: 0.08, alpha: 1)
    context.setLineWidth(3)
    context.move(to: CGPoint(x: 44, y: 396)); context.addLine(to: CGPoint(x: 340, y: 396)); context.strokePath()
    drawText("\u{4eca} \u{65e5} \u{4efd} \u{5173} \u{5fc3} \u{5904} \u{65b9}", x: 48, y: 358, size: 21, profile: "thermal-sans")
    context.move(to: CGPoint(x: 44, y: 338)); context.addLine(to: CGPoint(x: 340, y: 338)); context.strokePath()
    drawText("\u{59d3} \u{540d}  " + input.title, x: 48, y: 302, size: 18, profile: "thermal-sans")
    drawText("\u{65e5} \u{671f}  " + String(input.createdAt?.prefix(10) ?? ""), x: 230, y: 302, size: 16, profile: "thermal-sans")
    drawText("\u{8bca} \u{65ad}  " + rx.diagnosis, x: 48, y: 270, size: 18, profile: "thermal-sans")
    dashedLine(from: CGPoint(x: 44, y: 248), to: CGPoint(x: 340, y: 248))
    drawText("Rp.", x: 48, y: 218, size: 22, bold: true, profile: "thermal-sans")
    var y: CGFloat = 180
    for (index, item) in rx.rp.prefix(4).enumerated() {
        let parts = item.split(separator: " ", maxSplits: 1).map(String.init)
        drawText("\(index + 1).", x: 48, y: y, size: 18, bold: true, profile: "thermal-sans")
        drawText(parts.first ?? item, x: 86, y: y, size: 18, profile: "thermal-sans")
        if parts.count > 1 { drawText(parts[1], x: 268, y: y, size: 17, profile: "thermal-sans") }
        y -= 30
    }
    drawText("\u{533b}\u{5631}", x: 48, y: y, size: 18, profile: "thermal-sans")
    drawText(rx.advice, x: 268, y: y, size: 17, profile: "thermal-sans")
    dashedLine(from: CGPoint(x: 44, y: y - 20), to: CGPoint(x: 340, y: y - 20))
    drawText("\u{533b}\u{5e08}\u{7b7e}\u{540d}", x: 48, y: y - 48, size: 17, profile: "thermal-sans")
    drawText(input.signature, x: 246, y: y - 48, size: 17, profile: "thermal-sans")
    context.setStrokeColor(gray: 0.08, alpha: 1); context.setLineWidth(3)
    context.move(to: CGPoint(x: 44, y: y - 72)); context.addLine(to: CGPoint(x: 340, y: y - 72)); context.strokePath()
    // The body is already used as the prescription diagnosis for legacy records.
    // Do not draw it again below the signature; that caused physical overlap.
}

func drawReceiptContent() {
    drawText("LOVE LETTER", x: 124, y: 438, size: 24, bold: true, profile: "thermal-sans")
    dashedLine(from: CGPoint(x: 44, y: 414), to: CGPoint(x: 340, y: 414))
    var baseline: CGFloat = 370
    switch input.metadata.content {
    case "polaroid":
        if let image = decodedImage(input.metadata.imageData) {
            let target = CGRect(x: 52, y: 176, width: 280, height: 174)
            context.setFillColor(gray: 1, alpha: 1); context.fill(CGRect(x: 42, y: 154, width: 300, height: 210))
            strokeRect(CGRect(x: 42, y: 154, width: 300, height: 210), width: 2)
            let ratio = min(target.width / CGFloat(image.width), target.height / CGFloat(image.height))
            let drawSize = CGSize(width: CGFloat(image.width) * ratio, height: CGFloat(image.height) * ratio)
            let drawRect = CGRect(x: target.midX - drawSize.width / 2, y: target.midY - drawSize.height / 2, width: drawSize.width, height: drawSize.height)
            context.interpolationQuality = .none
            context.draw(image, in: drawRect)
            for line in wrap(input.body, max: 18).prefix(2) {
                drawText(line, x: 52, y: baseline, size: 18, bold: true, profile: "thermal-sans")
                baseline -= 28
            }
        } else {
            strokeRect(CGRect(x: 68, y: 176, width: 248, height: 176), width: 2)
            drawText("\u{7b49}\u{5f85}\u{4e00}\u{5f20}\u{7167}\u{7247}", x: 116, y: 250, size: 20, bold: true, profile: "thermal-sans")
            for line in wrap(input.body, max: 18).prefix(2) {
                drawText(line, x: 52, y: baseline, size: 18, bold: true, profile: "thermal-sans")
                baseline -= 28
            }
        }
    case "coupon":
        strokeRect(CGRect(x: 46, y: 146, width: 292, height: 214), width: 2.5)
        drawText("\u{679c} \u{5b50} \u{5151} \u{6362} \u{5238}", x: 108, y: 326, size: 21, bold: true, profile: "thermal-sans")
        dashedLine(from: CGPoint(x: 64, y: 306), to: CGPoint(x: 320, y: 306))
        let couponName = input.metadata.coupon?.name ?? "\u{5fc3}\u{610f}\u{5151}\u{6362}\u{5238}"
        drawText(couponName, x: 64, y: 270, size: 20, bold: true, profile: "thermal-sans")
        for line in wrap(input.body, max: 20).prefix(3) {
            drawText(line, x: 64, y: baseline, size: 15, profile: "thermal-sans")
            baseline -= 23
        }
        drawText("CODE  " + (input.metadata.coupon?.code ?? "GUOZI"), x: 64, y: 190, size: 16, bold: true, profile: "thermal-sans")
        drawText("\u{6709}\u{6548}\u{671f}  " + (input.metadata.coupon?.expiry ?? "\u{957f}\u{671f}\u{6709}\u{6548}"), x: 64, y: 164, size: 15, profile: "thermal-sans")
    case "ghost-stamp":
        drawGhost(x: 72, y: 182, scale: 1.05)
        context.saveGState(); context.setLineDash(phase: 0, lengths: [5, 4]); context.setStrokeColor(gray: 0.25, alpha: 1); context.setLineWidth(2); context.strokeEllipse(in: CGRect(x: 214, y: 194, width: 92, height: 92)); context.restoreGState()
        drawText(input.metadata.ghostEmoji ?? "\u{2661}", x: 240, y: 228, size: 34, bold: true, profile: "thermal-sans")
        var stampY: CGFloat = 150
        for line in wrap(input.body, max: 20).prefix(3) {
            drawText(line, x: 52, y: stampY, size: 17, bold: true, profile: "thermal-sans")
            stampY -= 25
        }
    case "prescription":
        drawReceiptPrescription()
        return
    default:
        for line in wrap(input.body, max: 22).prefix(8) {
            drawText(line, x: 52, y: baseline, size: 20, profile: "thermal-sans")
            baseline -= 30
        }
    }
    context.setStrokeColor(gray: 0.08, alpha: 1); context.setLineWidth(3)
    context.move(to: CGPoint(x: 44, y: 78)); context.addLine(to: CGPoint(x: 340, y: 78)); context.strokePath()
    drawText("-- " + input.signature, x: 52, y: 48, size: 16, profile: "thermal-sans")
}

func drawCard() {
if input.paper == "receipt" {
    drawReceiptContent()
    return
}
switch input.paper {
case "border":
    strokeRect(CGRect(x: 8, y: 8, width: 368, height: 464), width: 3)
    strokeRect(CGRect(x: 14, y: 14, width: 356, height: 452), width: 2, gray: 0.18)
    drawText("给 你", x: 162, y: 440, size: 22, bold: true)
case "emoji":
    drawText("♡   ✦   ☺   ✿   ♡", x: 84, y: 440, size: 21, gray: 0.08)
    dashedLine(from: CGPoint(x: 24, y: 424), to: CGPoint(x: 360, y: 424))
case "receipt":
    drawText("GUOZI LOVE LETTER", x: 88, y: 440, size: 18, bold: true)
    dashedLine(from: CGPoint(x: 20, y: 424), to: CGPoint(x: 364, y: 424))
    dashedLine(from: CGPoint(x: 20, y: 54), to: CGPoint(x: 364, y: 54))
    drawText("THANK YOU · TAKE THIS LITTLE HEART", x: 43, y: 28, size: 13, gray: 0.08, bold: true)
default:
    drawText("一封给你的信", x: 26, y: 440, size: 21, gray: 0.08, bold: true)
}

drawText(input.title, x: 26, y: 392, size: input.paper == "minimal" ? 32 : 27, bold: true)

let card = CGRect(x: 24, y: 72, width: 336, height: 286)
if input.paper != "minimal" {
    context.setFillColor(gray: 0.97, alpha: 1)
    context.fill(card)
    if input.paper == "receipt" { dashedLine(from: CGPoint(x: 24, y: 358), to: CGPoint(x: 360, y: 358)) }
    else { strokeRect(card, width: 2, gray: 0.12) }
}
if input.metadata.content == "ghost-stamp" {
    drawGhost(x: 304, y: 350, scale: 0.75)
}

switch input.metadata.content {
case "polaroid":
    if let image = decodedImage(input.metadata.imageData) {
        let target = CGRect(x: 52, y: 158, width: 280, height: 174)
        context.setFillColor(gray: 1, alpha: 1); context.fill(CGRect(x: 42, y: 136, width: 300, height: 210))
        strokeRect(CGRect(x: 42, y: 136, width: 300, height: 210), width: 2)
        let ratio = min(target.width / CGFloat(image.width), target.height / CGFloat(image.height))
        let drawSize = CGSize(width: CGFloat(image.width) * ratio, height: CGFloat(image.height) * ratio)
        let drawRect = CGRect(x: target.midX - drawSize.width / 2, y: target.midY - drawSize.height / 2, width: drawSize.width, height: drawSize.height)
        context.interpolationQuality = .none
        context.draw(image, in: drawRect)
        drawText(wrap(input.body, max: 15).first ?? "", x: 56, y: 145, size: 19, bold: true)
    } else {
        strokeRect(CGRect(x: 68, y: 142, width: 248, height: 176), width: 2)
        context.move(to: CGPoint(x: 68, y: 142)); context.addLine(to: CGPoint(x: 316, y: 318)); context.move(to: CGPoint(x: 316, y: 142)); context.addLine(to: CGPoint(x: 68, y: 318)); context.strokePath()
        drawText("等待一张照片", x: 116, y: 112, size: 20, gray: 0.08, bold: true)
    }
case "coupon":
    strokeRect(CGRect(x: 46, y: 130, width: 292, height: 180), width: 2.5)
    context.saveGState(); context.setLineDash(phase: 0, lengths: [3, 3])
    context.strokeEllipse(in: CGRect(x: 31, y: 202, width: 30, height: 36)); context.strokeEllipse(in: CGRect(x: 323, y: 202, width: 30, height: 36)); context.restoreGState()
    let couponName = input.metadata.coupon?.name
    let couponCode = input.metadata.coupon?.code
    let couponExpiry = input.metadata.coupon?.expiry
    drawText(couponName?.isEmpty == false ? couponName! : "心意兑换券", x: 78, y: 268, size: 28, bold: true)
    drawText("CODE", x: 66, y: 216, size: 15, gray: 0.08, bold: true)
    drawText(couponCode?.isEmpty == false ? couponCode! : "GUOZI", x: 126, y: 214, size: 24, bold: true)
    drawText("有效期  " + (couponExpiry?.isEmpty == false ? couponExpiry! : "永远"), x: 84, y: 162, size: 19, gray: 0.08, bold: true)
    drawText(wrap(input.body, max: 15).first ?? "", x: 50, y: 92, size: 20, bold: true)
case "ghost-stamp":
    drawGhost(x: 66, y: 172, scale: 1.15)
    context.saveGState(); context.setLineDash(phase: 0, lengths: [5, 4]); context.setStrokeColor(gray: 0.25, alpha: 1); context.setLineWidth(2); context.strokeEllipse(in: CGRect(x: 208, y: 174, width: 100, height: 100)); context.restoreGState()
    drawText(input.metadata.ghostEmoji ?? "♡", x: 238, y: 210, size: 42, bold: true)
    var stampY: CGFloat = 138
    for line in wrap(input.body, max: 15).prefix(2) { drawText(line, x: 46, y: stampY, size: 22, bold: true); stampY -= 31 }
case "prescription":
    drawText("关 心 处 方 笺", x: 96, y: 322, size: 24, bold: true)
    dashedLine(from: CGPoint(x: 44, y: 300), to: CGPoint(x: 340, y: 300))
    var y: CGFloat = 264
    let items = input.metadata.prescription?.values(body: input.body).1.filter { !$0.isEmpty } ?? []
    for item in (items.isEmpty ? [input.body] : items).prefix(5) {
        strokeRect(CGRect(x: 52, y: y - 2, width: 16, height: 16), width: 2.5)
        drawText(item, x: 82, y: y, size: 20, bold: true)
        y -= 39
    }
default:
    var baseline: CGFloat = input.paper == "minimal" ? 318 : 322
    let fontSize: CGFloat = (input.paper == "minimal" ? 29 : 24) + (fontProfile == "pixel-large" ? 4 : 0)
    let maxChars = input.paper == "minimal" ? 12 : 14
    for line in wrap(input.body, max: maxChars).prefix(8) {
        drawText(line, x: 42, y: baseline, size: fontSize)
        baseline -= input.paper == "minimal" ? 39 : 34
    }
}

drawText("-- " + input.signature, x: 42, y: 42, size: 19, gray: 0.06, bold: true)
}

if fontProfile == "comparison" {
    drawFontComparison()
} else {
    drawCard()
}

let image = context.makeImage()!
let data = image.dataProvider!.data! as Data
var packed = Data()
let thermalThreshold: UInt8
switch fontProfile {
case "pixel-hard": thermalThreshold = 128
case "pixel-soft": thermalThreshold = 192
case "thermal-sans", "pixel", "pixel-large", "heiti", "hybrid": thermalThreshold = 128
default: thermalThreshold = 210
}
// CGBitmapContext stores this grayscale buffer in the same top-to-bottom order
// expected by EM5823H's GS v 0 command. Reversing rows prints every glyph upside down.
for y in 0..<height {
    for byteX in stride(from: 0, to: width, by: 8) {
        var byte: UInt8 = 0
        for bit in 0..<8 {
            let x = byteX + bit
            if x < width && data[y * bytesPerRow + x] < thermalThreshold { byte |= UInt8(0x80 >> bit) }
        }
        packed.append(byte)
    }
}
var header = Data()
var w = UInt32(width).littleEndian
var h = UInt32(height).littleEndian
withUnsafeBytes(of: &w) { header.append(contentsOf: $0) }
withUnsafeBytes(of: &h) { header.append(contentsOf: $0) }
FileHandle.standardOutput.write(header + packed)
