import SwiftUI

struct ChatView: View {
    @StateObject private var viewModel = ChatViewModel()
    @EnvironmentObject var jarvisManager: JarvisManager
    @EnvironmentObject var conversationManager: ConversationManager
    @FocusState private var isInputFocused: Bool
    @State private var scrollProxy: ScrollViewProxy? = nil
    @Environment(\.dismiss) var dismiss

    var body: some View {
        ZStack {
            HolographicBackground()

            VStack(spacing: 0) {
                // Header
                chatHeader

                // Messages
                ScrollViewReader { proxy in
                    ScrollView {
                        LazyVStack(spacing: 0) {
                            if conversationManager.currentConversation.messages.isEmpty {
                                emptyState
                            } else {
                                ForEach(conversationManager.currentConversation.messages) { message in
                                    MessageBubbleView(message: message) {
                                        viewModel.copyMessage(message)
                                    }
                                    .id(message.id)
                                    .transition(.asymmetric(
                                        insertion: .move(edge: .bottom).combined(with: .opacity),
                                        removal: .opacity
                                    ))
                                }
                            }
                        }
                        .padding(.vertical, 16)
                        .animation(.spring(response: 0.3), value: conversationManager.currentConversation.messages.count)
                    }
                    .onAppear { scrollProxy = proxy }
                    .onChange(of: conversationManager.currentConversation.messages.count) { _, _ in
                        scrollToBottom(proxy: proxy)
                    }
                    .onChange(of: viewModel.scrollToBottom) { _, _ in
                        scrollToBottom(proxy: proxy)
                    }
                }

                // Input area
                inputArea
            }
        }
        .preferredColorScheme(.dark)
    }

    private var chatHeader: some View {
        HStack {
            Button(action: { dismiss() }) {
                Image(systemName: "chevron.down")
                    .font(.system(size: 16, weight: .light))
                    .foregroundColor(AppConstants.Colors.primaryCyan)
            }

            Spacer()

            VStack(spacing: 2) {
                Text("CONVERSATION JARVIS")
                    .font(AppConstants.Fonts.hudSubtitle)
                    .foregroundColor(AppConstants.Colors.primaryCyan)
                    .tracking(3)
                Text("\(conversationManager.currentConversation.messages.count) MESSAGES")
                    .font(AppConstants.Fonts.hudSmall)
                    .foregroundColor(AppConstants.Colors.primaryCyan.opacity(0.5))
                    .tracking(2)
            }

            Spacer()

            Button(action: {
                viewModel.newConversation()
            }) {
                Image(systemName: "square.and.pencil")
                    .font(.system(size: 16, weight: .light))
                    .foregroundColor(AppConstants.Colors.primaryCyan)
            }
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 12)
        .background(
            Rectangle()
                .fill(.ultraThinMaterial)
                .overlay(
                    Rectangle()
                        .fill(AppConstants.Colors.darkBackground.opacity(0.6))
                )
                .overlay(
                    Rectangle()
                        .frame(height: 0.5)
                        .foregroundColor(AppConstants.Colors.primaryCyan.opacity(0.3)),
                    alignment: .bottom
                )
        )
        .ignoresSafeArea(edges: .top)
    }

    private var inputArea: some View {
        VStack(spacing: 0) {
            Rectangle()
                .fill(AppConstants.Colors.primaryCyan.opacity(0.2))
                .frame(height: 0.5)

            HStack(spacing: 12) {
                // Voice button
                Button(action: {
                    if jarvisManager.state == .listening {
                        viewModel.stopVoiceInput()
                    } else {
                        viewModel.startVoiceInput()
                    }
                }) {
                    Image(systemName: jarvisManager.state == .listening ? "mic.fill" : "mic")
                        .font(.system(size: 20, weight: .light))
                        .foregroundColor(
                            jarvisManager.state == .listening
                                ? AppConstants.Colors.neonGreen
                                : AppConstants.Colors.primaryCyan
                        )
                        .frame(width: 36, height: 36)
                        .background(
                            Circle()
                                .fill(AppConstants.Colors.primaryCyan.opacity(0.1))
                                .overlay(Circle().stroke(AppConstants.Colors.primaryCyan.opacity(0.3), lineWidth: 1))
                        )
                        .neonGlow(
                            color: AppConstants.Colors.neonGreen,
                            radius: 8,
                            isActive: jarvisManager.state == .listening
                        )
                }

                // Text field
                HStack {
                    TextField("", text: $viewModel.inputText, prompt:
                        Text("Parlez ou écrivez à JARVIS...")
                            .foregroundColor(AppConstants.Colors.primaryCyan.opacity(0.3))
                            .font(.system(size: 14, weight: .light, design: .monospaced))
                    )
                    .font(.system(size: 14, weight: .light))
                    .foregroundColor(.white)
                    .focused($isInputFocused)
                    .onSubmit { viewModel.sendMessage() }
                    .submitLabel(.send)

                    if !viewModel.inputText.isEmpty {
                        Button(action: { viewModel.inputText = "" }) {
                            Image(systemName: "xmark.circle.fill")
                                .font(.system(size: 14))
                                .foregroundColor(AppConstants.Colors.primaryCyan.opacity(0.5))
                        }
                    }
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .background(
                    RoundedRectangle(cornerRadius: 20)
                        .fill(.ultraThinMaterial)
                        .overlay(
                            RoundedRectangle(cornerRadius: 20)
                                .stroke(AppConstants.Colors.primaryCyan.opacity(0.3), lineWidth: 0.5)
                        )
                )

                // Send button
                Button(action: viewModel.sendMessage) {
                    Image(systemName: "arrow.up.circle.fill")
                        .font(.system(size: 32, weight: .light))
                        .foregroundColor(
                            viewModel.inputText.isEmpty
                                ? AppConstants.Colors.primaryCyan.opacity(0.3)
                                : AppConstants.Colors.primaryCyan
                        )
                        .neonGlow(
                            color: AppConstants.Colors.primaryCyan,
                            radius: 8,
                            isActive: !viewModel.inputText.isEmpty
                        )
                }
                .disabled(viewModel.inputText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .background(
                Rectangle()
                    .fill(.ultraThinMaterial)
                    .overlay(Rectangle().fill(AppConstants.Colors.darkBackground.opacity(0.7)))
            )
        }
    }

    private var emptyState: some View {
        VStack(spacing: 24) {
            Spacer(minLength: 60)

            ArcReactorView(size: 80, isActive: true)
                .neonGlow(color: AppConstants.Colors.primaryCyan, radius: 20)

            VStack(spacing: 8) {
                Text("JARVIS EST PRÊT")
                    .font(AppConstants.Fonts.hudSubtitle)
                    .foregroundColor(AppConstants.Colors.primaryCyan)
                    .tracking(4)

                Text("Comment puis-je vous assister aujourd'hui, Monsieur ?")
                    .font(AppConstants.Fonts.hudBody)
                    .foregroundColor(AppConstants.Colors.primaryCyan.opacity(0.6))
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 40)
            }

            // Suggestions
            VStack(spacing: 8) {
                suggestionChip("Quelle est la météo aujourd'hui ?")
                suggestionChip("Montre mes événements du jour")
                suggestionChip("Explique-moi l'intelligence artificielle")
                suggestionChip("Crée un rappel pour demain")
            }

            Spacer()
        }
    }

    private func suggestionChip(_ text: String) -> some View {
        Button(action: {
            viewModel.inputText = text
            viewModel.sendMessage()
        }) {
            Text(text)
                .font(.system(size: 13, weight: .light))
                .foregroundColor(AppConstants.Colors.primaryCyan.opacity(0.8))
                .padding(.horizontal, 16)
                .padding(.vertical, 8)
                .background(
                    Capsule()
                        .fill(AppConstants.Colors.primaryCyan.opacity(0.08))
                        .overlay(Capsule().stroke(AppConstants.Colors.primaryCyan.opacity(0.3), lineWidth: 0.5))
                )
        }
    }

    private func scrollToBottom(proxy: ScrollViewProxy) {
        guard let lastMessage = conversationManager.currentConversation.messages.last else { return }
        withAnimation(.spring(response: 0.4)) {
            proxy.scrollTo(lastMessage.id, anchor: .bottom)
        }
    }
}
