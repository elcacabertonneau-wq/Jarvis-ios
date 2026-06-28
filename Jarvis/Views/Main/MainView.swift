import SwiftUI

struct MainView: View {
    @EnvironmentObject var jarvisManager: JarvisManager
    @EnvironmentObject var settingsManager: SettingsManager
    @EnvironmentObject var conversationManager: ConversationManager
    @StateObject private var viewModel = MainViewModel()
    @State private var showChat = false
    @State private var showSettings = false
    @State private var showHistory = false
    @State private var showCamera = false
    @State private var showNotes = false
    @State private var hasInitialized = false

    var body: some View {
        ZStack {
            // Background
            HolographicBackground()

            // Particles layer
            ParticleSystemView(
                isActive: jarvisManager.state.isActive,
                color: AppConstants.Colors.primaryCyan,
                count: AppConstants.Animation.particleCount
            )
            .opacity(0.6)
            .ignoresSafeArea()
            .allowsHitTesting(false)

            // Main content
            VStack(spacing: 0) {
                // HUD Status Bar
                HUDStatusBar(
                    currentTime: viewModel.currentTime,
                    currentDate: viewModel.currentDate
                )

                Spacer()

                // Main sphere center
                centerContent

                Spacer()

                // Bottom controls
                bottomControls
            }

            // Floating panels
            VStack {
                HStack {
                    // Left system status
                    leftStatusPanel
                    Spacer()
                    // Right quick actions
                    rightActionPanel
                }
                .padding(.top, 120)
                .padding(.horizontal, 16)
                Spacer()
            }

            // Transcript overlay
            VStack {
                Spacer()
                TranscriptView()
                    .padding(.bottom, 180)
            }
        }
        .sheet(isPresented: $showChat) {
            ChatView()
        }
        .sheet(isPresented: $showSettings) {
            SettingsView()
        }
        .sheet(isPresented: $showHistory) {
            ConversationHistoryView()
        }
        .sheet(isPresented: $showCamera) {
            CameraView()
        }
        .sheet(isPresented: $showNotes) {
            NotesView()
        }
        .task {
            guard !hasInitialized else { return }
            hasInitialized = true
            await jarvisManager.initialize()
        }
    }

    private var centerContent: some View {
        VStack(spacing: 24) {
            // Central sphere
            JarvisSphereView(size: 220)
                .frame(width: 340, height: 340)

            // State indicator
            StateDisplayView()

            // Mic button
            MicrophoneButtonView {
                viewModel.handleMicTap()
            }
        }
    }

    private var bottomControls: some View {
        VStack(spacing: 16) {
            // Wake word hint
            if jarvisManager.state == .idle {
                Text("Dites « Hey JARVIS » ou appuyez sur le micro")
                    .font(AppConstants.Fonts.hudSmall)
                    .foregroundColor(AppConstants.Colors.primaryCyan.opacity(0.5))
                    .tracking(1)
                    .multilineTextAlignment(.center)
            }

            // Navigation buttons
            HStack(spacing: 20) {
                navButton(icon: "bubble.left.and.bubble.right", label: "CHAT") { showChat = true }
                navButton(icon: "camera.viewfinder", label: "VISION") { showCamera = true }
                navButton(icon: "clock.arrow.circlepath", label: "HISTORIQUE") { showHistory = true }
                navButton(icon: "note.text", label: "NOTES") { showNotes = true }
                navButton(icon: "gearshape", label: "CONFIG") { showSettings = true }
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 40)
        }
    }

    private func navButton(icon: String, label: String, action: @escaping () -> Void) -> some View {
        Button(action: {
            HapticManager.shared.impact(.light)
            action()
        }) {
            VStack(spacing: 4) {
                ZStack {
                    RoundedRectangle(cornerRadius: 10)
                        .fill(AppConstants.Colors.darkBackground.opacity(0.8))
                        .frame(width: 48, height: 48)
                        .overlay(
                            RoundedRectangle(cornerRadius: 10)
                                .stroke(AppConstants.Colors.primaryCyan.opacity(0.4), lineWidth: 1)
                        )

                    Image(systemName: icon)
                        .font(.system(size: 18, weight: .ultraLight))
                        .foregroundColor(AppConstants.Colors.primaryCyan)
                }

                Text(label)
                    .font(.system(size: 8, weight: .light, design: .monospaced))
                    .foregroundColor(AppConstants.Colors.primaryCyan.opacity(0.6))
                    .tracking(1)
            }
        }
    }

    private var leftStatusPanel: some View {
        VStack(alignment: .leading, spacing: 6) {
            ForEach(viewModel.systemStatus) { item in
                HStack(spacing: 6) {
                    Circle()
                        .fill(item.isOnline ? AppConstants.Colors.neonGreen : AppConstants.Colors.dangerRed)
                        .frame(width: 4, height: 4)
                    VStack(alignment: .leading, spacing: 0) {
                        Text(item.label)
                            .font(.system(size: 7, weight: .light, design: .monospaced))
                            .foregroundColor(AppConstants.Colors.primaryCyan.opacity(0.5))
                            .tracking(1)
                        Text(item.value)
                            .font(.system(size: 8, weight: .regular, design: .monospaced))
                            .foregroundColor(item.isOnline ? AppConstants.Colors.primaryCyan : AppConstants.Colors.dangerRed)
                    }
                }
            }
        }
        .padding(10)
        .glassmorphic(cornerRadius: 8)
        .frame(width: 110)
    }

    private var rightActionPanel: some View {
        VStack(spacing: 8) {
            quickActionButton(icon: "magnifyingglass", label: "Recherche") {
                Task { await jarvisManager.sendTextMessage("Lance une recherche") }
            }
            quickActionButton(icon: "cloud.sun", label: "Météo") {
                Task { await jarvisManager.sendTextMessage("Quelle est la météo aujourd'hui ?") }
            }
            quickActionButton(icon: "calendar", label: "Agenda") {
                Task { await jarvisManager.sendTextMessage("Mes événements du jour") }
            }
            quickActionButton(icon: "music.note", label: "Musique") {
                Task { await jarvisManager.sendTextMessage("Lance de la musique") }
            }
        }
        .padding(8)
        .glassmorphic(cornerRadius: 12)
    }

    private func quickActionButton(icon: String, label: String, action: @escaping () -> Void) -> some View {
        Button(action: {
            HapticManager.shared.impact(.light)
            action()
        }) {
            HStack(spacing: 6) {
                Image(systemName: icon)
                    .font(.system(size: 10, weight: .light))
                    .foregroundColor(AppConstants.Colors.primaryCyan)
                    .frame(width: 14)
                Text(label)
                    .font(.system(size: 9, weight: .light, design: .monospaced))
                    .foregroundColor(AppConstants.Colors.primaryCyan.opacity(0.8))
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
        }
    }
}
