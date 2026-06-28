import Foundation
import UIKit

@MainActor
final class CommandManager {
    static let shared = CommandManager()
    private init() {}

    func execute(_ text: String) async -> String? {
        guard let command = CommandParser.parse(text) else { return nil }

        switch command.category {
        case .weather:
            return await handleWeather(command)
        case .calendar:
            return await handleCalendar(command)
        case .reminder:
            return await handleReminder(text)
        case .note:
            return handleNote(text)
        case .music:
            return await handleMusic(command, originalText: text)
        case .timer:
            return handleTimer(text)
        case .camera:
            return nil // Handled by the main view
        case .search:
            return await handleSearch(command)
        case .translate:
            return nil // Let AI handle translation
        case .openApp:
            return await handleOpenApp(text)
        case .calculate:
            return nil // Let AI handle calculations
        case .system:
            return handleSystemCommand(text)
        case .conversation:
            return nil
        }
    }

    private func handleWeather(_ command: ParsedCommand) async -> String {
        let location = command.parameters["location"] ?? "ma position"
        do {
            let weather = try await WeatherService.shared.requestWeather(for: location)
            return weather.jarvisDescription
        } catch {
            return "Je n'arrive pas à obtenir la météo, Monsieur. \(error.localizedDescription)"
        }
    }

    private func handleCalendar(_ command: ParsedCommand) async -> String {
        if command.action == "list" {
            return await CalendarService.shared.upcomingEventsDescription()
        }
        return "Pour créer un événement, pourriez-vous me donner plus de détails, Monsieur ?"
    }

    private func handleReminder(_ text: String) async -> String {
        let (title, date) = ReminderService.shared.parseReminderFromText(text)
        do {
            _ = try await ReminderService.shared.createReminder(title: title, dueDate: date)
            if let date {
                let formatter = DateFormatter()
                formatter.dateFormat = "d MMMM 'à' HH:mm"
                formatter.locale = Locale(identifier: "fr_FR")
                return "Rappel créé pour '\(title)' le \(formatter.string(from: date)), Monsieur."
            }
            return "Rappel créé : '\(title)', Monsieur."
        } catch {
            return "Je n'ai pas pu créer le rappel, Monsieur. Vérifiez les permissions."
        }
    }

    private func handleNote(_ text: String) -> String {
        NotesService.shared.createFromText(text)
    }

    private func handleMusic(_ command: ParsedCommand, originalText: String) async -> String {
        let lower = originalText.lowercased()
        if lower.contains("spotify") {
            let query = originalText
                .replacingOccurrences(of: "(?i)(joue|lance|mets).*spotify\\s*", with: "", options: .regularExpression)
                .trimmingCharacters(in: .whitespacesAndNewlines)
            return await MusicService.shared.openSpotify(query: query.isEmpty ? "musique" : query)
        }

        let query = originalText
            .replacingOccurrences(of: "(?i)(joue|lance|mets|écouter)\\s*(la musique|la chanson)?\\s*", with: "", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)

        if lower.contains("pause") || lower.contains("stop") {
            MusicService.shared.pause()
            return "Musique mise en pause, Monsieur."
        }
        if lower.contains("suivant") || lower.contains("next") {
            MusicService.shared.next()
            return "Piste suivante, Monsieur."
        }

        return (try? await MusicService.shared.play(query: query.isEmpty ? "musique" : query))
            ?? "Je lance la musique, Monsieur."
    }

    private func handleTimer(_ text: String) -> String {
        let lower = text.lowercased()
        var seconds = 0

        let hourPattern = try? NSRegularExpression(pattern: "(\\d+)\\s*heure")
        let minutePattern = try? NSRegularExpression(pattern: "(\\d+)\\s*minute")
        let secondPattern = try? NSRegularExpression(pattern: "(\\d+)\\s*seconde")

        func extractNumber(from pattern: NSRegularExpression?, in string: String) -> Int? {
            guard let match = pattern?.firstMatch(in: string, range: NSRange(string.startIndex..., in: string)),
                  let range = Range(match.range(at: 1), in: string)
            else { return nil }
            return Int(string[range])
        }

        if let h = extractNumber(from: hourPattern, in: lower) { seconds += h * 3600 }
        if let m = extractNumber(from: minutePattern, in: lower) { seconds += m * 60 }
        if let s = extractNumber(from: secondPattern, in: lower) { seconds += s }

        guard seconds > 0 else { return "Combien de temps souhaitez-vous pour le minuteur, Monsieur ?" }

        DispatchQueue.main.asyncAfter(deadline: .now() + Double(seconds)) {
            Task {
                await ReminderService.shared.scheduleLocalNotification(
                    title: "Minuteur JARVIS terminé",
                    date: Date(),
                    notes: "Votre minuteur est terminé, Monsieur."
                )
            }
        }

        let h = seconds / 3600, m = (seconds % 3600) / 60, s = seconds % 60
        var parts: [String] = []
        if h > 0 { parts.append("\(h) heure\(h > 1 ? "s" : "")") }
        if m > 0 { parts.append("\(m) minute\(m > 1 ? "s" : "")") }
        if s > 0 { parts.append("\(s) seconde\(s > 1 ? "s" : "")") }
        return "Minuteur démarré pour \(parts.joined(separator: " et ")), Monsieur."
    }

    private func handleSearch(_ command: ParsedCommand) async -> String {
        let query = command.parameters["query"] ?? command.rawText
        do {
            return try await WebSearchService.shared.search(query: query)
        } catch {
            return "Je n'arrive pas à effectuer la recherche, Monsieur. \(error.localizedDescription)"
        }
    }

    private func handleOpenApp(_ text: String) async -> String {
        let appMap: [String: String] = [
            "maps": "maps://",
            "carte": "maps://",
            "safari": "https://",
            "mail": "mailto:",
            "téléphone": "tel:",
            "facetime": "facetime://",
            "messages": "sms:",
            "photos": "photos-redirect://",
            "paramètres": "app-settings:",
            "réglages": "app-settings:"
        ]

        let lower = text.lowercased()
        for (keyword, scheme) in appMap {
            if lower.contains(keyword), let url = URL(string: scheme) {
                if UIApplication.shared.canOpenURL(url) {
                    await UIApplication.shared.open(url)
                    return "J'ouvre \(keyword), Monsieur."
                }
            }
        }
        return "Je n'ai pas trouvé cette application, Monsieur."
    }

    private func handleSystemCommand(_ text: String) -> String {
        let lower = text.lowercased()
        if lower.contains("heure") || lower.contains("quelle heure") {
            return "Il est \(Date().formattedForHUD), Monsieur."
        }
        if lower.contains("date") || lower.contains("quel jour") {
            let formatter = DateFormatter()
            formatter.dateFormat = "EEEE d MMMM yyyy"
            formatter.locale = Locale(identifier: "fr_FR")
            return "Nous sommes le \(formatter.string(from: Date())), Monsieur."
        }
        return "Commande non reconnue."
    }
}
