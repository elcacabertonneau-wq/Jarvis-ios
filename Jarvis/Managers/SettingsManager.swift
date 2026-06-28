import Foundation
import Combine
import SwiftUI

final class SettingsManager: ObservableObject {
    static let shared = SettingsManager()
    @Published var settings: AppSettings
    private let storageKey = "jarvis_settings"
    private var cancellables = Set<AnyCancellable>()

    private init() {
        if let data = UserDefaults.standard.data(forKey: storageKey),
           let decoded = try? JSONDecoder().decode(AppSettings.self, from: data) {
            settings = decoded
        } else {
            settings = AppSettings()
        }

        $settings
            .debounce(for: .milliseconds(500), scheduler: RunLoop.main)
            .sink { [weak self] newSettings in
                self?.save(newSettings)
            }
            .store(in: &cancellables)
    }

    private func save(_ settings: AppSettings) {
        if let data = try? JSONEncoder().encode(settings) {
            UserDefaults.standard.set(data, forKey: storageKey)
        }
    }

    var hapticFeedbackEnabled: Bool { settings.hapticFeedbackEnabled }
    var soundEffectsEnabled: Bool { settings.soundEffectsEnabled }
    var autoReadResponses: Bool { settings.autoReadResponses }
    var streamingEnabled: Bool { settings.streamingEnabled }
    var selectedLanguage: String { settings.selectedLanguage }
    var selectedProvider: AIProvider { settings.selectedProvider }
    var selectedModel: String { settings.selectedModel }
    var primaryColor: Color { settings.theme.primaryColor }
    var secondaryColor: Color { settings.theme.secondaryColor }

    func setAPIKey(_ key: String, for provider: AIProvider) {
        switch provider {
        case .openAI: KeychainManager.shared.openAIKey = key
        case .claude: KeychainManager.shared.claudeKey = key
        case .gemini: KeychainManager.shared.geminiKey = key
        case .local: break
        }
    }

    func getAPIKey(for provider: AIProvider) -> String? {
        switch provider {
        case .openAI: return KeychainManager.shared.openAIKey
        case .claude: return KeychainManager.shared.claudeKey
        case .gemini: return KeychainManager.shared.geminiKey
        case .local: return nil
        }
    }

    func resetToDefaults() {
        settings = AppSettings()
    }
}
