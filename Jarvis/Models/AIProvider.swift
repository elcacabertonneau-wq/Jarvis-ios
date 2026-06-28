import Foundation

enum AIProvider: String, Codable, CaseIterable, Identifiable {
    case openAI = "OpenAI"
    case claude = "Anthropic Claude"
    case gemini = "Google Gemini"
    case local = "Modèle Local"

    var id: String { rawValue }

    var icon: String {
        switch self {
        case .openAI: return "brain.head.profile"
        case .claude: return "sparkles"
        case .gemini: return "star.circle"
        case .local: return "server.rack"
        }
    }

    var defaultModel: String {
        switch self {
        case .openAI: return "gpt-4o"
        case .claude: return "claude-opus-4-8"
        case .gemini: return "gemini-2.0-flash"
        case .local: return "llama3"
        }
    }

    var availableModels: [String] {
        switch self {
        case .openAI:
            return ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo"]
        case .claude:
            return ["claude-opus-4-8", "claude-sonnet-4-6", "claude-haiku-4-5-20251001"]
        case .gemini:
            return ["gemini-2.0-flash", "gemini-1.5-pro", "gemini-1.5-flash"]
        case .local:
            return ["llama3", "mistral", "phi3", "gemma"]
        }
    }

    var requiresAPIKey: Bool {
        self != .local
    }

    var keychainKey: String {
        switch self {
        case .openAI: return AppConstants.Keychain.openAIKeyID
        case .claude: return AppConstants.Keychain.claudeKeyID
        case .gemini: return AppConstants.Keychain.geminiKeyID
        case .local: return ""
        }
    }

    var hasAPIKey: Bool {
        guard requiresAPIKey else { return true }
        return KeychainManager.shared.retrieve(forKey: keychainKey)?.isNotEmpty == true
    }
}

struct AIModel: Identifiable {
    let id: String
    let name: String
    let provider: AIProvider
    let contextWindow: Int
    let supportsVision: Bool

    static func models(for provider: AIProvider) -> [AIModel] {
        switch provider {
        case .openAI:
            return [
                AIModel(id: "gpt-4o", name: "GPT-4o", provider: .openAI, contextWindow: 128000, supportsVision: true),
                AIModel(id: "gpt-4o-mini", name: "GPT-4o Mini", provider: .openAI, contextWindow: 128000, supportsVision: true),
                AIModel(id: "gpt-4-turbo", name: "GPT-4 Turbo", provider: .openAI, contextWindow: 128000, supportsVision: true),
                AIModel(id: "gpt-3.5-turbo", name: "GPT-3.5 Turbo", provider: .openAI, contextWindow: 16385, supportsVision: false)
            ]
        case .claude:
            return [
                AIModel(id: "claude-opus-4-8", name: "Claude Opus 4", provider: .claude, contextWindow: 200000, supportsVision: true),
                AIModel(id: "claude-sonnet-4-6", name: "Claude Sonnet 4", provider: .claude, contextWindow: 200000, supportsVision: true),
                AIModel(id: "claude-haiku-4-5-20251001", name: "Claude Haiku 4", provider: .claude, contextWindow: 200000, supportsVision: true)
            ]
        case .gemini:
            return [
                AIModel(id: "gemini-2.0-flash", name: "Gemini 2.0 Flash", provider: .gemini, contextWindow: 1000000, supportsVision: true),
                AIModel(id: "gemini-1.5-pro", name: "Gemini 1.5 Pro", provider: .gemini, contextWindow: 2000000, supportsVision: true),
                AIModel(id: "gemini-1.5-flash", name: "Gemini 1.5 Flash", provider: .gemini, contextWindow: 1000000, supportsVision: true)
            ]
        case .local:
            return [
                AIModel(id: "llama3", name: "Llama 3", provider: .local, contextWindow: 8192, supportsVision: false),
                AIModel(id: "mistral", name: "Mistral", provider: .local, contextWindow: 8192, supportsVision: false),
                AIModel(id: "phi3", name: "Phi-3", provider: .local, contextWindow: 4096, supportsVision: false)
            ]
        }
    }
}
