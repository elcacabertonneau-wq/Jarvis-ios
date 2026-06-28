import Foundation

final class LocalAIService: AIServiceProtocol {
    let provider: AIProvider = .local

    private var serverURL: String {
        SettingsManager.shared.settings.localServerURL
    }

    func sendMessage(
        messages: [[String: String]],
        model: String,
        systemPrompt: String
    ) async throws -> String {
        let url = URL(string: "\(serverURL)/api/chat")!
        var allMessages: [[String: String]] = [["role": "system", "content": systemPrompt]]
        allMessages.append(contentsOf: messages)

        let body: [String: Any] = [
            "model": model,
            "messages": allMessages,
            "stream": false
        ]

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        request.timeoutInterval = 120

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 else {
            throw AIServiceError.networkError("Serveur local non disponible")
        }

        guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let message = json["message"] as? [String: Any],
              let content = message["content"] as? String
        else {
            throw AIServiceError.decodingError("Impossible de décoder la réponse du modèle local")
        }
        return content
    }

    func sendMessageStreaming(
        messages: [[String: String]],
        model: String,
        systemPrompt: String
    ) -> AsyncThrowingStream<String, Error> {
        AsyncThrowingStream { continuation in
            Task {
                do {
                    let url = URL(string: "\(self.serverURL)/api/chat")!
                    var allMessages: [[String: String]] = [["role": "system", "content": systemPrompt]]
                    allMessages.append(contentsOf: messages)

                    let body: [String: Any] = [
                        "model": model,
                        "messages": allMessages,
                        "stream": true
                    ]

                    var request = URLRequest(url: url)
                    request.httpMethod = "POST"
                    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
                    request.httpBody = try JSONSerialization.data(withJSONObject: body)

                    let (stream, response) = try await URLSession.shared.bytes(for: request)
                    guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 else {
                        continuation.finish(throwing: AIServiceError.networkError("Serveur local non disponible"))
                        return
                    }

                    for try await line in stream.lines {
                        guard !line.isEmpty else { continue }
                        if let data = line.data(using: .utf8),
                           let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                           let message = json["message"] as? [String: Any],
                           let content = message["content"] as? String {
                            continuation.yield(content)
                        }
                        if let data = line.data(using: .utf8),
                           let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                           let done = json["done"] as? Bool, done {
                            break
                        }
                    }
                    continuation.finish()
                } catch {
                    continuation.finish(throwing: error)
                }
            }
        }
    }

    func analyzeImage(imageData: Data, prompt: String, model: String) async throws -> String {
        throw AIServiceError.notSupported
    }
}
