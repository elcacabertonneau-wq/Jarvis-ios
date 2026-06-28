import SwiftUI

struct GlassmorphicCard<Content: View>: View {
    let content: Content
    let cornerRadius: CGFloat
    let borderColor: Color
    let hasShadow: Bool

    init(
        cornerRadius: CGFloat = 16,
        borderColor: Color = AppConstants.Colors.primaryCyan,
        hasShadow: Bool = true,
        @ViewBuilder content: () -> Content
    ) {
        self.cornerRadius = cornerRadius
        self.borderColor = borderColor
        self.hasShadow = hasShadow
        self.content = content()
    }

    var body: some View {
        content
            .background(
                RoundedRectangle(cornerRadius: cornerRadius)
                    .fill(.ultraThinMaterial)
                    .overlay(
                        RoundedRectangle(cornerRadius: cornerRadius)
                            .fill(
                                LinearGradient(
                                    colors: [
                                        Color.white.opacity(0.08),
                                        Color.white.opacity(0.02)
                                    ],
                                    startPoint: .topLeading,
                                    endPoint: .bottomTrailing
                                )
                            )
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: cornerRadius)
                            .stroke(
                                LinearGradient(
                                    colors: [
                                        borderColor.opacity(0.5),
                                        borderColor.opacity(0.1),
                                        borderColor.opacity(0.3)
                                    ],
                                    startPoint: .topLeading,
                                    endPoint: .bottomTrailing
                                ),
                                lineWidth: 1
                            )
                    )
            )
            .conditionalModifier(hasShadow) { view in
                view.shadow(color: borderColor.opacity(0.1), radius: 10, x: 0, y: 5)
            }
    }
}

struct HUDPanel<Content: View>: View {
    let title: String
    let icon: String
    let content: Content
    let color: Color

    init(
        title: String,
        icon: String,
        color: Color = AppConstants.Colors.primaryCyan,
        @ViewBuilder content: () -> Content
    ) {
        self.title = title
        self.icon = icon
        self.color = color
        self.content = content()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Image(systemName: icon)
                    .font(.system(size: 10, weight: .light))
                    .foregroundColor(color)
                Text(title.uppercased())
                    .font(AppConstants.Fonts.hudSmall)
                    .foregroundColor(color)
                    .tracking(2)
                Spacer()
                Rectangle()
                    .fill(color.opacity(0.4))
                    .frame(height: 0.5)
                    .frame(maxWidth: 40)
            }

            content
        }
        .padding(12)
        .glassmorphic(cornerRadius: 12)
    }
}

struct StatusBadge: View {
    let text: String
    let isOnline: Bool
    let color: Color

    init(text: String, isOnline: Bool, color: Color = AppConstants.Colors.primaryCyan) {
        self.text = text
        self.isOnline = isOnline
        self.color = color
    }

    var statusColor: Color {
        isOnline ? color : AppConstants.Colors.dangerRed.opacity(0.8)
    }

    var body: some View {
        HStack(spacing: 4) {
            Circle()
                .fill(statusColor)
                .frame(width: 5, height: 5)
                .neonGlow(color: statusColor, radius: 3, isActive: isOnline)

            Text(text.uppercased())
                .font(AppConstants.Fonts.hudSmall)
                .foregroundColor(statusColor)
                .tracking(1)
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(statusColor.opacity(0.1))
        .overlay(
            RoundedRectangle(cornerRadius: 4)
                .stroke(statusColor.opacity(0.3), lineWidth: 0.5)
        )
    }
}
