import Foundation

final class AIServiceFactory {
    static func makeService(for provider: AIProvider) -> AIServiceProtocol {
        switch provider {
        case .openAI: return OpenAIService()
        case .claude: return ClaudeService()
        case .gemini: return GeminiService()
        case .local: return LocalAIService()
        }
    }

    static func currentService() -> AIServiceProtocol {
        makeService(for: SettingsManager.shared.settings.selectedProvider)
    }
}
