import Foundation

final class ClaudeService: AIServiceProtocol {
    let provider: AIProvider = .claude
    private let baseURL = AppConstants.API.claudeBaseURL
    private let apiVersion = "2023-06-01"

    private var apiKey: String {
        get throws {
            guard let key = KeychainManager.shared.claudeKey, !key.isEmpty else {
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
        let body: [String: Any] = [
            "model": model,
            "max_tokens": 2048,
            "system": systemPrompt,
            "messages": messages
        ]

        let data = try await performRequest(endpoint: "/messages", body: body, apiKey: key)
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
                    let body: [String: Any] = [
                        "model": model,
                        "max_tokens": 2048,
                        "system": systemPrompt,
                        "messages": messages,
                        "stream": true
                    ]

                    let url = URL(string: "\(self.baseURL)/messages")!
                    var request = URLRequest(url: url)
                    request.httpMethod = "POST"
                    request.setValue(key, forHTTPHeaderField: "x-api-key")
                    request.setValue(self.apiVersion, forHTTPHeaderField: "anthropic-version")
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
                        if let data = jsonString.data(using: .utf8),
                           let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
                            if let type_ = json["type"] as? String, type_ == "content_block_delta",
                               let delta = json["delta"] as? [String: Any],
                               let text = delta["text"] as? String {
                                continuation.yield(text)
                            } else if let type_ = json["type"] as? String, type_ == "message_stop" {
                                continuation.finish()
                                return
                            }
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
                ["type": "image", "source": [
                    "type": "base64",
                    "media_type": "image/jpeg",
                    "data": base64Image
                ]],
                ["type": "text", "text": prompt]
            ]
        ]]

        let body: [String: Any] = [
            "model": model,
            "max_tokens": 1024,
            "messages": messages
        ]

        let data = try await performRequest(endpoint: "/messages", body: body, apiKey: key)
        return try parseResponse(data)
    }

    private func performRequest(endpoint: String, body: [String: Any], apiKey: String) async throws -> Data {
        let url = URL(string: "\(baseURL)\(endpoint)")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue(apiKey, forHTTPHeaderField: "x-api-key")
        request.setValue(apiVersion, forHTTPHeaderField: "anthropic-version")
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
              let content = json["content"] as? [[String: Any]],
              let firstBlock = content.first,
              let text = firstBlock["text"] as? String
        else {
            throw AIServiceError.decodingError("Impossible de décoder la réponse Claude")
        }
        return text
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
