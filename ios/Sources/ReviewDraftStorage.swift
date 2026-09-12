import Foundation

struct BroDraft: Codable {
    var revision: String
    let accountID: String
    let nightID: String
    var baseReview: BroReview
    var baseProfile: BroProfile
    var payload: BroPayload
    var answer: String
    var savedAt: Date
}

/// Main-actor serialization and revision checks protect two review windows from overwriting each other.
@MainActor
final class BroDraftStorage {
    private let directory: URL
    let accountID: String
    let nightID: String
    init(accountID: String, nightID: String, root: URL? = nil) {
        self.accountID = accountID.lowercased(); self.nightID = nightID.lowercased()
        directory = (root ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("BA4L/ReviewDrafts", isDirectory: true))
            .appendingPathComponent(self.accountID, isDirectory: true).appendingPathComponent(self.nightID, isDirectory: true)
    }
    func read(bowler: Int) throws -> BroDraft? {
        let file = try url(bowler)
        guard FileManager.default.fileExists(atPath: file.path) else { return nil }
        let data = try Data(contentsOf: file)
        guard data.count <= 2_000_000 else { throw failure("This saved review is too large to open safely. The original file has been kept.") }
        let draft = try JSONDecoder().decode(BroDraft.self, from: data)
        guard draft.accountID == accountID, draft.nightID == nightID, draft.payload.bowler == bowler else { throw failure("This saved review does not match the account and night. It has not been replaced.") }
        return draft
    }
    func latest() throws -> BroDraft? {
        try (0..<4).compactMap { try read(bowler: $0) }.max { $0.savedAt < $1.savedAt }
    }
    @discardableResult
    func write(_ value: BroDraft, expectedRevision: String?) throws -> BroDraft {
        let file = try url(value.payload.bowler)
        let existing = try read(bowler: value.payload.bowler)
        guard existing?.revision == expectedRevision else { throw failure("Another review window saved a newer draft. Reload the saved draft before making changes.") }
        guard value.accountID == accountID, value.nightID == nightID else { throw failure("This review belongs to another account. Nothing was saved.") }
        var draft = value
        draft.revision = UUID().uuidString; draft.savedAt = Date()
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let data = try JSONEncoder().encode(draft)
        #if os(iOS)
        try data.write(to: file, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        #else
        try data.write(to: file, options: .atomic)
        #endif
        var backupDirectory = directory
        var values = URLResourceValues(); values.isExcludedFromBackup = true
        try? backupDirectory.setResourceValues(values)
        return draft
    }
    private func url(_ bowler: Int) throws -> URL {
        guard UUID(uuidString: accountID) != nil, UUID(uuidString: nightID) != nil, (0..<4).contains(bowler) else { throw failure("A signed-in account and valid night are required to save a review draft.") }
        return directory.appendingPathComponent("bowler-\(bowler).json")
    }
    private func failure(_ text: String) -> NSError { NSError(domain: "BA4L.ReviewDraft", code: 0, userInfo: [NSLocalizedDescriptionKey: text]) }
}
