import SwiftUI

/// A transparent, dependency-free mascot for macOS 14+ / iOS 17+.
/// Every state is available in every palette color. No images or video decoding.
@available(macOS 14.0, iOS 17.0, *)
public struct LocalBotMascot: View {
    public var state: LocalBotAnimation
    public var color: LocalBotPalette
    public var replayToken: Int
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var startedAt = Date()
    @State private var displayedState: LocalBotAnimation = .idle
    @State private var blendFrom = LocalBotMotion.neutral
    @State private var visible = false
    @State private var finished = false

    public init(state: LocalBotAnimation = .idle, color: LocalBotPalette = .pearl, replayToken: Int = 0) {
        self.state = state; self.color = color; self.replayToken = replayToken
    }
    public var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 30.0, paused: reduceMotion || !visible || finished)) { timeline in
            LocalBotDrawing(pose: reduceMotion ? LocalBotMotion.neutral : currentPose(at: timeline.date), color: color)
        }
        .aspectRatio(1, contentMode: .fit)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text(state.label))
        .onAppear { displayedState = state; startedAt = Date(); visible = true }
        .onDisappear { visible = false }
        .onChange(of: state) { _, _ in restart() }
        .onChange(of: replayToken) { _, _ in restart() }
        .task(id: "\(state.rawValue)-\(replayToken)") {
            finished = false
            if !state.loops {
                try? await Task.sleep(nanoseconds: UInt64((state.duration + 0.2) * 1_000_000_000))
                if !Task.isCancelled { finished = true }
            }
        }
    }
    private func currentPose(at date: Date) -> [String: Double] {
        let elapsed = max(0, date.timeIntervalSince(startedAt))
        let target = LocalBotMotion.pose(displayedState, time: elapsed)
        let u = min(1, elapsed / 0.18), blend = u * u * (3 - 2 * u)
        return target.merging(blendFrom) { new, old in old + (new - old) * blend }
    }
    private func restart() {
        let now = Date()
        blendFrom = currentPose(at: now)
        displayedState = state
        startedAt = now
        finished = false
    }
}

public enum LocalBotAnimation: String, CaseIterable, Sendable {
    case idle, thinking, working, success, needsInput, error, greeting, listening, stopped
    public var duration: Double { LocalBotMotion.durations[self]! }
    public var loops: Bool { [.idle, .thinking, .working, .needsInput, .listening].contains(self) }
    public var label: String { LocalBotMotion.labels[self]! }
}

public enum LocalBotPalette: String, CaseIterable, Sendable {
    case pearl, lavender, mint, sky, peach, rose, butter, lilac, aqua
    public var color: Color {
        switch self {
        case .pearl: return Color(red: 248.0 / 255, green: 246.0 / 255, blue: 242.0 / 255)
        case .lavender: return Color(red: 201.0 / 255, green: 182.0 / 255, blue: 255.0 / 255)
        case .mint: return Color(red: 170.0 / 255, green: 230.0 / 255, blue: 206.0 / 255)
        case .sky: return Color(red: 170.0 / 255, green: 212.0 / 255, blue: 255.0 / 255)
        case .peach: return Color(red: 255.0 / 255, green: 196.0 / 255, blue: 159.0 / 255)
        case .rose: return Color(red: 241.0 / 255, green: 181.0 / 255, blue: 206.0 / 255)
        case .butter: return Color(red: 244.0 / 255, green: 222.0 / 255, blue: 145.0 / 255)
        case .lilac: return Color(red: 217.0 / 255, green: 181.0 / 255, blue: 232.0 / 255)
        case .aqua: return Color(red: 157.0 / 255, green: 224.0 / 255, blue: 226.0 / 255)
        }
    }
}

struct LocalBotDrawing: View {
    let pose: [String: Double]
    let color: LocalBotPalette
    var body: some View {
        Canvas { context, size in
            func v(_ key: String) -> Double { pose[key]! }
            let scale = min(size.width, size.height) / 1020
            var rig = context
            rig.translateBy(x: (size.width - 1020 * scale) / 2, y: (size.height - 1020 * scale) / 2)
            rig.scaleBy(x: scale, y: scale)
            rig.translateBy(x: -120, y: -120)
            rig.translateBy(x: 635 + v("x"), y: 980 + v("y"))
            rig.rotate(by: .degrees(v("rotation")))
            rig.scaleBy(x: v("sx"), y: v("sy"))
            rig.translateBy(x: -635, y: -980)
            rig.fill(LocalBotMotion.bodyPath, with: .color(color.color))
            var accent = rig
            accent.translateBy(x: 445, y: 413 + v("leafY"))
            accent.rotate(by: .degrees(v("leafRotation")))
            accent.translateBy(x: -445, y: -413)
            accent.fill(LocalBotMotion.leafPath, with: .color(color.color))
            var eyes = rig
            eyes.translateBy(x: 645 + v("eyeX"), y: 735 + v("eyeY"))
            eyes.rotate(by: .degrees(v("eyeRotation")))
            eyes.scaleBy(x: 1, y: v("eyeSY"))
            eyes.translateBy(x: -645, y: -735)
            eyes.stroke(LocalBotMotion.eyePath, with: .color(Color(red: 17.0 / 255, green: 17.0 / 255, blue: 16.0 / 255)), style: StrokeStyle(lineWidth: 66, lineCap: .round, lineJoin: .round))
        }
    }
}

enum LocalBotMotion {
    static let neutral: [String: Double] = ["x": 0, "y": 0, "rotation": 0, "sx": 1, "sy": 1, "eyeX": 0, "eyeY": 0, "eyeRotation": 0, "eyeSY": 1, "leafRotation": 0, "leafY": 0]
    static let durations: [LocalBotAnimation: Double] = [.idle: 3.6,
.thinking: 3.2,
.working: 1.6,
.success: 1.8,
.needsInput: 3.6,
.error: 2.2,
.greeting: 2.4,
.listening: 2.8,
.stopped: 1.8]
    static let labels: [LocalBotAnimation: String] = [.idle: "Bekliyor",
.thinking: "Düşünüyor",
.working: "Çalışıyor",
.success: "Tamamlandı",
.needsInput: "Seni bekliyor",
.error: "Bir sorun var",
.greeting: "Merhaba",
.listening: "Dinliyor",
.stopped: "Durduruldu"]
    static let tracks: [LocalBotAnimation: [String: [[Double]]]] = [.idle: ["y": [[0, 0], [1.8, -9], [3.6, 0]], "sx": [[0, 1], [1.8, 1.008], [3.6, 1]], "sy": [[0, 1], [1.8, 1.014], [3.6, 1]], "leafRotation": [[0, 0], [1.1, -3], [2.3, 4], [3.6, 0]]],
.thinking: ["rotation": [[0, 0], [0.6, -7], [1.65, -7], [2.6, 2], [3.2, 0]], "y": [[0, 0], [0.65, -10], [1.7, -10], [2.6, -3], [3.2, 0]], "eyeX": [[0, 0], [0.4, 29], [1.1, 29], [1.4, 14], [2.2, 14], [2.85, 0], [3.2, 0]], "eyeY": [[0, 0], [0.45, -29], [1.75, -29], [2.7, 0], [3.2, 0]], "leafRotation": [[0, 0], [0.28, 3], [0.9, -15], [1.8, -11], [2.8, 4], [3.2, 0]], "eyeRotation": [[0, 0], [0.5, -3], [2.2, -3], [3.2, 0]]],
.working: ["y": [[0, 0], [0.24, 9], [0.48, -14], [0.8, 0], [1.04, 9], [1.28, -14], [1.6, 0]], "sx": [[0, 1], [0.24, 1.035], [0.48, 0.985], [0.8, 1], [1.04, 1.035], [1.28, 0.985], [1.6, 1]], "sy": [[0, 1], [0.24, 0.965], [0.48, 1.02], [0.8, 1], [1.04, 0.965], [1.28, 1.02], [1.6, 1]], "rotation": [[0, 0], [0.4, -3], [0.8, 0], [1.2, 3], [1.6, 0]], "eyeX": [[0, 0], [0.4, -12], [0.8, 0], [1.2, 12], [1.6, 0]], "eyeY": [[0, 0], [0.32, 12], [0.7, 0], [1.12, 12], [1.6, 0]], "leafRotation": [[0, 0], [0.28, 9], [0.58, -7], [0.8, 0], [1.08, 9], [1.38, -7], [1.6, 0]]],
.success: ["y": [[0, 0], [0.18, 13], [0.48, -112], [0.72, 0], [0.9, 9], [1.14, -15], [1.5, 0], [1.8, 0]], "sx": [[0, 1], [0.18, 1.12], [0.36, 0.94], [0.6, 0.98], [0.76, 1.11], [0.94, 1], [1.3, 1], [1.8, 1]], "sy": [[0, 1], [0.18, 0.88], [0.36, 1.09], [0.6, 1.02], [0.76, 0.9], [0.94, 1], [1.8, 1]], "rotation": [[0, 0], [0.22, -4], [0.48, 3], [0.76, -2], [1.2, 0], [1.8, 0]], "eyeY": [[0, 0], [0.38, -15], [1.1, -15], [1.6, 0], [1.8, 0]], "eyeRotation": [[0, 0], [0.38, -7], [1.1, -7], [1.6, 0], [1.8, 0]], "leafRotation": [[0, 0], [0.24, 15], [0.5, -17], [0.82, 13], [1.12, -5], [1.5, 0], [1.8, 0]]],
.needsInput: ["rotation": [[0, 0], [0.65, 8], [2.4, 8], [3.3, 0], [3.6, 0]], "eyeX": [[0, 0], [0.45, -13], [2.5, -13], [3.25, 0], [3.6, 0]], "eyeY": [[0, 0], [0.65, -10], [2.4, -10], [3.25, 0], [3.6, 0]], "y": [[0, 0], [0.65, -3], [1.25, -3], [1.45, -11], [1.7, -3], [2.4, -3], [3.3, 0], [3.6, 0]], "leafRotation": [[0, 0], [0.9, 12], [1.5, 7], [2.3, 10], [3.5, 0], [3.6, 0]]],
.error: ["x": [[0, 0], [0.35, -8], [0.56, 11], [0.77, -9], [0.98, 5], [1.25, 0], [2.2, 0]], "y": [[0, 0], [0.32, 13], [1.2, 13], [1.85, 0], [2.2, 0]], "rotation": [[0, 0], [0.35, -5], [0.56, 5], [0.77, -4], [0.98, 2], [1.25, 0], [2.2, 0]], "sx": [[0, 1], [0.32, 1.025], [1.2, 1.025], [1.85, 1], [2.2, 1]], "sy": [[0, 1], [0.32, 0.965], [1.2, 0.965], [1.85, 1], [2.2, 1]], "eyeY": [[0, 0], [0.35, 15], [1.1, 15], [1.9, 0], [2.2, 0]], "eyeRotation": [[0, 0], [0.35, 4], [1.1, 4], [1.9, 0], [2.2, 0]], "leafRotation": [[0, 0], [0.45, -13], [0.7, 9], [1, -5], [1.4, 0], [2.2, 0]]],
.greeting: ["y": [[0, 0], [0.2, 12], [0.48, -72], [0.72, 0], [0.9, 8], [1.16, -39], [1.4, 0], [1.62, 4], [1.9, 0], [2.4, 0]], "sx": [[0, 1], [0.2, 1.08], [0.43, 0.95], [0.73, 1.07], [0.9, 1], [1.1, 0.97], [1.42, 1.04], [1.7, 1], [2.4, 1]], "sy": [[0, 1], [0.2, 0.91], [0.43, 1.06], [0.73, 0.93], [0.9, 1], [1.1, 1.04], [1.42, 0.96], [1.7, 1], [2.4, 1]], "rotation": [[0, 0], [0.48, -8], [0.8, 0], [1.16, 7], [1.5, -2], [1.95, 0], [2.4, 0]], "eyeRotation": [[0, 0], [0.5, -5], [1.5, -5], [2.1, 0], [2.4, 0]], "leafRotation": [[0, 0], [0.28, 11], [0.57, -14], [0.84, 10], [1.25, -9], [1.53, 5], [1.95, 0], [2.4, 0]]],
.listening: ["sx": [[0, 1], [0.65, 1.025], [2, 1.025], [2.8, 1]], "sy": [[0, 1], [0.65, 1.035], [2, 1.035], [2.8, 1]], "eyeY": [[0, 0], [0.5, -9], [2.05, -9], [2.8, 0]], "leafRotation": [[0, 0], [0.5, 18], [0.8, 12], [1.08, 19], [1.36, 12], [1.64, 18], [2, 12], [2.8, 0]], "leafY": [[0, 0], [0.5, -15], [2, -15], [2.8, 0]], "y": [[0, 0], [0.65, -5], [1.1, -5], [1.36, 1], [1.65, -5], [2, -5], [2.8, 0]]],
.stopped: ["x": [[0, 0], [0.24, 24], [0.48, -7], [0.76, 3], [1.05, 0], [1.8, 0]], "rotation": [[0, 0], [0.24, 7], [0.48, -3], [0.76, 1], [1.05, 0], [1.8, 0]], "sx": [[0, 1], [0.24, 0.94], [0.5, 1.04], [0.85, 1], [1.8, 1]], "sy": [[0, 1], [0.24, 1.035], [0.5, 0.975], [0.85, 1], [1.8, 1]], "eyeX": [[0, 0], [0.2, 20], [0.5, -6], [0.9, 0], [1.8, 0]], "leafRotation": [[0, 0], [0.34, 16], [0.6, -8], [0.9, 3], [1.2, 0], [1.8, 0]]]]
    static func pose(_ state: LocalBotAnimation, time: Double) -> [String: Double] {
        let duration = state.duration
        let time = state.loops ? max(0, time).truncatingRemainder(dividingBy: duration) : min(max(0, time), duration)
        var pose = neutral
        for (key, frames) in tracks[state]! {
            var value = frames.last![1]
            if time <= frames[0][0] { value = frames[0][1] }
            else {
                for i in 1..<frames.count where time <= frames[i][0] {
                    let a = frames[i - 1], b = frames[i]
                    let u = (time - a[0]) / (b[0] - a[0]), ease = u * u * (3 - 2 * u)
                    value = a[1] + (b[1] - a[1]) * ease
                    break
                }
            }
            pose[key] = value
        }
        return pose
    }
    static let bodyPath: Path = {
        var p = Path()
        p.move(to: CGPoint(x: 635, y: 394))
        p.addCurve(to: CGPoint(x: 988, y: 714), control1: CGPoint(x: 837, y: 386), control2: CGPoint(x: 978, y: 505))
        p.addCurve(to: CGPoint(x: 642, y: 986), control1: CGPoint(x: 1002, y: 907), control2: CGPoint(x: 887, y: 982))
        p.addCurve(to: CGPoint(x: 267, y: 729), control1: CGPoint(x: 404, y: 992), control2: CGPoint(x: 276, y: 926))
        p.addCurve(to: CGPoint(x: 635, y: 394), control1: CGPoint(x: 256, y: 549), control2: CGPoint(x: 395, y: 414))
        p.closeSubpath()
        return p
    }()
    static let leafPath: Path = {
        var p = Path()
        p.move(to: CGPoint(x: 457, y: 400))
        p.addCurve(to: CGPoint(x: 355, y: 291), control1: CGPoint(x: 448, y: 335), control2: CGPoint(x: 409, y: 291))
        p.addCurve(to: CGPoint(x: 301, y: 333), control1: CGPoint(x: 326, y: 291), control2: CGPoint(x: 300, y: 306))
        p.addCurve(to: CGPoint(x: 408, y: 417), control1: CGPoint(x: 304, y: 373), control2: CGPoint(x: 350, y: 398))
        p.addCurve(to: CGPoint(x: 457, y: 400), control1: CGPoint(x: 438, y: 427), control2: CGPoint(x: 465, y: 424))
        p.closeSubpath()
        return p
    }()
    static let eyePath: Path = {
        var p = Path()
        p.move(to: CGPoint(x: 500, y: 674)); p.addLine(to: CGPoint(x: 510, y: 765)); p.addLine(to: CGPoint(x: 590, y: 762))
        p.move(to: CGPoint(x: 788, y: 674)); p.addLine(to: CGPoint(x: 798, y: 765)); p.addLine(to: CGPoint(x: 878, y: 762))
        return p
    }()
}
