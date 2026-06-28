import Foundation
import Speech
import AVFoundation
import Combine

enum SpeechRecognitionState {
    case idle
    case preparing
    case listening
    case processing
    case error(String)
}

final class SpeechRecognitionService: NSObject, ObservableObject {
    static let shared = SpeechRecognitionService()

    @Published var recognizedText: String = ""
    @Published var partialText: String = ""
    @Published var state: SpeechRecognitionState = .idle
    @Published var audioLevel: Float = 0.0

    private var recognizer: SFSpeechRecognizer?
    private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
    private var recognitionTask: SFSpeechRecognitionTask?
    private let audioEngine = AVAudioEngine()
    private var silenceTimer: Timer?
    private var onTranscription: ((String) -> Void)?

    private override init() {
        super.init()
        setupRecognizer()
    }

    private func setupRecognizer() {
        let locale = Locale(identifier: SettingsManager.shared.settings.selectedLanguage)
        recognizer = SFSpeechRecognizer(locale: locale)
        recognizer?.delegate = self
    }

    var isAvailable: Bool {
        recognizer?.isAvailable ?? false
    }

    func requestPermission() async -> Bool {
        await withCheckedContinuation { continuation in
            SFSpeechRecognizer.requestAuthorization { status in
                continuation.resume(returning: status == .authorized)
            }
        }
    }

    func startListening(onTranscription: @escaping (String) -> Void) {
        guard isAvailable else {
            state = .error("Reconnaissance vocale non disponible")
            return
        }

        stopListening()
        self.onTranscription = onTranscription
        state = .preparing

        do {
            try startAudioEngine()
            state = .listening
        } catch {
            state = .error(error.localizedDescription)
        }
    }

    func stopListening() {
        silenceTimer?.invalidate()
        silenceTimer = nil

        if audioEngine.isRunning {
            audioEngine.stop()
            audioEngine.inputNode.removeTap(onBus: 0)
        }

        recognitionRequest?.endAudio()
        recognitionRequest = nil
        recognitionTask?.cancel()
        recognitionTask = nil

        state = .idle
        partialText = ""
        audioLevel = 0.0
    }

    private func startAudioEngine() throws {
        recognitionRequest = SFSpeechAudioBufferRecognitionRequest()
        guard let recognitionRequest else { return }

        recognitionRequest.shouldReportPartialResults = true
        recognitionRequest.requiresOnDeviceRecognition = false

        let inputNode = audioEngine.inputNode
        let recordingFormat = inputNode.outputFormat(forBus: 0)

        inputNode.installTap(onBus: 0, bufferSize: 1024, format: recordingFormat) { [weak self] buffer, _ in
            self?.recognitionRequest?.append(buffer)
            self?.calculateAudioLevel(buffer: buffer)
        }

        audioEngine.prepare()
        try audioEngine.start()

        recognitionTask = recognizer?.recognitionTask(with: recognitionRequest) { [weak self] result, error in
            guard let self else { return }

            if let result {
                let transcript = result.bestTranscription.formattedString
                DispatchQueue.main.async {
                    self.partialText = transcript
                }

                self.resetSilenceTimer(transcript: transcript)

                if result.isFinal {
                    DispatchQueue.main.async {
                        self.recognizedText = transcript
                        self.onTranscription?(transcript)
                        self.state = .processing
                    }
                }
            }

            if let error {
                DispatchQueue.main.async {
                    if (error as NSError).code != 1110 {
                        self.state = .error(error.localizedDescription)
                    }
                }
            }
        }
    }

    private func resetSilenceTimer(transcript: String) {
        silenceTimer?.invalidate()
        silenceTimer = Timer.scheduledTimer(withTimeInterval: 1.5, repeats: false) { [weak self] _ in
            guard let self, !transcript.isEmpty else { return }
            DispatchQueue.main.async {
                self.recognizedText = transcript
                self.onTranscription?(transcript)
                self.state = .processing
                self.stopListening()
            }
        }
    }

    private func calculateAudioLevel(buffer: AVAudioPCMBuffer) {
        guard let channelData = buffer.floatChannelData?[0] else { return }
        let frames = buffer.frameLength
        var sum: Float = 0
        for i in 0..<Int(frames) {
            sum += channelData[i] * channelData[i]
        }
        let rms = sqrt(sum / Float(frames))
        let level = max(0, min(1, rms * 10))
        DispatchQueue.main.async { [weak self] in
            self?.audioLevel = level
        }
    }

    func updateLocale() {
        let locale = Locale(identifier: SettingsManager.shared.settings.selectedLanguage)
        recognizer = SFSpeechRecognizer(locale: locale)
        recognizer?.delegate = self
    }
}

extension SpeechRecognitionService: SFSpeechRecognizerDelegate {
    func speechRecognizer(_ speechRecognizer: SFSpeechRecognizer, availabilityDidChange available: Bool) {
        DispatchQueue.main.async { [weak self] in
            if !available {
                self?.state = .error("Reconnaissance vocale indisponible")
            }
        }
    }
}
