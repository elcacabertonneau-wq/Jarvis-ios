import Foundation
import Combine

protocol AIServiceProtocol: AnyObject {
    var provider: AIProvider { get }

    func sendMessage(
        messages: [[String: String]],
        model: String,
        systemPrompt: String
    ) async throws -> String

    func sendMessageStreaming(
        messages: [[String: String]],
        model: String,
        systemPrompt: String
    ) -> AsyncThrowingStream<String, Error>

    func analyzeImage(
        imageData: Data,
        prompt: String,
        model: String
    ) async throws -> String
}

enum AIServiceError: LocalizedError {
    case noAPIKey
    case invalidResponse
    case networkError(String)
    case rateLimited
    case contextTooLong
    case modelNotFound
    case unauthorized
    case serverError(Int)
    case decodingError(String)
    case notSupported

    var errorDescription: String? {
        switch self {
        case .noAPIKey:
            return "Aucune clé API configurée. Veuillez en ajouter une dans les paramètres."
        case .invalidResponse:
            return "Réponse invalide du serveur."
        case .networkError(let msg):
            return "Erreur réseau: \(msg)"
        case .rateLimited:
            return "Limite de requêtes atteinte. Veuillez patienter."
        case .contextTooLong:
            return "La conversation est trop longue. Je vais résumer."
        case .modelNotFound:
            return "Modèle introuvable."
        case .unauthorized:
            return "Clé API invalide ou expirée."
        case .serverError(let code):
            return "Erreur serveur: \(code)"
        case .decodingError(let msg):
            return "Erreur de décodage: \(msg)"
        case .notSupported:
            return "Fonctionnalité non supportée par ce fournisseur."
        }
    }

    var jarvisMessage: String {
        switch self {
        case .noAPIKey:
            return "Monsieur, il semblerait qu'aucune clé API ne soit configurée. Pourriez-vous vérifier les paramètres ?"
        case .rateLimited:
            return "Je suis momentanément surchargé, Monsieur. Accordez-moi quelques instants."
        case .unauthorized:
            return "Ma clé d'accès semble incorrecte, Monsieur. Il faudrait la mettre à jour."
        case .networkError:
            return "La connexion semble instable, Monsieur. Vérifiez votre réseau."
        default:
            return AppConstants.Jarvis.errorResponse
        }
    }
}
