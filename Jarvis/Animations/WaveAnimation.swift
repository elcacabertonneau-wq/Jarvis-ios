import SwiftUI

struct AudioWaveformView: View {
    let audioLevel: Float
    let isActive: Bool
    let color: Color
    let barCount: Int

    @State private var animationPhase: Double = 0
    @State private var barHeights: [CGFloat] = []

    init(audioLevel: Float = 0, isActive: Bool = false, color: Color = AppConstants.Colors.primaryCyan, barCount: Int = 40) {
        self.audioLevel = audioLevel
        self.isActive = isActive
        self.color = color
        self.barCount = barCount
    }

    var body: some View {
        HStack(spacing: 2) {
            ForEach(0..<barCount, id: \.self) { index in
                WaveBar(
                    height: barHeight(for: index),
                    color: color,
                    isActive: isActive
                )
            }
        }
        .onAppear {
            barHeights = (0..<barCount).map { _ in CGFloat.random(in: 0.05...0.15) }
            startAnimation()
        }
        .onChange(of: isActive) { newValue in
            if newValue { startAnimation() }
        }
    }

    private func barHeight(for index: Int) -> CGFloat {
        guard isActive else { return 0.05 }
        let base = Double(audioLevel) * 0.8
        let wave = sin(Double(index) * 0.4 + animationPhase) * 0.3
        let noise = barHeights.indices.contains(index) ? Double(barHeights[index]) * 0.2 : 0
        return CGFloat(max(0.05, min(1.0, base + wave + noise)))
    }

    private func startAnimation() {
        Timer.scheduledTimer(withTimeInterval: 0.05, repeats: true) { timer in
            guard isActive else { return }
            withAnimation(.linear(duration: 0.05)) {
                animationPhase += 0.15
            }
        }
    }
}

struct WaveBar: View {
    let height: CGFloat
    let color: Color
    let isActive: Bool

    var body: some View {
        RoundedRectangle(cornerRadius: 2)
            .fill(
                LinearGradient(
                    colors: [color.opacity(0.3), color, color.opacity(0.3)],
                    startPoint: .bottom,
                    endPoint: .top
                )
            )
            .frame(maxWidth: .infinity)
            .scaleEffect(y: height, anchor: .center)
            .animation(.spring(response: 0.15, dampingFraction: 0.7), value: height)
    }
}

struct SpeakingWaveView: View {
    let isSpeaking: Bool
    let color: Color
    @State private var phase: Double = 0

    init(isSpeaking: Bool, color: Color = AppConstants.Colors.neonGreen) {
        self.isSpeaking = isSpeaking
        self.color = color
    }

    var body: some View {
        GeometryReader { geometry in
            Canvas { context, size in
                guard isSpeaking else {
                    let path = Path { p in
                        p.move(to: CGPoint(x: 0, y: size.height / 2))
                        p.addLine(to: CGPoint(x: size.width, y: size.height / 2))
                    }
                    context.stroke(path, with: .color(color.opacity(0.3)), lineWidth: 1)
                    return
                }

                let path = Path { p in
                    p.move(to: CGPoint(x: 0, y: size.height / 2))
                    for x in stride(from: 0.0, through: Double(size.width), by: 2.0) {
                        let normalX = x / Double(size.width)
                        let wave1 = sin(normalX * .pi * 4 + phase) * 20
                        let wave2 = sin(normalX * .pi * 8 + phase * 1.5) * 10
                        let wave3 = cos(normalX * .pi * 6 + phase * 0.7) * 5
                        let y = size.height / 2 + wave1 + wave2 + wave3
                        p.addLine(to: CGPoint(x: x, y: y))
                    }
                }

                context.stroke(
                    path,
                    with: .linearGradient(
                        Gradient(colors: [color.opacity(0), color, color.opacity(0)]),
                        startPoint: CGPoint(x: 0, y: size.height / 2),
                        endPoint: CGPoint(x: size.width, y: size.height / 2)
                    ),
                    style: StrokeStyle(lineWidth: 2, lineCap: .round)
                )
            }
        }
        .onAppear { startAnimation() }
        .onChange(of: isSpeaking) { _ in startAnimation() }
    }

    private func startAnimation() {
        guard isSpeaking else { return }
        Timer.scheduledTimer(withTimeInterval: 0.033, repeats: true) { timer in
            guard isSpeaking else { timer.invalidate(); return }
            withAnimation(.linear(duration: 0.033)) {
                phase += 0.1
            }
        }
    }
}

struct PulsatingCircleView: View {
    let isActive: Bool
    let color: Color
    let size: CGFloat
    @State private var scales: [CGFloat] = [1.0, 1.0, 1.0]
    @State private var opacities: [Double] = [0.8, 0.5, 0.2]

    init(isActive: Bool, color: Color = AppConstants.Colors.primaryCyan, size: CGFloat = 100) {
        self.isActive = isActive
        self.color = color
        self.size = size
    }

    var body: some View {
        ZStack {
            ForEach(0..<3, id: \.self) { i in
                Circle()
                    .stroke(color.opacity(opacities[i]), lineWidth: 1)
                    .frame(width: size, height: size)
                    .scaleEffect(scales[i])
            }
        }
        .onChange(of: isActive) { newValue in
            if newValue { startPulsing() }
        }
        .onAppear { if isActive { startPulsing() } }
    }

    private func startPulsing() {
        for i in 0..<3 {
            let delay = Double(i) * 0.4
            DispatchQueue.main.asyncAfter(deadline: .now() + delay) {
                withAnimation(.easeOut(duration: 1.5).repeatForever(autoreverses: false)) {
                    scales[i] = 2.0
                    opacities[i] = 0.0
                }
            }
        }
    }
}
