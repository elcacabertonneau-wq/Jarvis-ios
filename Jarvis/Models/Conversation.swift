import Foundation

enum ConversationCategory: String, Codable, CaseIterable, Identifiable {
    case general = "Général"
    case question = "Question"
    case task = "Tâche"
    case research = "Recherche"
    case creative = "Créatif"
    case technical = "Technique"
    case favorite = "Favori"

    var id: String { rawValue }

    var icon: String {
        switch self {
        case .general: return "bubble.left.and.bubble.right"
        case .question: return "questionmark.circle"
        case .task: return "checkmark.circle"
        case .research: return "magnifyingglass"
        case .creative: return "paintbrush"
        case .technical: return "gearshape"
        case .favorite: return "star.fill"
        }
    }
}

struct Conversation: Identifiable, Codable {
    let id: UUID
    var title: String
    var messages: [Message]
    var category: ConversationCategory
    var isFavorite: Bool
    var createdAt: Date
    var updatedAt: Date
    var tags: [String]

    init(
        id: UUID = UUID(),
        title: String = "Nouvelle conversation",
        messages: [Message] = [],
        category: ConversationCategory = .general,
        isFavorite: Bool = false,
        createdAt: Date = Date(),
        updatedAt: Date = Date(),
        tags: [String] = []
    ) {
        self.id = id
        self.title = title
        self.messages = messages
        self.category = category
        self.isFavorite = isFavorite
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.tags = tags
    }

    var lastMessage: Message? { messages.last }
    var messageCount: Int { messages.count }

    var preview: String {
        lastMessage?.content.truncated(to: 80) ?? "Aucun message"
    }

    var formattedDate: String {
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .abbreviated
        return formatter.localizedString(for: updatedAt, relativeTo: Date())
    }

    mutating func addMessage(_ message: Message) {
        messages.append(message)
        updatedAt = Date()
        if title == "Nouvelle conversation" && message.role == .user {
            title = message.content.truncated(to: 40)
        }
    }

    mutating func removeLastMessage() {
        guard !messages.isEmpty else { return }
        messages.removeLast()
    }

    func toAPIMessages() -> [[String: String]] {
        messages
            .filter { $0.type != .thinking }
            .map { $0.toChatMessage() }
    }
}
