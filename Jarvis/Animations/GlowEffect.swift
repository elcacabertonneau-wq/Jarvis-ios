import SwiftUI

struct NeonGlowModifier: ViewModifier {
    let color: Color
    let radius: CGFloat
    let isActive: Bool
    @State private var glowIntensity: CGFloat = 1.0

    func body(content: Content) -> some View {
        content
            .shadow(color: color.opacity(isActive ? 0.9 * glowIntensity : 0.2), radius: radius / 4)
            .shadow(color: color.opacity(isActive ? 0.6 * glowIntensity : 0.1), radius: radius / 2)
            .shadow(color: color.opacity(isActive ? 0.3 * glowIntensity : 0.05), radius: radius)
            .shadow(color: color.opacity(isActive ? 0.15 * glowIntensity : 0.02), radius: radius * 2)
            .onAppear {
                guard isActive else { return }
                withAnimation(.easeInOut(duration: 1.5).repeatForever(autoreverses: true)) {
                    glowIntensity = 0.6
                }
            }
    }
}

extension View {
    func neonGlow(color: Color = AppConstants.Colors.primaryCyan, radius: CGFloat = 20, isActive: Bool = true) -> some View {
        modifier(NeonGlowModifier(color: color, radius: radius, isActive: isActive))
    }
}

struct HolographicBackground: View {
    @State private var gradientPhase: Double = 0
    let isAnimated: Bool

    init(isAnimated: Bool = true) {
        self.isAnimated = isAnimated
    }

    var body: some View {
        ZStack {
            // Deep space background
            Color(red: 0.01, green: 0.03, blue: 0.08)

            // Nebula layers
            RadialGradient(
                colors: [
                    Color(red: 0.0, green: 0.15, blue: 0.35).opacity(0.4),
                    Color.clear
                ],
                center: UnitPoint(x: 0.3, y: 0.2),
                startRadius: 0,
                endRadius: 400
            )

            RadialGradient(
                colors: [
                    Color(red: 0.0, green: 0.05, blue: 0.25).opacity(0.6),
                    Color.clear
                ],
                center: UnitPoint(x: 0.8, y: 0.7),
                startRadius: 0,
                endRadius: 300
            )

            // Animated cyan shimmer
            if isAnimated {
                LinearGradient(
                    colors: [
                        Color.clear,
                        AppConstants.Colors.primaryCyan.opacity(0.03 + sin(gradientPhase) * 0.02),
                        Color.clear
                    ],
                    startPoint: UnitPoint(x: gradientPhase.truncatingRemainder(dividingBy: 2) - 0.5, y: 0),
                    endPoint: UnitPoint(x: gradientPhase.truncatingRemainder(dividingBy: 2) + 0.5, y: 1)
                )
                .onAppear {
                    withAnimation(.linear(duration: 8.0).repeatForever(autoreverses: false)) {
                        gradientPhase = 2.0
                    }
                }
            }

            // Grid overlay
            HUDGridView()
                .opacity(0.04)
        }
        .ignoresSafeArea()
    }
}

struct HUDGridView: View {
    var body: some View {
        Canvas { context, size in
            let spacing: CGFloat = 40

            // Vertical lines
            var x: CGFloat = 0
            while x <= size.width {
                let path = Path { p in
                    p.move(to: CGPoint(x: x, y: 0))
                    p.addLine(to: CGPoint(x: x, y: size.height))
                }
                context.stroke(path, with: .color(AppConstants.Colors.primaryCyan), lineWidth: 0.5)
                x += spacing
            }

            // Horizontal lines
            var y: CGFloat = 0
            while y <= size.height {
                let path = Path { p in
                    p.move(to: CGPoint(x: 0, y: y))
                    p.addLine(to: CGPoint(x: size.width, y: y))
                }
                context.stroke(path, with: .color(AppConstants.Colors.primaryCyan), lineWidth: 0.5)
                y += spacing
            }
        }
    }
}

struct ArcReactorView: View {
    @State private var rotation: Double = 0
    @State private var innerRotation: Double = 0
    @State private var glowPulse: CGFloat = 1.0
    let size: CGFloat
    let isActive: Bool

    init(size: CGFloat = 80, isActive: Bool = true) {
        self.size = size
        self.isActive = isActive
    }

    var body: some View {
        ZStack {
            // Outer ring
            Circle()
                .stroke(
                    AngularGradient(
                        colors: [
                            AppConstants.Colors.primaryCyan,
                            AppConstants.Colors.secondaryCyan,
                            AppConstants.Colors.accentBlue,
                            AppConstants.Colors.primaryCyan
                        ],
                        center: .center
                    ),
                    lineWidth: 3
                )
                .frame(width: size, height: size)
                .rotationEffect(.degrees(rotation))

            // Middle ring
            Circle()
                .stroke(AppConstants.Colors.primaryCyan.opacity(0.6), lineWidth: 1.5)
                .frame(width: size * 0.75, height: size * 0.75)
                .rotationEffect(.degrees(-innerRotation))

            // Inner triangles
            ForEach(0..<3) { i in
                Triangle()
                    .fill(AppConstants.Colors.primaryCyan.opacity(0.4))
                    .frame(width: size * 0.2, height: size * 0.2)
                    .rotationEffect(.degrees(Double(i) * 120 + innerRotation))
                    .offset(y: -size * 0.18)
            }

            // Core glow
            Circle()
                .fill(
                    RadialGradient(
                        colors: [
                            AppConstants.Colors.primaryCyan.opacity(0.9),
                            AppConstants.Colors.primaryCyan.opacity(0.3),
                            Color.clear
                        ],
                        center: .center,
                        startRadius: 0,
                        endRadius: size * 0.2
                    )
                )
                .frame(width: size * 0.35, height: size * 0.35)
                .scaleEffect(glowPulse)

            // Center dot
            Circle()
                .fill(Color.white)
                .frame(width: 4, height: 4)
                .neonGlow(color: AppConstants.Colors.primaryCyan, radius: 10)
        }
        .onAppear { startAnimations() }
        .onChange(of: isActive) { _, _ in startAnimations() }
    }

    private func startAnimations() {
        let speed = isActive ? AppConstants.Animation.rotationSpeed : AppConstants.Animation.rotationSpeed * 0.5
        withAnimation(.linear(duration: speed).repeatForever(autoreverses: false)) {
            rotation = 360
        }
        withAnimation(.linear(duration: speed * 0.7).repeatForever(autoreverses: false)) {
            innerRotation = -360
        }
        withAnimation(.easeInOut(duration: 1.5).repeatForever(autoreverses: true)) {
            glowPulse = isActive ? 1.2 : 1.05
        }
    }
}

struct Triangle: Shape {
    func path(in rect: CGRect) -> Path {
        Path { p in
            p.move(to: CGPoint(x: rect.midX, y: rect.minY))
            p.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY))
            p.addLine(to: CGPoint(x: rect.minX, y: rect.maxY))
            p.closeSubpath()
        }
    }
}
