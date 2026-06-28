import Foundation
import SwiftUI
import Combine

@MainActor
final class ChatViewModel: ObservableObject {
    @Published var inputText: String = ""
    @Published var isKeyboardVisible: Bool = false
    @Published var scrollToBottom: Bool = false
    @Published var showingError: String? = nil

    private let jarvisManager = JarvisManager.shared
    private let conversationManager = ConversationManager.shared
    private var cancellables = Set<AnyCancellable>()

    init() {
        conversationManager.$currentConversation
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in
                self?.scrollToBottom = true
            }
            .store(in: &cancellables)
    }

    var messages: [Message] {
        conversationManager.currentConversation.messages
    }

    var isProcessing: Bool {
        jarvisManager.isProcessing
    }

    func sendMessage() {
        let text = inputText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        inputText = ""
        HapticManager.shared.impact(.light)
        Task {
            await jarvisManager.sendTextMessage(text)
        }
    }

    func startVoiceInput() {
        HapticManager.shared.impact(.medium)
        jarvisManager.startListening()
    }

    func stopVoiceInput() {
        jarvisManager.stopListening()
    }

    func newConversation() {
        conversationManager.startNewConversation()
        HapticManager.shared.selection()
    }

    func copyMessage(_ message: Message) {
        UIPasteboard.general.string = message.content
        HapticManager.shared.notification(.success)
    }
}
