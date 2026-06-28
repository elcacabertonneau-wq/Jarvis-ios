import SwiftUI

struct MessageBubbleView: View {
    let message: Message
    let onCopy: () -> Void

    @State private var isExpanded = false
    @State private var showActions = false

    var isUser: Bool { message.isFromUser }
    var bubbleColor: Color {
        message.isFromJarvis ? AppConstants.Colors.panelBackground : AppConstants.Colors.accentBlue.opacity(0.3)
    }
    var textColor: Color {
        message.isFromJarvis ? AppConstants.Colors.primaryCyan : .white
    }

    var body: some View {
        HStack(alignment: .bottom, spacing: 8) {
            if isUser { Spacer(minLength: 60) }

            if !isUser {
                // JARVIS avatar
                ZStack {
                    Circle()
                        .fill(AppConstants.Colors.darkBackground)
                        .frame(width: 28, height: 28)
                        .overlay(Circle().stroke(AppConstants.Colors.primaryCyan.opacity(0.5), lineWidth: 1))

                    ArcReactorView(size: 20, isActive: false)
                }
            }

            VStack(alignment: isUser ? .trailing : .leading, spacing: 4) {
                // Sender label
                HStack {
                    if !isUser {
                        Text("JARVIS")
                            .font(.system(size: 9, weight: .medium, design: .monospaced))
                            .foregroundColor(AppConstants.Colors.primaryCyan.opacity(0.7))
                            .tracking(2)
                    }
                    Text(message.formattedTime)
                        .font(.system(size: 9, weight: .light, design: .monospaced))
                        .foregroundColor(.white.opacity(0.3))
                    if isUser {
                        Text("VOUS")
                            .font(.system(size: 9, weight: .medium, design: .monospaced))
                            .foregroundColor(AppConstants.Colors.accentBlue.opacity(0.8))
                            .tracking(2)
                    }
                }

                // Message bubble
                messageBubble
                    .onTapGesture {
                        withAnimation(.spring(response: 0.3)) {
                            showActions.toggle()
                        }
                    }
                    .onLongPressGesture {
                        HapticManager.shared.impact(.light)
                        showActions = true
                    }

                // Action buttons
                if showActions {
                    HStack(spacing: 8) {
                        Button(action: onCopy) {
                            Label("Copier", systemImage: "doc.on.doc")
                                .font(.system(size: 10, weight: .light))
                                .foregroundColor(AppConstants.Colors.primaryCyan.opacity(0.8))
                        }
                        if !isUser {
                            Button(action: {
                                SpeechSynthesisService.shared.speakJarvisResponse(message.content)
                                showActions = false
                            }) {
                                Label("Écouter", systemImage: "speaker.wave.2")
                                    .font(.system(size: 10, weight: .light))
                                    .foregroundColor(AppConstants.Colors.primaryCyan.opacity(0.8))
                            }
                        }
                    }
                    .transition(.opacity.combined(with: .move(edge: .bottom)))
                }
            }

            if !isUser { Spacer(minLength: 60) }
            if isUser {
                // User avatar
                ZStack {
                    Circle()
                        .fill(AppConstants.Colors.accentBlue.opacity(0.3))
                        .frame(width: 28, height: 28)
                        .overlay(Circle().stroke(AppConstants.Colors.accentBlue.opacity(0.5), lineWidth: 1))

                    Image(systemName: "person.fill")
                        .font(.system(size: 12))
                        .foregroundColor(AppConstants.Colors.accentBlue)
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 4)
    }

    @ViewBuilder
    private var messageBubble: some View {
        if message.type == .thinking {
            ThinkingBubble()
        } else {
            VStack(alignment: isUser ? .trailing : .leading, spacing: 0) {
                Text(message.content)
                    .font(.system(size: 14, weight: .light, design: .default))
                    .foregroundColor(textColor)
                    .multilineTextAlignment(isUser ? .trailing : .leading)
                    .lineLimit(isExpanded ? nil : 20)
                    .fixedSize(horizontal: false, vertical: true)

                if message.content.count > 500 {
                    Button(isExpanded ? "Voir moins" : "Voir plus") {
                        withAnimation { isExpanded.toggle() }
                    }
                    .font(.system(size: 11, weight: .light, design: .monospaced))
                    .foregroundColor(AppConstants.Colors.primaryCyan.opacity(0.7))
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .background(
                RoundedRectangle(cornerRadius: isUser ? 16 : 16)
                    .fill(.ultraThinMaterial)
                    .overlay(
                        RoundedRectangle(cornerRadius: 16)
                            .fill(bubbleColor)
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: 16)
                            .stroke(
                                isUser ? AppConstants.Colors.accentBlue.opacity(0.4) : AppConstants.Colors.primaryCyan.opacity(0.3),
                                lineWidth: 0.5
                            )
                    )
            )
            .if(!isUser) { view in
                view.jarvisGlow(color: AppConstants.Colors.primaryCyan, radius: 6)
            }
        }
    }
}

extension View {
    @ViewBuilder
    func `if`<Transform: View>(_ condition: Bool, transform: (Self) -> Transform) -> some View {
        if condition {
            transform(self)
        } else {
            self
        }
    }
}

struct ThinkingBubble: View {
    @State private var dotScale: [CGFloat] = [1, 1, 1]

    var body: some View {
        HStack(spacing: 4) {
            ForEach(0..<3) { i in
                Circle()
                    .fill(AppConstants.Colors.primaryCyan)
                    .frame(width: 6, height: 6)
                    .scaleEffect(dotScale[i])
                    .animation(
                        .easeInOut(duration: 0.5)
                        .repeatForever()
                        .delay(Double(i) * 0.15),
                        value: dotScale[i]
                    )
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(.ultraThinMaterial)
                .overlay(
                    RoundedRectangle(cornerRadius: 16)
                        .fill(AppConstants.Colors.panelBackground)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 16)
                        .stroke(AppConstants.Colors.primaryCyan.opacity(0.3), lineWidth: 0.5)
                )
        )
        .onAppear {
            for i in 0..<3 {
                DispatchQueue.main.asyncAfter(deadline: .now() + Double(i) * 0.15) {
                    dotScale[i] = 0.5
                }
            }
        }
    }
}
