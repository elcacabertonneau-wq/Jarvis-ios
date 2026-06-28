import Foundation

final class GeminiService: AIServiceProtocol {
    let provider: AIProvider = .gemini
    private let baseURL = AppConstants.API.geminiBaseURL

    private var apiKey: String {
        get throws {
            guard let key = KeychainManager.shared.geminiKey, !key.isEmpty else {
                throw AIServiceError.noAPIKey
            }
            return key
        }
    }

    func sendMessage(
        messages: [[String: String]],
        model: String,
        systemPrompt: String
    ) async throws -> String {
        let key = try apiKey
        let contents = buildContents(from: messages, systemPrompt: systemPrompt)

        let body: [String: Any] = [
            "contents": contents,
            "generationConfig": [
                "maxOutputTokens": 2048,
                "temperature": 0.85
            ]
        ]

        let data = try await performRequest(model: model, body: body, apiKey: key)
        return try parseResponse(data)
    }

    func sendMessageStreaming(
        messages: [[String: String]],
        model: String,
        systemPrompt: String
    ) -> AsyncThrowingStream<String, Error> {
        AsyncThrowingStream { continuation in
            Task {
                do {
                    let key = try self.apiKey
                    let contents = self.buildContents(from: messages, systemPrompt: systemPrompt)

                    let body: [String: Any] = [
                        "contents": contents,
                        "generationConfig": ["maxOutputTokens": 2048, "temperature": 0.85]
                    ]

                    let url = URL(string: "\(self.baseURL)/models/\(model):streamGenerateContent?key=\(key)")!
                    var request = URLRequest(url: url)
                    request.httpMethod = "POST"
                    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
                    request.httpBody = try JSONSerialization.data(withJSONObject: body)

                    let (stream, response) = try await URLSession.shared.bytes(for: request)
                    guard let httpResponse = response as? HTTPURLResponse else {
                        continuation.finish(throwing: AIServiceError.invalidResponse)
                        return
                    }
                    try self.validateStatusCode(httpResponse.statusCode)

                    var buffer = ""
                    for try await char in stream.characters {
                        buffer.append(char)
                        if buffer.hasSuffix("\n") {
                            if let data = buffer.data(using: .utf8),
                               let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                               let candidates = json["candidates"] as? [[String: Any]],
                               let content = candidates.first?["content"] as? [String: Any],
                               let parts = content["parts"] as? [[String: Any]],
                               let text = parts.first?["text"] as? String {
                                continuation.yield(text)
                            }
                            buffer = ""
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
        let key = try apiKey
        let base64Image = imageData.base64EncodedString()

        let contents: [[String: Any]] = [[
            "parts": [
                ["text": prompt],
                ["inline_data": ["mime_type": "image/jpeg", "data": base64Image]]
            ]
        ]]

        let body: [String: Any] = [
            "contents": contents,
            "generationConfig": ["maxOutputTokens": 1024]
        ]

        let visionModel = model.contains("flash") ? model : "gemini-2.0-flash"
        let data = try await performRequest(model: visionModel, body: body, apiKey: key)
        return try parseResponse(data)
    }

    private func buildContents(from messages: [[String: String]], systemPrompt: String) -> [[String: Any]] {
        var contents: [[String: Any]] = []

        // Inject system prompt as first user turn
        if !systemPrompt.isEmpty {
            contents.append([
                "role": "user",
                "parts": [["text": "Instructions système: \(systemPrompt)"]]
            ])
            contents.append([
                "role": "model",
                "parts": [["text": "Bien compris. Je suis JARVIS, votre assistant personnel. Comment puis-je vous aider ?"]]
            ])
        }

        for message in messages {
            let role = message["role"] == "user" ? "user" : "model"
            let content = message["content"] ?? ""
            contents.append(["role": role, "parts": [["text": content]]])
        }
        return contents
    }

    private func performRequest(model: String, body: [String: Any], apiKey: String) async throws -> Data {
        let url = URL(string: "\(baseURL)/models/\(model):generateContent?key=\(apiKey)")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        request.timeoutInterval = 60

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw AIServiceError.invalidResponse
        }
        try validateStatusCode(httpResponse.statusCode)
        return data
    }

    private func parseResponse(_ data: Data) throws -> String {
        guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let candidates = json["candidates"] as? [[String: Any]],
              let content = candidates.first?["content"] as? [String: Any],
              let parts = content["parts"] as? [[String: Any]],
              let text = parts.first?["text"] as? String
        else {
            throw AIServiceError.decodingError("Impossible de décoder la réponse Gemini")
        }
        return text
    }

    private func validateStatusCode(_ code: Int) throws {
        switch code {
        case 200...299: break
        case 401, 403: throw AIServiceError.unauthorized
        case 429: throw AIServiceError.rateLimited
        case 400...499: throw AIServiceError.serverError(code)
        case 500...599: throw AIServiceError.serverError(code)
        default: throw AIServiceError.serverError(code)
        }
    }
}
