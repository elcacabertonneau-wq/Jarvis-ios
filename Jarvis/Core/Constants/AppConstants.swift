import SwiftUI

enum AppConstants {
    enum Colors {
        static let primaryCyan = Color(red: 0.0, green: 0.9, blue: 1.0)
        static let secondaryCyan = Color(red: 0.0, green: 0.6, blue: 0.9)
        static let accentBlue = Color(red: 0.1, green: 0.4, blue: 0.9)
        static let glowBlue = Color(red: 0.0, green: 0.7, blue: 1.0)
        static let darkBackground = Color(red: 0.02, green: 0.05, blue: 0.1)
        static let panelBackground = Color(red: 0.05, green: 0.1, blue: 0.2).opacity(0.7)
        static let neonGreen = Color(red: 0.0, green: 1.0, blue: 0.5)
        static let warningOrange = Color(red: 1.0, green: 0.6, blue: 0.0)
        static let dangerRed = Color(red: 1.0, green: 0.2, blue: 0.1)
    }

    enum Fonts {
        static let hudTitle = Font.system(size: 24, weight: .thin, design: .monospaced)
        static let hudSubtitle = Font.system(size: 14, weight: .light, design: .monospaced)
        static let hudBody = Font.system(size: 12, weight: .regular, design: .monospaced)
        static let hudSmall = Font.system(size: 10, weight: .light, design: .monospaced)
        static let displayLarge = Font.system(size: 48, weight: .ultraLight, design: .monospaced)
    }

    enum Animation {
        static let particleCount = 120
        static let ringCount = 5
        static let waveFrequency: Double = 2.0
        static let pulseSpeed: Double = 1.5
        static let glowRadius: CGFloat = 20
        static let rotationSpeed: Double = 8.0
    }

    enum Speech {
        static let wakeWords = ["jarvis", "hey jarvis", "salut jarvis", "dis jarvis", "ok jarvis", "bonjour jarvis"]
        static let defaultVoiceIdentifier = "com.apple.voice.compact.fr-FR.Thomas"
        static let sampleRate: Double = 44100.0
    }

    enum API {
        static let openAIBaseURL = "https://api.openai.com/v1"
        static let claudeBaseURL = "https://api.anthropic.com/v1"
        static let geminiBaseURL = "https://generativelanguage.googleapis.com/v1beta"
        static let weatherBaseURL = "https://api.open-meteo.com/v1"
    }

    enum Keychain {
        static let serviceIdentifier = "com.jarvis.ios.keychain"
        static let openAIKeyID = "openai_api_key"
        static let claudeKeyID = "claude_api_key"
        static let geminiKeyID = "gemini_api_key"
    }

    enum UserDefaults {
        static let selectedProviderKey = "selected_ai_provider"
        static let selectedModelKey = "selected_ai_model"
        static let selectedVoiceKey = "selected_voice"
        static let selectedLanguageKey = "selected_language"
        static let jarvisPersonalityKey = "jarvis_personality"
        static let themeKey = "app_theme"
        static let hapticFeedbackKey = "haptic_feedback"
        static let soundEffectsKey = "sound_effects"
    }

    enum Jarvis {
        static let systemPrompt = """
        Tu es JARVIS (Just A Rather Very Intelligent System), l'IA personnelle de Tony Stark. \
        Tu es brillant, élégant, légèrement sarcastique mais toujours poli et professionnel. \
        Tu réponds de manière concise et efficace, avec parfois une touche d'humour subtil. \
        Tu appelles toujours l'utilisateur "Monsieur" ou par son prénom. \
        Tu es capable de tout, tu ne dis jamais que tu ne peux pas faire quelque chose sans proposer une alternative. \
        Tes réponses doivent être naturelles, jamais robotiques. \
        Tu parles en français sauf si l'utilisateur parle une autre langue.
        """
        static let greetingMorning = "Bonjour, Monsieur. Tous les systèmes sont opérationnels. Comment puis-je vous assister ?"
        static let greetingAfternoon = "Bon après-midi, Monsieur. Je suis à votre disposition."
        static let greetingEvening = "Bonsoir, Monsieur. Que puis-je faire pour vous ce soir ?"
        static let wakeResponse = "Je vous écoute, Monsieur."
        static let errorResponse = "Je rencontre quelques difficultés techniques, Monsieur. Veuillez m'excuser."
        static let offlineResponse = "Je fonctionne en mode hors-ligne, Monsieur. Mes capacités sont temporairement limitées."
    }
}
