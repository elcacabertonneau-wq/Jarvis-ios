import SwiftUI

extension View {
    func jarvisGlow(color: Color = AppConstants.Colors.primaryCyan, radius: CGFloat = 15) -> some View {
        self
            .shadow(color: color.opacity(0.9), radius: radius / 3)
            .shadow(color: color.opacity(0.5), radius: radius)
            .shadow(color: color.opacity(0.25), radius: radius * 2)
    }

    func glassmorphic(cornerRadius: CGFloat = 16, opacity: Double = 0.12) -> some View {
        self
            .background(
                RoundedRectangle(cornerRadius: cornerRadius)
                    .fill(.ultraThinMaterial)
                    .overlay(
                        RoundedRectangle(cornerRadius: cornerRadius)
                            .fill(Color.white.opacity(opacity))
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: cornerRadius)
                            .stroke(
                                LinearGradient(
                                    colors: [
                                        AppConstants.Colors.primaryCyan.opacity(0.6),
                                        AppConstants.Colors.accentBlue.opacity(0.2)
                                    ],
                                    startPoint: .topLeading,
                                    endPoint: .bottomTrailing
                                ),
                                lineWidth: 1
                            )
                    )
            )
    }

    func hudBorder(color: Color = AppConstants.Colors.primaryCyan, width: CGFloat = 1) -> some View {
        self.overlay(
            RoundedRectangle(cornerRadius: 8)
                .stroke(color.opacity(0.7), lineWidth: width)
        )
    }

    func conditionalModifier<Content: View>(_ condition: Bool, transform: (Self) -> Content) -> some View {
        if condition {
            return AnyView(transform(self))
        } else {
            return AnyView(self)
        }
    }

    func shimmer(isActive: Bool = true) -> some View {
        self.modifier(ShimmerModifier(isActive: isActive))
    }

    func pulseEffect(isActive: Bool, color: Color = AppConstants.Colors.primaryCyan) -> some View {
        self.modifier(PulseModifier(isActive: isActive, color: color))
    }
}

struct ShimmerModifier: ViewModifier {
    let isActive: Bool
    @State private var phase: CGFloat = 0

    func body(content: Content) -> some View {
        if isActive {
            content
                .overlay(
                    GeometryReader { geometry in
                        LinearGradient(
                            gradient: Gradient(colors: [
                                .clear,
                                AppConstants.Colors.primaryCyan.opacity(0.3),
                                .clear
                            ]),
                            startPoint: UnitPoint(x: phase - 0.3, y: 0.5),
                            endPoint: UnitPoint(x: phase + 0.3, y: 0.5)
                        )
                        .blendMode(.screen)
                    }
                )
                .onAppear {
                    withAnimation(.linear(duration: 2.0).repeatForever(autoreverses: false)) {
                        phase = 1.3
                    }
                }
        } else {
            content
        }
    }
}

struct PulseModifier: ViewModifier {
    let isActive: Bool
    let color: Color
    @State private var scale: CGFloat = 1.0
    @State private var opacity: Double = 0.8

    func body(content: Content) -> some View {
        content
            .overlay(
                Circle()
                    .fill(color.opacity(isActive ? opacity * 0.3 : 0))
                    .scaleEffect(isActive ? scale : 1)
                    .animation(
                        isActive ? .easeInOut(duration: 1.0).repeatForever(autoreverses: true) : .default,
                        value: scale
                    )
            )
            .onAppear {
                if isActive {
                    scale = 1.4
                    opacity = 0.2
                }
            }
            .onChange(of: isActive) { _, newValue in
                if newValue {
                    withAnimation(.easeInOut(duration: 1.0).repeatForever(autoreverses: true)) {
                        scale = 1.4
                        opacity = 0.2
                    }
                } else {
                    scale = 1.0
                    opacity = 0.8
                }
            }
    }
}
