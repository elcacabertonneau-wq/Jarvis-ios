import Foundation

final class OpenAIService: AIServiceProtocol {
    let provider: AIProvider = .openAI
    private let baseURL = AppConstants.API.openAIBaseURL

    private var apiKey: String {
        get throws {
            guard let key = KeychainManager.shared.openAIKey, !key.isEmpty else {
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
        var allMessages: [[String: String]] = [["role": "system", "content": systemPrompt]]
        allMessages.append(contentsOf: messages)

        let body: [String: Any] = [
            "model": model,
            "messages": allMessages,
            "max_tokens": 2048,
            "temperature": 0.85
        ]

        let data = try await performRequest(endpoint: "/chat/completions", body: body, apiKey: key)
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
                    var allMessages: [[String: String]] = [["role": "system", "content": systemPrompt]]
                    allMessages.append(contentsOf: messages)

                    let body: [String: Any] = [
                        "model": model,
                        "messages": allMessages,
                        "max_tokens": 2048,
                        "temperature": 0.85,
                        "stream": true
                    ]

                    let url = URL(string: "\(self.baseURL)/chat/completions")!
                    var request = URLRequest(url: url)
                    request.httpMethod = "POST"
                    request.setValue("Bearer \(key)", forHTTPHeaderField: "Authorization")
                    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
                    request.httpBody = try JSONSerialization.data(withJSONObject: body)

                    let (stream, response) = try await URLSession.shared.bytes(for: request)
                    guard let httpResponse = response as? HTTPURLResponse else {
                        continuation.finish(throwing: AIServiceError.invalidResponse)
                        return
                    }
                    try self.validateStatusCode(httpResponse.statusCode)

                    for try await line in stream.lines {
                        guard line.hasPrefix("data: ") else { continue }
                        let jsonString = String(line.dropFirst(6))
                        guard jsonString != "[DONE]" else {
                            continuation.finish()
                            return
                        }
                        if let data = jsonString.data(using: .utf8),
                           let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                           let choices = json["choices"] as? [[String: Any]],
                           let delta = choices.first?["delta"] as? [String: Any],
                           let content = delta["content"] as? String {
                            continuation.yield(content)
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

        let messages: [[String: Any]] = [[
            "role": "user",
            "content": [
                ["type": "text", "text": prompt],
                ["type": "image_url", "image_url": ["url": "data:image/jpeg;base64,\(base64Image)"]]
            ]
        ]]

        let body: [String: Any] = [
            "model": model.contains("mini") ? "gpt-4o-mini" : "gpt-4o",
            "messages": messages,
            "max_tokens": 1024
        ]

        let data = try await performRequest(endpoint: "/chat/completions", body: body, apiKey: key)
        return try parseResponse(data)
    }

    private func performRequest(endpoint: String, body: [String: Any], apiKey: String) async throws -> Data {
        let url = URL(string: "\(baseURL)\(endpoint)")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")
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
              let choices = json["choices"] as? [[String: Any]],
              let message = choices.first?["message"] as? [String: Any],
              let content = message["content"] as? String
        else {
            throw AIServiceError.decodingError("Impossible de décoder la réponse OpenAI")
        }
        return content
    }

    private func validateStatusCode(_ code: Int) throws {
        switch code {
        case 200...299: break
        case 401: throw AIServiceError.unauthorized
        case 429: throw AIServiceError.rateLimited
        case 400...499: throw AIServiceError.serverError(code)
        case 500...599: throw AIServiceError.serverError(code)
        default: throw AIServiceError.serverError(code)
        }
    }
}
