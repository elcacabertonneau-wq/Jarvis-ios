import Foundation

struct JarvisNote: Identifiable, Codable {
    let id: UUID
    var title: String
    var content: String
    var createdAt: Date
    var updatedAt: Date
    var tags: [String]

    init(id: UUID = UUID(), title: String, content: String, tags: [String] = []) {
        self.id = id
        self.title = title
        self.content = content
        self.createdAt = Date()
        self.updatedAt = Date()
        self.tags = tags
    }
}

final class NotesService: ObservableObject {
    static let shared = NotesService()
    @Published var notes: [JarvisNote] = []
    private let storageKey = "jarvis_notes"
    private init() { loadNotes() }

    func createNote(title: String, content: String, tags: [String] = []) -> JarvisNote {
        let note = JarvisNote(title: title, content: content, tags: tags)
        notes.insert(note, at: 0)
        saveNotes()
        return note
    }

    func updateNote(_ note: JarvisNote) {
        if let index = notes.firstIndex(where: { $0.id == note.id }) {
            var updated = note
            updated = JarvisNote(id: note.id, title: note.title, content: note.content, tags: note.tags)
            notes[index] = updated
            saveNotes()
        }
    }

    func deleteNote(id: UUID) {
        notes.removeAll { $0.id == id }
        saveNotes()
    }

    func search(query: String) -> [JarvisNote] {
        guard !query.isEmpty else { return notes }
        return notes.filter {
            $0.title.localizedCaseInsensitiveContains(query) ||
            $0.content.localizedCaseInsensitiveContains(query) ||
            $0.tags.contains { $0.localizedCaseInsensitiveContains(query) }
        }
    }

    func createFromText(_ text: String) -> String {
        var title = text
            .replacingOccurrences(of: "(?i)(note|noter|écris|mémorise)(\\s+que)?\\s*:?\\s*", with: "", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)

        if title.count > 50 {
            let content = title
            title = String(title.prefix(50))
            let note = createNote(title: title, content: content)
            return "Note créée : '\(note.title)', Monsieur."
        } else {
            let note = createNote(title: title, content: text)
            return "Note enregistrée : '\(note.title)', Monsieur."
        }
    }

    private func saveNotes() {
        if let data = try? JSONEncoder().encode(notes) {
            UserDefaults.standard.set(data, forKey: storageKey)
        }
    }

    private func loadNotes() {
        if let data = UserDefaults.standard.data(forKey: storageKey),
           let decoded = try? JSONDecoder().decode([JarvisNote].self, from: data) {
            notes = decoded
        }
    }
}
