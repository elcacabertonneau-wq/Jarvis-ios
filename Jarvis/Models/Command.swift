import Foundation

enum CommandCategory: String, CaseIterable {
    case weather = "météo"
    case calendar = "calendrier"
    case reminder = "rappel"
    case note = "note"
    case music = "musique"
    case search = "recherche"
    case timer = "minuteur"
    case calculate = "calcul"
    case translate = "traduction"
    case openApp = "application"
    case camera = "caméra"
    case system = "système"
    case conversation = "conversation"
}

struct ParsedCommand {
    let category: CommandCategory
    let action: String
    let parameters: [String: String]
    let rawText: String

    init(category: CommandCategory, action: String, parameters: [String: String] = [:], rawText: String) {
        self.category = category
        self.action = action
        self.parameters = parameters
        self.rawText = rawText
    }
}

struct CommandParser {
    static func parse(_ text: String) -> ParsedCommand? {
        let lower = text.lowercased()

        // Weather commands
        if lower.contains("météo") || lower.contains("temps") || lower.contains("température") || lower.contains("pluie") {
            var location = "ma position"
            if lower.contains("à ") {
                let parts = lower.components(separatedBy: "à ")
                if parts.count > 1 {
                    location = parts[1].components(separatedBy: " ").prefix(2).joined(separator: " ")
                }
            }
            return ParsedCommand(category: .weather, action: "get", parameters: ["location": location], rawText: text)
        }

        // Calendar commands
        if lower.contains("calendrier") || lower.contains("agenda") || lower.contains("rendez-vous") || lower.contains("réunion") {
            if lower.contains("ajouter") || lower.contains("créer") || lower.contains("planifier") {
                return ParsedCommand(category: .calendar, action: "create", rawText: text)
            }
            return ParsedCommand(category: .calendar, action: "list", rawText: text)
        }

        // Reminder commands
        if lower.contains("rappel") || lower.contains("rappelle") || lower.contains("souvenir") {
            return ParsedCommand(category: .reminder, action: "create", rawText: text)
        }

        // Note commands
        if lower.contains("note") || lower.contains("noter") || lower.contains("écris") || lower.contains("mémorise") {
            return ParsedCommand(category: .note, action: "create", rawText: text)
        }

        // Music commands
        if lower.contains("musique") || lower.contains("chanson") || lower.contains("joue") || lower.contains("lance") {
            if lower.contains("spotify") {
                return ParsedCommand(category: .music, action: "open_spotify", rawText: text)
            }
            return ParsedCommand(category: .music, action: "play", rawText: text)
        }

        // Timer commands
        if lower.contains("minuteur") || lower.contains("timer") || lower.contains("dans") && (lower.contains("minute") || lower.contains("heure") || lower.contains("seconde")) {
            return ParsedCommand(category: .timer, action: "start", rawText: text)
        }

        // Camera commands
        if lower.contains("caméra") || lower.contains("photo") || lower.contains("vois") || lower.contains("regarde") || lower.contains("scan") {
            if lower.contains("scan") || lower.contains("texte") {
                return ParsedCommand(category: .camera, action: "scan_text", rawText: text)
            }
            return ParsedCommand(category: .camera, action: "describe", rawText: text)
        }

        // Search commands
        if lower.contains("cherche") || lower.contains("recherche") || lower.contains("trouve") || lower.contains("c'est quoi") {
            let query = text.replacingOccurrences(of: "(?i)(cherche|recherche|trouve|c'est quoi) ", with: "", options: .regularExpression)
            return ParsedCommand(category: .search, action: "web", parameters: ["query": query], rawText: text)
        }

        // Translation commands
        if lower.contains("traduis") || lower.contains("traduction") || lower.contains("en anglais") || lower.contains("en français") || lower.contains("en espagnol") {
            return ParsedCommand(category: .translate, action: "translate", rawText: text)
        }

        // App open commands
        if lower.contains("ouvre") || lower.contains("lance l'application") || lower.contains("ouvrir") {
            return ParsedCommand(category: .openApp, action: "open", rawText: text)
        }

        return nil
    }
}
