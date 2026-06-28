import Foundation
import SwiftUI
import Combine
import AVFoundation

@MainActor
final class SettingsViewModel: ObservableObject {
    @Published var openAIKey: String = ""
    @Published var claudeKey: String = ""
    @Published var geminiKey: String = ""
    @Published var showOpenAIKey: Bool = false
    @Published var showClaudeKey: Bool = false
    @Published var showGeminiKey: Bool = false
    @Published var testingProvider: AIProvider? = nil
    @Published var testResult: String? = nil
    @Published var isTestingConnection: Bool = false
    @Published var availableVoices: [AVSpeechSynthesisVoice] = []

    private let settingsManager = SettingsManager.shared
    private var cancellables = Set<AnyCancellable>()

    init() {
        loadKeys()
        loadVoices()
    }

    var settings: AppSettings {
        get { settingsManager.settings }
        set { settingsManager.settings = newValue }
    }

    private func loadKeys() {
        openAIKey = KeychainManager.shared.openAIKey ?? ""
        claudeKey = KeychainManager.shared.claudeKey ?? ""
        geminiKey = KeychainManager.shared.geminiKey ?? ""
    }

    func saveKey(_ key: String, for provider: AIProvider) {
        settingsManager.setAPIKey(key, for: provider)
        HapticManager.shared.notification(.success)
    }

    func deleteKey(for provider: AIProvider) {
        switch provider {
        case .openAI:
            KeychainManager.shared.openAIKey = nil
            openAIKey = ""
        case .claude:
            KeychainManager.shared.claudeKey = nil
            claudeKey = ""
        case .gemini:
            KeychainManager.shared.geminiKey = nil
            geminiKey = ""
        case .local: break
        }
        HapticManager.shared.notification(.warning)
    }

    func testConnection(for provider: AIProvider) {
        isTestingConnection = true
        testingProvider = provider
        testResult = nil

        Task {
            let service = AIServiceFactory.makeService(for: provider)
            do {
                let response = try await service.sendMessage(
                    messages: [["role": "user", "content": "Réponds juste 'OK' en un seul mot."]],
                    model: provider.defaultModel,
                    systemPrompt: "Tu es un assistant. Réponds uniquement 'OK'."
                )
                testResult = "✓ Connexion réussie: \(response.prefix(50))"
            } catch {
                testResult = "✗ Erreur: \(error.localizedDescription)"
            }
            isTestingConnection = false
        }
    }

    func loadVoices() {
        availableVoices = AVSpeechSynthesisVoice.speechVoices()
            .filter { $0.language.hasPrefix("fr") || $0.language.hasPrefix("en") }
            .sorted { $0.name < $1.name }
    }

    func previewVoice(_ identifier: String) {
        let synth = SpeechSynthesisService.shared
        let prev = settingsManager.settings.selectedVoiceIdentifier
        settingsManager.settings.selectedVoiceIdentifier = identifier
        synth.speak("Bonjour Monsieur, je suis JARVIS. Comment puis-je vous aider ?")
        settingsManager.settings.selectedVoiceIdentifier = prev
    }

    func resetAllSettings() {
        settingsManager.resetToDefaults()
        loadKeys()
        HapticManager.shared.notification(.warning)
    }
}
