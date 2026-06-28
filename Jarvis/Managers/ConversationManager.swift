import Foundation
import Combine

final class ConversationManager: ObservableObject {
    static let shared = ConversationManager()
    @Published var conversations: [Conversation] = []
    @Published var currentConversation: Conversation
    private let storageKey = "jarvis_conversations"

    private init() {
        currentConversation = Conversation()
        loadConversations()
    }

    func startNewConversation() {
        if !currentConversation.messages.isEmpty {
            saveCurrentConversation()
        }
        currentConversation = Conversation()
    }

    func addMessage(_ message: Message) {
        currentConversation.addMessage(message)
    }

    func removeLastMessage() {
        currentConversation.removeLastMessage()
    }

    func updateLastMessage(content: String) {
        guard !currentConversation.messages.isEmpty else { return }
        let lastIndex = currentConversation.messages.count - 1
        currentConversation.messages[lastIndex].content = content
        currentConversation.messages[lastIndex].isStreaming = false
    }

    func saveCurrentConversation() {
        guard !currentConversation.messages.isEmpty else { return }
        if let index = conversations.firstIndex(where: { $0.id == currentConversation.id }) {
            conversations[index] = currentConversation
        } else {
            conversations.insert(currentConversation, at: 0)
        }
        persistConversations()
    }

    func deleteConversation(id: UUID) {
        conversations.removeAll { $0.id == id }
        persistConversations()
    }

    func toggleFavorite(id: UUID) {
        if let index = conversations.firstIndex(where: { $0.id == id }) {
            conversations[index].isFavorite.toggle()
            persistConversations()
        }
    }

    func loadConversation(_ conversation: Conversation) {
        if !currentConversation.messages.isEmpty {
            saveCurrentConversation()
        }
        currentConversation = conversation
    }

    func searchConversations(query: String) -> [Conversation] {
        guard !query.isEmpty else { return conversations }
        return conversations.filter {
            $0.title.localizedCaseInsensitiveContains(query) ||
            $0.messages.contains { $0.content.localizedCaseInsensitiveContains(query) }
        }
    }

    func conversations(for category: ConversationCategory) -> [Conversation] {
        conversations.filter { $0.category == category }
    }

    var favorites: [Conversation] {
        conversations.filter { $0.isFavorite }
    }

    var recentMessages: [[String: String]] {
        let limit = SettingsManager.shared.settings.maxHistoryMessages
        let messages = currentConversation.messages
            .filter { $0.type != .thinking }
            .suffix(limit)
        return messages.map { $0.toChatMessage() }
    }

    private func persistConversations() {
        let toSave = Array(conversations.prefix(100))
        if let data = try? JSONEncoder().encode(toSave) {
            UserDefaults.standard.set(data, forKey: storageKey)
        }
    }

    private func loadConversations() {
        if let data = UserDefaults.standard.data(forKey: storageKey),
           let decoded = try? JSONDecoder().decode([Conversation].self, from: data) {
            conversations = decoded
        }
    }
}
