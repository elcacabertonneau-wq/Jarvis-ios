import Foundation

extension String {
    var isNotEmpty: Bool { !isEmpty }

    func containsAny(_ words: [String]) -> Bool {
        let lowercased = self.lowercased()
        return words.contains { lowercased.contains($0) }
    }

    func truncated(to length: Int, trailing: String = "...") -> String {
        guard self.count > length else { return self }
        return String(self.prefix(length)) + trailing
    }

    var wordCount: Int {
        components(separatedBy: .whitespacesAndNewlines)
            .filter { !$0.isEmpty }.count
    }

    func stripHTML() -> String {
        guard let data = self.data(using: .utf8) else { return self }
        let options: [NSAttributedString.DocumentReadingOptionKey: Any] = [
            .documentType: NSAttributedString.DocumentType.html,
            .characterEncoding: String.Encoding.utf8.rawValue
        ]
        if let attributed = try? NSAttributedString(data: data, options: options, documentAttributes: nil) {
            return attributed.string
        }
        return self.replacingOccurrences(of: "<[^>]+>", with: "", options: .regularExpression)
    }

    var isWakeWord: Bool {
        AppConstants.Speech.wakeWords.contains { self.lowercased().contains($0) }
    }
}

extension Date {
    var jarvisGreeting: String {
        let hour = Calendar.current.component(.hour, from: self)
        switch hour {
        case 5..<12: return AppConstants.Jarvis.greetingMorning
        case 12..<18: return AppConstants.Jarvis.greetingAfternoon
        default: return AppConstants.Jarvis.greetingEvening
        }
    }

    var formattedForHUD: String {
        let formatter = DateFormatter()
        formatter.dateFormat = "HH:mm:ss"
        return formatter.string(from: self)
    }

    var formattedDate: String {
        let formatter = DateFormatter()
        formatter.dateFormat = "dd/MM/yyyy"
        return formatter.string(from: self)
    }
}
