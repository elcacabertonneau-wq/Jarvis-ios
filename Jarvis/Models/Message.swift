import Foundation
import SwiftUI

enum MessageRole: String, Codable, CaseIterable {
    case user = "user"
    case assistant = "assistant"
    case system = "system"

    var displayName: String {
        switch self {
        case .user: return "Vous"
        case .assistant: return "JARVIS"
        case .system: return "Système"
        }
    }
}

enum MessageType: String, Codable {
    case text
    case voice
    case image
    case command
    case error
    case thinking
}

struct Message: Identifiable, Codable, Equatable {
    let id: UUID
    let role: MessageRole
    var content: String
    let type: MessageType
    let timestamp: Date
    var isStreaming: Bool
    var attachmentURL: URL?
    var metadata: [String: String]

    init(
        id: UUID = UUID(),
        role: MessageRole,
        content: String,
        type: MessageType = .text,
        timestamp: Date = Date(),
        isStreaming: Bool = false,
        attachmentURL: URL? = nil,
        metadata: [String: String] = [:]
    ) {
        self.id = id
        self.role = role
        self.content = content
        self.type = type
        self.timestamp = timestamp
        self.isStreaming = isStreaming
        self.attachmentURL = attachmentURL
        self.metadata = metadata
    }

    var isFromUser: Bool { role == .user }
    var isFromJarvis: Bool { role == .assistant }

    var formattedTime: String {
        let formatter = DateFormatter()
        formatter.dateFormat = "HH:mm"
        return formatter.string(from: timestamp)
    }

    static func userMessage(_ content: String, type: MessageType = .text) -> Message {
        Message(role: .user, content: content, type: type)
    }

    static func jarvisMessage(_ content: String, type: MessageType = .text) -> Message {
        Message(role: .assistant, content: content, type: type)
    }

    static func thinkingMessage() -> Message {
        Message(role: .assistant, content: "...", type: .thinking, isStreaming: true)
    }
}

extension Message {
    func toChatMessage() -> [String: String] {
        ["role": role.rawValue, "content": content]
    }
}
