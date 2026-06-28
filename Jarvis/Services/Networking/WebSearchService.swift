import Foundation

final class WebSearchService {
    static let shared = WebSearchService()
    private init() {}

    func search(query: String) async throws -> String {
        guard NetworkService.shared.isConnected else {
            throw NetworkError.noConnection
        }

        let encoded = query.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? query
        let urlString = "https://html.duckduckgo.com/html/?q=\(encoded)"
        guard let url = URL(string: urlString) else { throw NetworkError.invalidURL }

        let data = try await NetworkService.shared.fetch(url: url, headers: [
            "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
            "Accept": "text/html,application/xhtml+xml",
            "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8"
        ])

        guard let html = String(data: data, encoding: .utf8) else {
            throw NetworkError.decodingFailed
        }

        return extractSearchResults(from: html, query: query)
    }

    func fetchPageContent(url: String) async throws -> String {
        let content = try await NetworkService.shared.fetchHTML(from: url)
        return content
    }

    private func extractSearchResults(from html: String, query: String) -> String {
        let stripped = html.stripHTML()
        let lines = stripped.components(separatedBy: .newlines)
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty && $0.count > 30 }
            .prefix(20)

        if lines.isEmpty {
            return "Aucun résultat trouvé pour : \(query)"
        }

        return "Résultats de recherche pour '\(query)':\n\n" + lines.joined(separator: "\n")
    }
}
