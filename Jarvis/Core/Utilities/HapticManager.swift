import UIKit

final class HapticManager {
    static let shared = HapticManager()
    private init() {}

    func impact(_ style: UIImpactFeedbackGenerator.FeedbackStyle = .medium) {
        guard SettingsManager.shared.hapticFeedbackEnabled else { return }
        let generator = UIImpactFeedbackGenerator(style: style)
        generator.prepare()
        generator.impactOccurred()
    }

    func notification(_ type: UINotificationFeedbackGenerator.FeedbackType) {
        guard SettingsManager.shared.hapticFeedbackEnabled else { return }
        let generator = UINotificationFeedbackGenerator()
        generator.prepare()
        generator.notificationOccurred(type)
    }

    func selection() {
        guard SettingsManager.shared.hapticFeedbackEnabled else { return }
        let generator = UISelectionFeedbackGenerator()
        generator.prepare()
        generator.selectionChanged()
    }

    func jarvisWake() {
        impact(.heavy)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) { [weak self] in
            self?.impact(.medium)
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) { [weak self] in
            self?.impact(.light)
        }
    }

    func jarvisSpeaking() {
        impact(.soft)
    }

    func commandExecuted() {
        notification(.success)
    }

    func error() {
        notification(.error)
    }
}
