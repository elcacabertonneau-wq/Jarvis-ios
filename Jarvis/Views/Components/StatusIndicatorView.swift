import SwiftUI

struct HUDStatusBar: View {
    @ObservedObject var jarvisManager = JarvisManager.shared
    @ObservedObject private var networkService = NetworkService.shared
    let currentTime: String
    let currentDate: String

    var body: some View {
        VStack(spacing: 0) {
            // Top status bar
            HStack {
                // Left: Time
                VStack(alignment: .leading, spacing: 2) {
                    Text(currentTime)
                        .font(AppConstants.Fonts.hudTitle)
                        .foregroundColor(AppConstants.Colors.primaryCyan)
                        .neonGlow(color: AppConstants.Colors.primaryCyan, radius: 8)

                    Text(currentDate)
                        .font(AppConstants.Fonts.hudSmall)
                        .foregroundColor(AppConstants.Colors.primaryCyan.opacity(0.7))
                        .tracking(2)
                }

                Spacer()

                // Center: JARVIS logo
                VStack(spacing: 2) {
                    Text("J.A.R.V.I.S")
                        .font(.system(size: 18, weight: .ultraLight, design: .monospaced))
                        .foregroundColor(AppConstants.Colors.primaryCyan)
                        .tracking(6)
                        .neonGlow(color: AppConstants.Colors.primaryCyan, radius: 10)

                    Text("SYSTÈME ACTIF")
                        .font(AppConstants.Fonts.hudSmall)
                        .foregroundColor(AppConstants.Colors.primaryCyan.opacity(0.6))
                        .tracking(3)
                }

                Spacer()

                // Right: Network status
                VStack(alignment: .trailing, spacing: 4) {
                    HStack(spacing: 4) {
                        Circle()
                            .fill(networkService.isConnected ? AppConstants.Colors.neonGreen : AppConstants.Colors.dangerRed)
                            .frame(width: 6, height: 6)
                            .neonGlow(color: networkService.isConnected ? AppConstants.Colors.neonGreen : AppConstants.Colors.dangerRed, radius: 4)
                        Text(networkService.connectionType.displayName.uppercased())
                            .font(AppConstants.Fonts.hudSmall)
                            .foregroundColor(networkService.isConnected ? AppConstants.Colors.neonGreen : AppConstants.Colors.dangerRed)
                    }

                    Text(SettingsManager.shared.selectedProvider.rawValue.uppercased())
                        .font(AppConstants.Fonts.hudSmall)
                        .foregroundColor(AppConstants.Colors.primaryCyan.opacity(0.7))
                        .tracking(1)
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 12)

            // Separator line
            HStack {
                Rectangle()
                    .fill(
                        LinearGradient(
                            colors: [Color.clear, AppConstants.Colors.primaryCyan.opacity(0.5), Color.clear],
                            startPoint: .leading,
                            endPoint: .trailing
                        )
                    )
                    .frame(height: 0.5)
            }
            .padding(.top, 8)
        }
    }
}

struct StateDisplayView: View {
    @ObservedObject var jarvisManager = JarvisManager.shared

    var body: some View {
        HStack(spacing: 8) {
            // State indicator
            Circle()
                .fill(jarvisManager.state.color)
                .frame(width: 8, height: 8)
                .neonGlow(color: jarvisManager.state.color, radius: 6, isActive: jarvisManager.state.isActive)

            Text(jarvisManager.state.displayText)
                .font(AppConstants.Fonts.hudSmall)
                .foregroundColor(jarvisManager.state.color)
                .tracking(3)

            if jarvisManager.state == .listening {
                VoiceActivityIndicator(level: jarvisManager.audioLevel, color: jarvisManager.state.color)
                    .frame(height: 16)
            }

            if jarvisManager.state == .processing {
                ProgressView()
                    .progressViewStyle(CircularProgressViewStyle(tint: jarvisManager.state.color))
                    .scaleEffect(0.5)
                    .frame(width: 16, height: 16)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
        .background(
            Capsule()
                .fill(jarvisManager.state.color.opacity(0.1))
                .overlay(Capsule().stroke(jarvisManager.state.color.opacity(0.3), lineWidth: 0.5))
        )
    }
}

struct TranscriptView: View {
    @ObservedObject var jarvisManager = JarvisManager.shared

    var body: some View {
        if !jarvisManager.currentTranscript.isEmpty && jarvisManager.state == .listening {
            Text("\"\(jarvisManager.currentTranscript)\"")
                .font(AppConstants.Fonts.hudBody)
                .foregroundColor(AppConstants.Colors.primaryCyan.opacity(0.8))
                .multilineTextAlignment(.center)
                .padding(.horizontal, 20)
                .padding(.vertical, 8)
                .glassmorphic(cornerRadius: 8)
                .padding(.horizontal, 40)
                .transition(.opacity.combined(with: .move(edge: .bottom)))
        }
    }
}
