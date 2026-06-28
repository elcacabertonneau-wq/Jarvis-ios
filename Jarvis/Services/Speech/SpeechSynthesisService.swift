import Foundation
import AVFoundation
import Combine

final class SpeechSynthesisService: NSObject, ObservableObject {
    static let shared = SpeechSynthesisService()

    @Published var isSpeaking: Bool = false
    @Published var speechProgress: Double = 0.0

    private let synthesizer = AVSpeechSynthesizer()
    private var onComplete: (() -> Void)?
    private var speakingTimer: Timer?

    private override init() {
        super.init()
        synthesizer.delegate = self
    }

    var availableVoices: [AVSpeechSynthesisVoice] {
        AVSpeechSynthesisVoice.speechVoices()
            .filter { $0.language.hasPrefix("fr") || $0.language.hasPrefix("en") }
            .sorted { $0.name < $1.name }
    }

    func speak(_ text: String, onComplete: (() -> Void)? = nil) {
        stop()
        self.onComplete = onComplete

        let utterance = makeUtterance(for: text)
        isSpeaking = true
        synthesizer.speak(utterance)
    }

    func speakJarvisResponse(_ text: String, onComplete: (() -> Void)? = nil) {
        let cleaned = text
            .replacingOccurrences(of: "**", with: "")
            .replacingOccurrences(of: "*", with: "")
            .replacingOccurrences(of: "#", with: "")
            .replacingOccurrences(of: "`", with: "")
        speak(cleaned, onComplete: onComplete)
    }

    func stop() {
        if synthesizer.isSpeaking {
            synthesizer.stopSpeaking(at: .immediate)
        }
        isSpeaking = false
        speechProgress = 0.0
        speakingTimer?.invalidate()
    }

    func pause() {
        synthesizer.pauseSpeaking(at: .word)
    }

    func resume() {
        synthesizer.continueSpeaking()
    }

    private func makeUtterance(for text: String) -> AVSpeechUtterance {
        let utterance = AVSpeechUtterance(string: text)

        let settings = SettingsManager.shared.settings
        if let voice = AVSpeechSynthesisVoice(identifier: settings.selectedVoiceIdentifier) {
            utterance.voice = voice
        } else {
            utterance.voice = AVSpeechSynthesisVoice(language: settings.selectedLanguage)
                ?? AVSpeechSynthesisVoice(language: "fr-FR")
        }

        utterance.rate = 0.52
        utterance.pitchMultiplier = 0.92
        utterance.volume = 0.95
        utterance.preUtteranceDelay = 0.1
        utterance.postUtteranceDelay = 0.1

        return utterance
    }
}

extension SpeechSynthesisService: AVSpeechSynthesizerDelegate {
    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didStart utterance: AVSpeechUtterance) {
        DispatchQueue.main.async { [weak self] in
            self?.isSpeaking = true
        }
    }

    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        DispatchQueue.main.async { [weak self] in
            self?.isSpeaking = false
            self?.speechProgress = 0.0
            self?.onComplete?()
            self?.onComplete = nil
        }
    }

    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) {
        DispatchQueue.main.async { [weak self] in
            self?.isSpeaking = false
            self?.speechProgress = 0.0
        }
    }

    func speechSynthesizer(
        _ synthesizer: AVSpeechSynthesizer,
        willSpeakRangeOfSpeechString characterRange: NSRange,
        utterance: AVSpeechUtterance
    ) {
        let progress = Double(characterRange.location) / Double(utterance.speechString.count)
        DispatchQueue.main.async { [weak self] in
            self?.speechProgress = progress
        }
    }
}
