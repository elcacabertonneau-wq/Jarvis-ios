import SwiftUI

struct SplashView: View {
    @State private var logoScale: CGFloat = 0.5
    @State private var logoOpacity: Double = 0
    @State private var ringOpacity: Double = 0
    @State private var textOpacity: Double = 0
    @State private var scanProgress: Double = 0
    @State private var statusText: String = "INITIALISATION..."
    @State private var glowPulse: CGFloat = 1.0
    @State private var gridOpacity: Double = 0

    private let statusMessages = [
        "INITIALISATION SYSTÈME...",
        "CHARGEMENT DES MODULES IA...",
        "CONNEXION AUX SERVEURS...",
        "CALIBRATION DES CAPTEURS...",
        "SYSTÈMES EN LIGNE..."
    ]

    var body: some View {
        ZStack {
            // Background
            HolographicBackground(isAnimated: true)

            // Grid
            HUDGridView()
                .opacity(gridOpacity * 0.05)
                .ignoresSafeArea()

            // Content
            VStack(spacing: 30) {
                Spacer()

                // Main Arc Reactor
                ZStack {
                    // Outer scan rings
                    ForEach(0..<4) { i in
                        Circle()
                            .stroke(
                                AppConstants.Colors.primaryCyan.opacity(0.15 - Double(i) * 0.03),
                                lineWidth: 1
                            )
                            .frame(width: CGFloat(160 + i * 40), height: CGFloat(160 + i * 40))
                            .scaleEffect(ringOpacity > 0 ? 1 : 0.3)
                            .opacity(ringOpacity)
                            .animation(.easeOut(duration: 0.8).delay(Double(i) * 0.2), value: ringOpacity)
                    }

                    // Scanner ring
                    if scanProgress > 0 {
                        ScannerRingView(color: AppConstants.Colors.primaryCyan, size: 180)
                            .opacity(0.7)
                    }

                    // Arc Reactor
                    ArcReactorView(size: 120, isActive: true)
                        .scaleEffect(logoScale)
                        .opacity(logoOpacity)
                        .neonGlow(color: AppConstants.Colors.primaryCyan, radius: 30, isActive: logoOpacity > 0.5)
                }

                // JARVIS Title
                VStack(spacing: 8) {
                    Text("J.A.R.V.I.S")
                        .font(.system(size: 42, weight: .ultraLight, design: .monospaced))
                        .foregroundColor(AppConstants.Colors.primaryCyan)
                        .tracking(12)
                        .neonGlow(color: AppConstants.Colors.primaryCyan, radius: 15)

                    Text("JUST A RATHER VERY INTELLIGENT SYSTEM")
                        .font(.system(size: 9, weight: .light, design: .monospaced))
                        .foregroundColor(AppConstants.Colors.primaryCyan.opacity(0.6))
                        .tracking(3)
                }
                .opacity(textOpacity)

                // Loading bar
                VStack(spacing: 8) {
                    // Progress bar
                    GeometryReader { geo in
                        ZStack(alignment: .leading) {
                            Rectangle()
                                .fill(AppConstants.Colors.primaryCyan.opacity(0.1))
                                .frame(height: 2)

                            Rectangle()
                                .fill(
                                    LinearGradient(
                                        colors: [AppConstants.Colors.secondaryCyan, AppConstants.Colors.primaryCyan],
                                        startPoint: .leading,
                                        endPoint: .trailing
                                    )
                                )
                                .frame(width: geo.size.width * scanProgress, height: 2)
                                .neonGlow(color: AppConstants.Colors.primaryCyan, radius: 4)

                            // Animated dot at end of progress
                            Circle()
                                .fill(AppConstants.Colors.primaryCyan)
                                .frame(width: 6, height: 6)
                                .offset(x: geo.size.width * scanProgress - 3, y: -2)
                                .neonGlow(color: AppConstants.Colors.primaryCyan, radius: 6)
                        }
                    }
                    .frame(height: 6)
                    .padding(.horizontal, 40)

                    Text(statusText)
                        .font(AppConstants.Fonts.hudSmall)
                        .foregroundColor(AppConstants.Colors.primaryCyan.opacity(0.8))
                        .tracking(2)
                        .animation(.none, value: statusText)
                }
                .opacity(textOpacity)

                Spacer()

                // Version
                Text("VERSION 1.0.0 • IRON MAN EDITION")
                    .font(AppConstants.Fonts.hudSmall)
                    .foregroundColor(AppConstants.Colors.primaryCyan.opacity(0.3))
                    .tracking(2)
                    .padding(.bottom, 40)
                    .opacity(textOpacity)
            }
        }
        .onAppear { startAnimation() }
    }

    private func startAnimation() {
        withAnimation(.easeOut(duration: 0.6).delay(0.2)) {
            logoScale = 1.0
            logoOpacity = 1.0
            gridOpacity = 1.0
        }

        withAnimation(.easeOut(duration: 0.8).delay(0.5)) {
            ringOpacity = 1.0
            textOpacity = 1.0
        }

        withAnimation(.linear(duration: 2.5).delay(0.5)) {
            scanProgress = 1.0
        }

        // Cycle through status messages
        for (index, message) in statusMessages.enumerated() {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.5 + Double(index) * 0.5) {
                withAnimation(.none) {
                    statusText = message
                }
            }
        }
    }
}
