import Foundation
import SwiftUI

struct AppSettings: Codable {
    var selectedProvider: AIProvider
    var selectedModel: String
    var selectedVoiceIdentifier: String
    var selectedLanguage: String
    var hapticFeedbackEnabled: Bool
    var soundEffectsEnabled: Bool
    var continuousListening: Bool
    var autoReadResponses: Bool
    var streamingEnabled: Bool
    var maxHistoryMessages: Int
    var theme: AppTheme
    var fontSize: FontSize
    var localServerURL: String

    init() {
        selectedProvider = .openAI
        selectedModel = "gpt-4o"
        selectedVoiceIdentifier = AppConstants.Speech.defaultVoiceIdentifier
        selectedLanguage = "fr-FR"
        hapticFeedbackEnabled = true
        soundEffectsEnabled = true
        continuousListening = false
        autoReadResponses = true
        streamingEnabled = true
        maxHistoryMessages = 20
        theme = .holographic
        fontSize = .medium
        localServerURL = "http://localhost:11434"
    }
}

enum AppTheme: String, Codable, CaseIterable, Identifiable {
    case holographic = "Holographique"
    case iron = "Fer Rouge"
    case arc = "Réacteur Arc"
    case stealth = "Mode Furtif"

    var id: String { rawValue }

    var primaryColor: Color {
        switch self {
        case .holographic: return AppConstants.Colors.primaryCyan
        case .iron: return Color(red: 0.8, green: 0.2, blue: 0.1)
        case .arc: return Color(red: 0.0, green: 0.6, blue: 1.0)
        case .stealth: return Color(red: 0.3, green: 0.3, blue: 0.3)
        }
    }

    var secondaryColor: Color {
        switch self {
        case .holographic: return AppConstants.Colors.accentBlue
        case .iron: return Color(red: 1.0, green: 0.6, blue: 0.0)
        case .arc: return Color(red: 0.0, green: 0.9, blue: 0.8)
        case .stealth: return Color(red: 0.5, green: 0.5, blue: 0.5)
        }
    }
}

enum FontSize: String, Codable, CaseIterable, Identifiable {
    case small = "Petit"
    case medium = "Moyen"
    case large = "Grand"

    var id: String { rawValue }

    var scale: CGFloat {
        switch self {
        case .small: return 0.85
        case .medium: return 1.0
        case .large: return 1.2
        }
    }
}

enum JarvisState: Equatable {
    case idle
    case listening
    case processing
    case speaking
    case error(String)

    var displayText: String {
        switch self {
        case .idle: return "EN VEILLE"
        case .listening: return "ÉCOUTE ACTIVE"
        case .processing: return "TRAITEMENT..."
        case .speaking: return "JARVIS PARLE"
        case .error(let msg): return "ERREUR: \(msg.uppercased())"
        }
    }

    var color: Color {
        switch self {
        case .idle: return AppConstants.Colors.glowBlue.opacity(0.6)
        case .listening: return AppConstants.Colors.primaryCyan
        case .processing: return AppConstants.Colors.secondaryCyan
        case .speaking: return AppConstants.Colors.neonGreen
        case .error: return AppConstants.Colors.dangerRed
        }
    }

    var isActive: Bool {
        switch self {
        case .idle: return false
        default: return true
        }
    }
}
