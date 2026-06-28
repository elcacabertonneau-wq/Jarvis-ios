import Foundation
import Combine
import SwiftUI
import UIKit

@MainActor
final class JarvisManager: ObservableObject {
    static let shared = JarvisManager()

    @Published var state: JarvisState = .idle
    @Published var isWakeWordDetected: Bool = false
    @Published var currentTranscript: String = ""
    @Published var isProcessing: Bool = false
    @Published var audioLevel: Float = 0.0
    @Published var isContinuousMode: Bool = false

    private let speechRecognition = SpeechRecognitionService.shared
    private let speechSynthesis = SpeechSynthesisService.shared
    private let conversationManager = ConversationManager.shared
    private let settingsManager = SettingsManager.shared
    private var wakeWordSession: AnyCancellable?
    private var cancellables = Set<AnyCancellable>()

    private init() {
        setupBindings()
    }

    private func setupBindings() {
        speechRecognition.$audioLevel
            .receive(on: DispatchQueue.main)
            .assign(to: \.audioLevel, on: self)
            .store(in: &cancellables)

        speechSynthesis.$isSpeaking
            .receive(on: DispatchQueue.main)
            .sink { [weak self] speaking in
                if speaking {
                    self?.state = .speaking
                } else if self?.state == .speaking {
                    self?.state = .idle
                }
            }
            .store(in: &cancellables)
    }

    func initialize() async {
        await PermissionsManager.shared.requestAll()
        let hasPermissions = PermissionsManager.shared.essentialPermissionsGranted
        if hasPermissions {
            await greetUser()
        }
    }

    func greetUser() async {
        let greeting = Date().jarvisGreeting
        await speak(greeting)
    }

    func wake() {
        guard state == .idle else { return }
        isWakeWordDetected = true
        HapticManager.shared.jarvisWake()
        state = .listening
        startListening()
        speak(AppConstants.Jarvis.wakeResponse)
    }

    func startListening() {
        guard state != .speaking else { return }
        state = .listening

        speechRecognition.startListening { [weak self] transcript in
            Task { @MainActor in
                await self?.processTranscript(transcript)
            }
        }
    }

    func stopListening() {
        speechRecognition.stopListening()
        if state == .listening {
            state = .idle
        }
    }

    func startWakeWordDetection() {
        isContinuousMode = true
        speechRecognition.startListening { [weak self] transcript in
            Task { @MainActor in
                guard let self else { return }
                if transcript.isWakeWord {
                    self.wake()
                }
            }
        }
    }

    func stopWakeWordDetection() {
        isContinuousMode = false
        speechRecognition.stopListening()
    }

    func sendTextMessage(_ text: String) async {
        guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        await processUserInput(text)
    }

    func processTranscript(_ transcript: String) async {
        guard !transcript.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            state = .idle
            return
        }
        currentTranscript = transcript
        await processUserInput(transcript)
    }

    private func processUserInput(_ input: String) async {
        isWakeWordDetected = false
        state = .processing
        isProcessing = true

        let userMessage = Message.userMessage(input, type: .text)
        conversationManager.addMessage(userMessage)

        let thinkingMessage = Message.thinkingMessage()
        conversationManager.addMessage(thinkingMessage)

        // Try system commands first
        if let commandResponse = await CommandManager.shared.execute(input) {
            conversationManager.removeLastMessage()
            let response = Message.jarvisMessage(commandResponse)
            conversationManager.addMessage(response)
            await speakResponse(commandResponse)
            isProcessing = false
            return
        }

        // Enrich with context if needed
        var enrichedInput = input
        if input.lowercased().contains("recherche") || input.lowercased().contains("cherche") {
            if let searchResults = try? await WebSearchService.shared.search(query: input) {
                enrichedInput = "L'utilisateur demande: \(input)\n\nRésultats de recherche web:\n\(searchResults)\n\nRéponds en te basant sur ces informations."
            }
        }

        await streamAIResponse(for: enrichedInput)
    }

    private func streamAIResponse(for input: String) async {
        let service = AIServiceFactory.currentService()
        let settings = settingsManager.settings
        var messages = conversationManager.recentMessages

        // Remove thinking placeholder from context
        if messages.last?["content"] == "..." {
            messages.removeLast()
        }

        // Replace last user message with enriched input if needed
        if messages.last?["role"] == "user" {
            messages[messages.count - 1]["content"] = input
        }

        var fullResponse = ""

        if settingsManager.streamingEnabled {
            let stream = service.sendMessageStreaming(
                messages: messages,
                model: settings.selectedModel,
                systemPrompt: AppConstants.Jarvis.systemPrompt
            )

            do {
                for try await chunk in stream {
                    fullResponse += chunk
                    conversationManager.updateLastMessage(content: fullResponse)
                }
            } catch {
                fullResponse = (error as? AIServiceError)?.jarvisMessage ?? AppConstants.Jarvis.errorResponse
                conversationManager.updateLastMessage(content: fullResponse)
                HapticManager.shared.error()
            }
        } else {
            do {
                fullResponse = try await service.sendMessage(
                    messages: messages,
                    model: settings.selectedModel,
                    systemPrompt: AppConstants.Jarvis.systemPrompt
                )
                conversationManager.updateLastMessage(content: fullResponse)
            } catch {
                fullResponse = (error as? AIServiceError)?.jarvisMessage ?? AppConstants.Jarvis.errorResponse
                conversationManager.updateLastMessage(content: fullResponse)
                HapticManager.shared.error()
            }
        }

        HapticManager.shared.commandExecuted()
        conversationManager.saveCurrentConversation()
        await speakResponse(fullResponse)
        isProcessing = false
    }

    func speak(_ text: String) async {
        guard settingsManager.autoReadResponses else { return }
        state = .speaking
        await withCheckedContinuation { continuation in
            speechSynthesis.speakJarvisResponse(text) {
                continuation.resume()
            }
        }
        if state == .speaking {
            state = .idle
        }
    }

    private func speakResponse(_ text: String) async {
        guard settingsManager.autoReadResponses && !text.isEmpty else {
            state = .idle
            return
        }
        await speak(text)
    }

    func analyzeImageWithAI(_ imageData: Data, prompt: String) async -> String {
        let service = AIServiceFactory.currentService()
        let settings = settingsManager.settings
        do {
            return try await service.analyzeImage(
                imageData: imageData,
                prompt: prompt,
                model: settings.selectedModel
            )
        } catch AIServiceError.notSupported {
            if let visionResult = try? await VisionService.shared.generateImageDescription(
                for: UIImage(data: imageData) ?? UIImage()
            ) {
                return visionResult
            }
            return "Analyse d'image non disponible avec ce modèle, Monsieur."
        } catch {
            return "Je n'ai pas pu analyser l'image, Monsieur."
        }
    }

    func stopSpeaking() {
        speechSynthesis.stop()
        state = .idle
    }

    var isSpeaking: Bool { speechSynthesis.isSpeaking }
    var isListening: Bool { state == .listening }
    var speechProgress: Double { speechSynthesis.speechProgress }
}
