import SwiftUI
import AVFoundation
import Speech

@main
struct JarvisApp: App {
    @StateObject private var jarvisManager = JarvisManager.shared
    @StateObject private var settingsManager = SettingsManager.shared
    @StateObject private var conversationManager = ConversationManager.shared

    init() {
        configureAudioSession()
    }

    var body: some Scene {
        WindowGroup {
            ContentRootView()
                .environmentObject(jarvisManager)
                .environmentObject(settingsManager)
                .environmentObject(conversationManager)
                .preferredColorScheme(.dark)
        }
    }

    private func configureAudioSession() {
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playAndRecord,
                                    mode: .voiceChat,
                                    options: [.defaultToSpeaker, .allowBluetooth, .mixWithOthers])
            try session.setActive(true, options: .notifyOthersOnDeactivation)
        } catch {
            print("[JarvisApp] Audio session configuration failed: \(error)")
        }
    }
}
