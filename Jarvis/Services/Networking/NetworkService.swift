import Foundation
import Network

final class NetworkService: ObservableObject {
    static let shared = NetworkService()

    @Published var isConnected: Bool = true
    @Published var connectionType: ConnectionType = .unknown

    private let monitor = NWPathMonitor()
    private let queue = DispatchQueue(label: "com.jarvis.network.monitor")

    enum ConnectionType {
        case wifi, cellular, ethernet, unknown, none
        var displayName: String {
            switch self {
            case .wifi: return "Wi-Fi"
            case .cellular: return "Cellulaire"
            case .ethernet: return "Ethernet"
            case .unknown: return "Inconnu"
            case .none: return "Déconnecté"
            }
        }
    }

    private init() {
        startMonitoring()
    }

    private func startMonitoring() {
        monitor.pathUpdateHandler = { [weak self] path in
            DispatchQueue.main.async {
                self?.isConnected = path.status == .satisfied
                if path.usesInterfaceType(.wifi) {
                    self?.connectionType = .wifi
                } else if path.usesInterfaceType(.cellular) {
                    self?.connectionType = .cellular
                } else if path.usesInterfaceType(.wiredEthernet) {
                    self?.connectionType = .ethernet
                } else if path.status == .satisfied {
                    self?.connectionType = .unknown
                } else {
                    self?.connectionType = .none
                }
            }
        }
        monitor.start(queue: queue)
    }

    func fetch(url: URL, headers: [String: String] = [:]) async throws -> Data {
        guard isConnected else { throw NetworkError.noConnection }

        var request = URLRequest(url: url)
        request.timeoutInterval = 30
        headers.forEach { request.setValue($1, forHTTPHeaderField: $0) }

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse,
              (200...299).contains(httpResponse.statusCode)
        else { throw NetworkError.invalidResponse }

        return data
    }

    func fetchHTML(from urlString: String) async throws -> String {
        guard let url = URL(string: urlString) else { throw NetworkError.invalidURL }
        let data = try await fetch(url: url, headers: [
            "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15"
        ])
        guard let html = String(data: data, encoding: .utf8) else {
            throw NetworkError.decodingFailed
        }
        return html.stripHTML().truncated(to: 3000)
    }

    deinit {
        monitor.cancel()
    }
}

enum NetworkError: LocalizedError {
    case noConnection
    case invalidURL
    case invalidResponse
    case decodingFailed

    var errorDescription: String? {
        switch self {
        case .noConnection: return "Pas de connexion réseau"
        case .invalidURL: return "URL invalide"
        case .invalidResponse: return "Réponse invalide"
        case .decodingFailed: return "Impossible de décoder la réponse"
        }
    }
}
