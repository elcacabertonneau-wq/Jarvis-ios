import SwiftUI

struct MicrophoneButtonView: View {
    @ObservedObject var jarvisManager = JarvisManager.shared
    let action: () -> Void
    @State private var isPressed: Bool = false
    @State private var rippleScale: CGFloat = 1.0
    @State private var rippleOpacity: Double = 0.0

    var isListening: Bool { jarvisManager.state == .listening }
    var buttonColor: Color {
        switch jarvisManager.state {
        case .idle: return AppConstants.Colors.primaryCyan
        case .listening: return AppConstants.Colors.neonGreen
        case .processing: return AppConstants.Colors.secondaryCyan
        case .speaking: return AppConstants.Colors.warningOrange
        case .error: return AppConstants.Colors.dangerRed
        }
    }

    var body: some View {
        ZStack {
            // Ripple effect
            Circle()
                .stroke(buttonColor.opacity(rippleOpacity), lineWidth: 2)
                .frame(width: 80, height: 80)
                .scaleEffect(rippleScale)

            // Button background
            Circle()
                .fill(AppConstants.Colors.darkBackground.opacity(0.9))
                .frame(width: 64, height: 64)
                .overlay(
                    Circle()
                        .stroke(buttonColor.opacity(0.8), lineWidth: 2)
                )
                .neonGlow(color: buttonColor, radius: 15, isActive: isListening)

            // Icon
            Group {
                if jarvisManager.state == .processing {
                    ProgressView()
                        .progressViewStyle(CircularProgressViewStyle(tint: buttonColor))
                        .scaleEffect(0.8)
                } else if jarvisManager.state == .speaking {
                    Image(systemName: "speaker.wave.3.fill")
                        .font(.system(size: 22, weight: .light))
                        .foregroundColor(buttonColor)
                } else {
                    Image(systemName: isListening ? "mic.fill" : "mic")
                        .font(.system(size: 22, weight: .light))
                        .foregroundColor(buttonColor)
                }
            }
            .scaleEffect(isPressed ? 0.85 : 1.0)
        }
        .frame(width: 80, height: 80)
        .onTapGesture {
            HapticManager.shared.impact(.medium)
            triggerRipple()
            action()
        }
        .onLongPressGesture(minimumDuration: 0, pressing: { pressing in
            withAnimation(.spring(response: 0.2)) {
                isPressed = pressing
            }
        }, perform: {})
        .onChange(of: isListening) { newValue in
            if newValue { startListeningAnimation() }
        }
    }

    private func triggerRipple() {
        rippleScale = 1.0
        rippleOpacity = 0.8
        withAnimation(.easeOut(duration: 0.6)) {
            rippleScale = 2.0
            rippleOpacity = 0.0
        }
    }

    private func startListeningAnimation() {
        guard isListening else { return }
        withAnimation(.easeInOut(duration: 0.8).repeatForever(autoreverses: true)) {
            rippleScale = 1.5
            rippleOpacity = 0.4
        }
    }
}

struct VoiceActivityIndicator: View {
    let level: Float
    let color: Color
    @State private var barHeights: [CGFloat] = Array(repeating: 0.1, count: 5)

    init(level: Float, color: Color = AppConstants.Colors.primaryCyan) {
        self.level = level
        self.color = color
    }

    var body: some View {
        HStack(spacing: 3) {
            ForEach(0..<5, id: \.self) { i in
                RoundedRectangle(cornerRadius: 2)
                    .fill(color)
                    .frame(width: 3, height: barHeight(for: i) * 30)
                    .animation(.spring(response: 0.2), value: level)
            }
        }
        .frame(height: 30)
    }

    private func barHeight(for index: Int) -> CGFloat {
        let base = CGFloat(level)
        let wave = CGFloat(sin(Double(index) * 0.8)) * 0.3
        return max(0.1, min(1.0, base + wave))
    }
}
