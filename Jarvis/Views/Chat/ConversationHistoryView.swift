import SwiftUI

struct ConversationHistoryView: View {
    @EnvironmentObject var conversationManager: ConversationManager
    @EnvironmentObject var jarvisManager: JarvisManager
    @Environment(\.dismiss) var dismiss
    @State private var searchQuery = ""
    @State private var selectedCategory: ConversationCategory? = nil
    @State private var showFavoritesOnly = false

    var filteredConversations: [Conversation] {
        var list = conversationManager.searchConversations(query: searchQuery)
        if showFavoritesOnly { list = list.filter { $0.isFavorite } }
        if let cat = selectedCategory { list = list.filter { $0.category == cat } }
        return list
    }

    var body: some View {
        ZStack {
            HolographicBackground()

            VStack(spacing: 0) {
                // Header
                HStack {
                    Button(action: { dismiss() }) {
                        Image(systemName: "xmark")
                            .font(.system(size: 16, weight: .light))
                            .foregroundColor(AppConstants.Colors.primaryCyan)
                    }

                    Spacer()

                    Text("HISTORIQUE")
                        .font(AppConstants.Fonts.hudSubtitle)
                        .foregroundColor(AppConstants.Colors.primaryCyan)
                        .tracking(4)

                    Spacer()

                    Button(action: { conversationManager.startNewConversation() }) {
                        Image(systemName: "plus")
                            .font(.system(size: 16, weight: .light))
                            .foregroundColor(AppConstants.Colors.primaryCyan)
                    }
                }
                .padding(.horizontal, 20)
                .padding(.vertical, 16)
                .background(Rectangle().fill(.ultraThinMaterial).overlay(Rectangle().fill(AppConstants.Colors.darkBackground.opacity(0.7))))

                // Search
                HStack(spacing: 10) {
                    Image(systemName: "magnifyingglass")
                        .foregroundColor(AppConstants.Colors.primaryCyan.opacity(0.6))
                        .font(.system(size: 14))
                    TextField("", text: $searchQuery, prompt:
                        Text("Rechercher une conversation...")
                            .foregroundColor(AppConstants.Colors.primaryCyan.opacity(0.4))
                            .font(.system(size: 13, weight: .light, design: .monospaced))
                    )
                    .font(.system(size: 13, weight: .light))
                    .foregroundColor(.white)
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .glassmorphic(cornerRadius: 10)
                .padding(.horizontal, 16)
                .padding(.vertical, 10)

                // Category filters
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        FilterChip(title: "Favoris", icon: "star.fill", isSelected: showFavoritesOnly) {
                            showFavoritesOnly.toggle()
                        }
                        ForEach(ConversationCategory.allCases) { cat in
                            FilterChip(title: cat.rawValue, icon: cat.icon, isSelected: selectedCategory == cat) {
                                selectedCategory = selectedCategory == cat ? nil : cat
                            }
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 4)
                }

                // Conversations list
                if filteredConversations.isEmpty {
                    Spacer()
                    VStack(spacing: 12) {
                        Image(systemName: "bubble.left.and.bubble.right")
                            .font(.system(size: 40, weight: .ultraLight))
                            .foregroundColor(AppConstants.Colors.primaryCyan.opacity(0.3))
                        Text("Aucune conversation")
                            .font(AppConstants.Fonts.hudSubtitle)
                            .foregroundColor(AppConstants.Colors.primaryCyan.opacity(0.5))
                            .tracking(2)
                    }
                    Spacer()
                } else {
                    ScrollView {
                        LazyVStack(spacing: 8) {
                            ForEach(filteredConversations) { conv in
                                ConversationRowView(
                                    conversation: conv,
                                    onTap: {
                                        conversationManager.loadConversation(conv)
                                        dismiss()
                                    },
                                    onDelete: {
                                        conversationManager.deleteConversation(id: conv.id)
                                    },
                                    onToggleFavorite: {
                                        conversationManager.toggleFavorite(id: conv.id)
                                    }
                                )
                            }
                        }
                        .padding(.horizontal, 16)
                        .padding(.vertical, 8)
                    }
                }
            }
        }
        .preferredColorScheme(.dark)
    }
}

struct ConversationRowView: View {
    let conversation: Conversation
    let onTap: () -> Void
    let onDelete: () -> Void
    let onToggleFavorite: () -> Void

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 12) {
                // Category icon
                Image(systemName: conversation.category.icon)
                    .font(.system(size: 16, weight: .light))
                    .foregroundColor(AppConstants.Colors.primaryCyan)
                    .frame(width: 32, height: 32)
                    .background(Circle().fill(AppConstants.Colors.primaryCyan.opacity(0.1)))

                VStack(alignment: .leading, spacing: 4) {
                    HStack {
                        Text(conversation.title)
                            .font(.system(size: 13, weight: .medium, design: .monospaced))
                            .foregroundColor(.white)
                            .lineLimit(1)
                        Spacer()
                        Text(conversation.formattedDate)
                            .font(.system(size: 10, weight: .light, design: .monospaced))
                            .foregroundColor(AppConstants.Colors.primaryCyan.opacity(0.5))
                    }

                    Text(conversation.preview)
                        .font(.system(size: 11, weight: .light))
                        .foregroundColor(.white.opacity(0.5))
                        .lineLimit(2)

                    HStack {
                        Text("\(conversation.messageCount) messages")
                            .font(.system(size: 9, weight: .light, design: .monospaced))
                            .foregroundColor(AppConstants.Colors.primaryCyan.opacity(0.4))
                        Spacer()
                        if conversation.isFavorite {
                            Image(systemName: "star.fill")
                                .font(.system(size: 10))
                                .foregroundColor(AppConstants.Colors.warningOrange)
                        }
                    }
                }
            }
            .padding(12)
            .glassmorphic(cornerRadius: 12)
        }
        .swipeActions(edge: .trailing) {
            Button(role: .destructive, action: onDelete) {
                Label("Supprimer", systemImage: "trash")
            }
        }
        .swipeActions(edge: .leading) {
            Button(action: onToggleFavorite) {
                Label(conversation.isFavorite ? "Retirer" : "Favori", systemImage: conversation.isFavorite ? "star.slash" : "star")
            }
            .tint(AppConstants.Colors.warningOrange)
        }
    }
}

struct FilterChip: View {
    let title: String
    let icon: String
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 4) {
                Image(systemName: icon)
                    .font(.system(size: 9, weight: .light))
                Text(title)
                    .font(.system(size: 10, weight: .light, design: .monospaced))
                    .tracking(1)
            }
            .foregroundColor(isSelected ? AppConstants.Colors.darkBackground : AppConstants.Colors.primaryCyan)
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(
                Capsule()
                    .fill(isSelected ? AppConstants.Colors.primaryCyan : AppConstants.Colors.primaryCyan.opacity(0.1))
                    .overlay(Capsule().stroke(AppConstants.Colors.primaryCyan.opacity(0.4), lineWidth: 0.5))
            )
        }
    }
}
