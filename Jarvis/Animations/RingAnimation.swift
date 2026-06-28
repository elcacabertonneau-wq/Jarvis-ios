import SwiftUI

struct OrbitingRingsView: View {
    let isActive: Bool
    let primaryColor: Color
    let size: CGFloat
    @State private var rotation1: Double = 0
    @State private var rotation2: Double = 45
    @State private var rotation3: Double = 90
    @State private var pulse: CGFloat = 1.0

    init(isActive: Bool = true, primaryColor: Color = AppConstants.Colors.primaryCyan, size: CGFloat = 200) {
        self.isActive = isActive
        self.primaryColor = primaryColor
        self.size = size
    }

    var body: some View {
        ZStack {
            // Outer pulse
            Circle()
                .stroke(primaryColor.opacity(0.15), lineWidth: 1)
                .frame(width: size * 1.4, height: size * 1.4)
                .scaleEffect(pulse)
                .opacity(isActive ? 1 : 0.3)

            // Ring 1 - horizontal
            Ellipse()
                .stroke(
                    LinearGradient(
                        colors: [primaryColor, primaryColor.opacity(0.0)],
                        startPoint: .leading,
                        endPoint: .trailing
                    ),
                    lineWidth: isActive ? 2 : 1
                )
                .frame(width: size, height: size * 0.3)
                .rotation3DEffect(.degrees(70), axis: (x: 1, y: 0, z: 0))
                .rotationEffect(.degrees(rotation1))

            // Ring 2 - vertical
            Ellipse()
                .stroke(
                    LinearGradient(
                        colors: [AppConstants.Colors.secondaryCyan, AppConstants.Colors.secondaryCyan.opacity(0.0)],
                        startPoint: .top,
                        endPoint: .bottom
                    ),
                    lineWidth: isActive ? 1.5 : 0.8
                )
                .frame(width: size * 0.3, height: size)
                .rotation3DEffect(.degrees(70), axis: (x: 0, y: 1, z: 0))
                .rotationEffect(.degrees(rotation2))

            // Ring 3 - diagonal
            Ellipse()
                .stroke(
                    primaryColor.opacity(0.5),
                    style: StrokeStyle(lineWidth: 1, dash: [4, 6])
                )
                .frame(width: size * 0.85, height: size * 0.25)
                .rotation3DEffect(.degrees(50), axis: (x: 1, y: 1, z: 0))
                .rotationEffect(.degrees(rotation3))

            // Inner core ring
            Circle()
                .stroke(primaryColor.opacity(0.3), lineWidth: 1)
                .frame(width: size * 0.5, height: size * 0.5)

            // Dot markers on rings
            ForEach(0..<6) { i in
                Circle()
                    .fill(primaryColor)
                    .frame(width: 3, height: 3)
                    .offset(x: (size / 2) * cos(Double(i) * .pi / 3 + rotation1 * .pi / 180))
                    .offset(y: (size / 6) * sin(Double(i) * .pi / 3 + rotation1 * .pi / 180))
                    .opacity(isActive ? 0.9 : 0.3)
            }
        }
        .onAppear { startAnimations() }
        .onChange(of: isActive) { _ in startAnimations() }
    }

    private func startAnimations() {
        let speed = isActive ? AppConstants.Animation.rotationSpeed : AppConstants.Animation.rotationSpeed * 0.3

        withAnimation(.linear(duration: speed).repeatForever(autoreverses: false)) {
            rotation1 = 360
        }
        withAnimation(.linear(duration: speed * 1.3).repeatForever(autoreverses: false)) {
            rotation2 = -360
        }
        withAnimation(.linear(duration: speed * 0.7).repeatForever(autoreverses: false)) {
            rotation3 = 360
        }
        withAnimation(.easeInOut(duration: 2.0).repeatForever(autoreverses: true)) {
            pulse = 1.1
        }
    }
}

struct ScannerRingView: View {
    @State private var scanAngle: Double = 0
    @State private var scanOpacity: Double = 1.0
    let color: Color
    let size: CGFloat

    init(color: Color = AppConstants.Colors.primaryCyan, size: CGFloat = 300) {
        self.color = color
        self.size = size
    }

    var body: some View {
        ZStack {
            // Background circle
            Circle()
                .stroke(color.opacity(0.1), lineWidth: 1)
                .frame(width: size, height: size)

            // Scanner sweep
            Circle()
                .trim(from: 0, to: 0.25)
                .stroke(
                    AngularGradient(
                        colors: [color.opacity(0), color, color.opacity(0.5)],
                        center: .center,
                        startAngle: .degrees(0),
                        endAngle: .degrees(90)
                    ),
                    lineWidth: 2
                )
                .frame(width: size, height: size)
                .rotationEffect(.degrees(scanAngle))
                .opacity(scanOpacity)

            // Center crosshair
            Group {
                Rectangle()
                    .fill(color.opacity(0.4))
                    .frame(width: size * 0.6, height: 0.5)
                Rectangle()
                    .fill(color.opacity(0.4))
                    .frame(width: 0.5, height: size * 0.6)
            }

            // Corner brackets
            ForEach(0..<4) { i in
                CornerBracket(color: color)
                    .rotationEffect(.degrees(Double(i) * 90))
                    .frame(width: size * 0.7, height: size * 0.7)
            }
        }
        .onAppear {
            withAnimation(.linear(duration: 3.0).repeatForever(autoreverses: false)) {
                scanAngle = 360
            }
        }
    }
}

struct CornerBracket: View {
    let color: Color

    var body: some View {
        GeometryReader { geo in
            Path { path in
                let w = geo.size.width
                let h = geo.size.height
                let len: CGFloat = 15

                path.move(to: CGPoint(x: 0, y: len))
                path.addLine(to: CGPoint(x: 0, y: 0))
                path.addLine(to: CGPoint(x: len, y: 0))
            }
            .stroke(color, lineWidth: 2)
        }
    }
}
