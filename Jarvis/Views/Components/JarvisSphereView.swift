import SwiftUI

struct JarvisSphereView: View {
    @ObservedObject var jarvisManager = JarvisManager.shared
    let size: CGFloat

    @State private var outerRotation: Double = 0
    @State private var innerPulse: CGFloat = 1.0
    @State private var particleAngle: Double = 0

    init(size: CGFloat = 200) {
        self.size = size
    }

    private var stateColor: Color {
        jarvisManager.state.color
    }

    private var isActive: Bool {
        jarvisManager.state.isActive
    }

    var body: some View {
        ZStack {
            // Outer ambient glow
            Circle()
                .fill(
                    RadialGradient(
                        colors: [
                            stateColor.opacity(0.15),
                            stateColor.opacity(0.05),
                            Color.clear
                        ],
                        center: .center,
                        startRadius: size * 0.3,
                        endRadius: size * 0.9
                    )
                )
                .frame(width: size * 1.6, height: size * 1.6)
                .scaleEffect(innerPulse)

            // Pulsating outer rings
            PulsatingCircleView(
                isActive: isActive,
                color: stateColor,
                size: size * 1.1
            )

            // Orbiting rings
            OrbitingRingsView(
                isActive: isActive,
                primaryColor: stateColor,
                size: size
            )

            // Main sphere
            mainSphere

            // Particles when speaking or listening
            if jarvisManager.state == .speaking || jarvisManager.state == .listening {
                OrbitingParticles(color: stateColor, radius: size * 0.6, count: 8, angle: particleAngle)
            }

            // State text
            stateLabel
        }
        .onAppear { startAnimations() }
        .onChange(of: jarvisManager.state) { _ in startAnimations() }
    }

    private var mainSphere: some View {
        ZStack {
            // Base sphere
            Circle()
                .fill(
                    RadialGradient(
                        colors: [
                            AppConstants.Colors.darkBackground.opacity(0.9),
                            AppConstants.Colors.darkBackground
                        ],
                        center: UnitPoint(x: 0.35, y: 0.3),
                        startRadius: size * 0.05,
                        endRadius: size * 0.45
                    )
                )
                .frame(width: size * 0.65, height: size * 0.65)
                .overlay(
                    Circle()
                        .stroke(stateColor.opacity(0.6), lineWidth: isActive ? 2 : 1)
                )
                .neonGlow(color: stateColor, radius: isActive ? 20 : 8, isActive: isActive)

            // Inner light effect
            Circle()
                .fill(
                    RadialGradient(
                        colors: [
                            stateColor.opacity(isActive ? 0.3 : 0.1),
                            Color.clear
                        ],
                        center: UnitPoint(x: 0.35, y: 0.3),
                        startRadius: 0,
                        endRadius: size * 0.25
                    )
                )
                .frame(width: size * 0.65, height: size * 0.65)

            // Waveform when speaking
            if jarvisManager.state == .speaking {
                SpeakingWaveView(isSpeaking: true, color: stateColor)
                    .frame(width: size * 0.45, height: size * 0.15)
            } else if jarvisManager.state == .listening {
                AudioWaveformView(
                    audioLevel: jarvisManager.audioLevel,
                    isActive: true,
                    color: stateColor,
                    barCount: 20
                )
                .frame(width: size * 0.45, height: size * 0.15)
            } else {
                // Arc reactor when idle
                ArcReactorView(size: size * 0.35, isActive: isActive)
            }
        }
    }

    private var stateLabel: some View {
        VStack(spacing: 4) {
            Spacer()
            Text(jarvisManager.state.displayText)
                .font(AppConstants.Fonts.hudSmall)
                .foregroundColor(stateColor)
                .tracking(3)
                .padding(.bottom, 12)
        }
        .frame(width: size * 1.5, height: size * 1.5)
    }

    private func startAnimations() {
        withAnimation(.easeInOut(duration: isActive ? 1.0 : 2.0).repeatForever(autoreverses: true)) {
            innerPulse = isActive ? 1.08 : 1.03
        }
        withAnimation(.linear(duration: isActive ? 4.0 : 8.0).repeatForever(autoreverses: false)) {
            particleAngle = 360
        }
    }
}

struct OrbitingParticles: View {
    let color: Color
    let radius: CGFloat
    let count: Int
    let angle: Double

    var body: some View {
        ZStack {
            ForEach(0..<count, id: \.self) { i in
                let particleAngle = Double(i) * (360.0 / Double(count)) + angle
                let radians = particleAngle * .pi / 180
                let x = cos(radians) * radius
                let y = sin(radians) * radius * 0.4

                Circle()
                    .fill(color)
                    .frame(width: CGFloat.random(in: 2...5), height: CGFloat.random(in: 2...5))
                    .offset(x: x, y: y)
                    .opacity(0.7 + sin(radians) * 0.3)
                    .blur(radius: 0.5)
            }
        }
    }
}
