import Foundation

struct BowlingGame: Codable, Equatable {
    private(set) var rolls: [Int] = []

    var frames: [[Int]] {
        var result: [[Int]] = []
        var index = 0
        for _ in 0..<9 {
            guard index < rolls.count else { return result }
            let count = rolls[index] == 10 ? 1 : min(2, rolls.count - index)
            result.append(Array(rolls[index..<(index + count)]))
            index += count
        }
        if index < rolls.count { result.append(Array(rolls[index...])) }
        return result
    }

    private func finished(_ frame: [Int], tenth: Bool) -> Bool {
        if tenth {
            return frame.count == 3 || (frame.count == 2 && frame.reduce(0, +) < 10)
        }
        return frame.first == 10 || frame.count == 2
    }

    var isComplete: Bool {
        frames.count == 10 && finished(frames[9], tenth: true)
    }

    var frameNumber: Int {
        guard let last = frames.last else { return 1 }
        return min(10, frames.count + (finished(last, tenth: frames.count == 10) ? 1 : 0))
    }

    var ballNumber: Int {
        guard let last = frames.last, !finished(last, tenth: frames.count == 10) else { return 1 }
        return last.count + 1
    }

    var pinsAvailable: Int {
        guard !isComplete else { return 0 }
        guard let last = frames.last, !finished(last, tenth: frames.count == 10) else { return 10 }
        if frames.count < 10 { return 10 - last[0] }
        if last.count == 1 { return last[0] == 10 ? 10 : 10 - last[0] }
        if last[0] < 10 || last[1] == 10 { return 10 }
        return 10 - last[1]
    }

    @discardableResult
    mutating func add(_ pins: Int) -> Bool {
        guard !isComplete, (0...pinsAvailable).contains(pins) else { return false }
        rolls.append(pins)
        return true
    }

    mutating func undo() { if !rolls.isEmpty { rolls.removeLast() } }

    var cumulativeScores: [Int?] {
        var result: [Int?] = []
        var index = 0
        var total = 0
        for frame in 0..<10 {
            guard index < rolls.count else { break }
            if frame == 9 {
                result.append(isComplete ? total + rolls[index...].reduce(0, +) : nil)
                break
            }
            if rolls[index] == 10 {
                if index + 2 < rolls.count {
                    total += 10 + rolls[index + 1] + rolls[index + 2]
                    result.append(total)
                } else { result.append(nil) }
                index += 1
            } else {
                guard index + 1 < rolls.count else { result.append(nil); break }
                let sum = rolls[index] + rolls[index + 1]
                if sum == 10 {
                    if index + 2 < rolls.count { total += 10 + rolls[index + 2]; result.append(total) }
                    else { result.append(nil) }
                } else { total += sum; result.append(total) }
                index += 2
            }
        }
        return result
    }

    var settledScore: Int { cumulativeScores.compactMap { $0 }.last ?? 0 }

    var maximumScore: Int {
        var projection = self
        while !projection.isComplete { projection.add(projection.pinsAvailable) }
        return projection.settledScore
    }

    func symbols(for frame: [Int]) -> String {
        frame.enumerated().map { index, pins in
            if (index == 1 || (index == 2 && frame[0] == 10)) && frame[index - 1] != 10 && frame[index - 1] + pins == 10 { return "/" }
            if pins == 10 { return "X" }
            return pins == 0 ? "–" : String(pins)
        }.joined(separator: "  ")
    }
}

// The shared scorebook contract lives in web/lib/scorebook.ts.
// Keep every field when writing, including fields not displayed by this client.
import Combine

struct Bowler: Identifiable, Codable {
    var id = UUID()
    var name: String
    var game = BowlingGame()
}

struct DrinkTargets: Codable, Equatable {
    var high: Int
    var low: Int
    var qualificationRule: String?

    func encode(to encoder: Encoder) throws {
        var values = encoder.container(keyedBy: CodingKeys.self)
        try values.encode(high, forKey: .high)
        try values.encode(low, forKey: .low)
        // The web schema requires this key even when no rule is confirmed.
        try values.encode(qualificationRule, forKey: .qualificationRule)
    }
}

struct RecordedGame: Codable, Equatable {
    var game: Int
    var rolls: [[Int]]
    var finals: [Int?]?

    func bowling(_ index: Int) -> BowlingGame {
        var value = BowlingGame()
        for pins in rolls[index] { value.add(pins) }
        return value
    }
    func score(_ index: Int) -> Int { finals?[index] ?? bowling(index).settledScore }
    func complete(_ index: Int) -> Bool { finals?[index] != nil || bowling(index).isComplete }
}

struct MatchBowler: Codable, Equatable {
    var name: String
    var handicap: Int
}

struct MatchOpponent: Codable, Equatable {
    var number: Int
    var name: String
    var bowlers: [MatchBowler]
}

struct LeagueMatch: Codable, Equatable {
    var season: String
    var week: Int
    var opponent: MatchOpponent
    var ours: [MatchBowler]
    var opponentGames: [[Int?]]

    func validate() throws {
        guard season.utf16.count <= 60, (1...60).contains(week),
              (0...99).contains(opponent.number), (1...40).contains(opponent.name.utf16.count),
              (1...8).contains(opponent.bowlers.count), ours.count == 4,
              (ours + opponent.bowlers).allSatisfy({ (1...40).contains($0.name.utf16.count) && (0...120).contains($0.handicap) }),
              opponentGames.count <= 1000,
              opponentGames.allSatisfy({ $0.count <= 8 && $0.allSatisfy({ $0 == nil || (0...300).contains($0!) }) }) else { throw ScorebookError.invalidData }
    }
}

struct Night: Codable, Equatable {
    static let names = ["Doug", "Mustafa", "Kyle", "Pete"]
    var game = 1
    var rolls: [[Int]] = Array(repeating: [], count: 4)
    var finals: [Int?]?
    var history: [RecordedGame] = []
    var drinkTargets: DrinkTargets?
    var match: LeagueMatch?
    var current: RecordedGame { RecordedGame(game: game, rolls: rolls, finals: finals) }
    func maximum(_ index: Int) -> Int { finals?[index] ?? current.bowling(index).maximumScore }

    func validated() throws -> Night {
        func check(_ value: RecordedGame) throws {
            guard value.game > 0, value.rolls.count == 4,
                  value.finals == nil || (value.finals!.count == 4 && value.finals!.allSatisfy({ $0 == nil || (0...300).contains($0!) })) else {
                throw ScorebookError.invalidData
            }
            for rolls in value.rolls {
                var bowling = BowlingGame()
                guard rolls.count <= 21, rolls.allSatisfy({ bowling.add($0) }) else { throw ScorebookError.invalidData }
            }
        }
        guard (1...1000).contains(game), history.count <= 500 else { throw ScorebookError.invalidData }
        try check(current)
        for previous in history { try check(previous) }
        if let targets = drinkTargets {
            guard (0...300).contains(targets.high), (0...300).contains(targets.low),
                  targets.qualificationRule == nil || ["exact", "threshold"].contains(targets.qualificationRule!) else { throw ScorebookError.invalidData }
        }
        try match?.validate()
        return self
    }
}

enum ScorebookError: LocalizedError {
    case invalidData, invalidLink, conflict, server(String), storage
    var errorDescription: String? {
        switch self {
        case .invalidData: return "This scorebook contains unsupported or invalid scores. Nothing was changed."
        case .invalidLink: return "Paste a team link from strike-ceiling-web.vercel.app with a valid night ID."
        case .conflict: return "Another phone updated this game. Your edit is backed up. Reload the team scores to continue, or keep this edit for recovery."
        case .server(let message): return message
        case .storage: return "Could not save the backup on this device. Free some storage and retry."
        }
    }
}

struct SharedScorebook: Codable {
    var id: String?
    var state: Night
    var revision: Int
}

struct ScorebookClient {
    static let origin = "https://strike-ceiling-web.vercel.app"
    var send: (URLRequest) async throws -> (Data, HTTPURLResponse) = { request in
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw ScorebookError.invalidData }
        return (data, http)
    }

    static func teamID(from text: String) throws -> String {
        guard let url = URLComponents(string: text.trimmingCharacters(in: .whitespacesAndNewlines)),
              url.scheme == "https", url.host == "strike-ceiling-web.vercel.app", url.port == nil,
              url.user == nil, url.password == nil, url.path == "/" || url.path.isEmpty,
              let values = url.queryItems?.filter({ $0.name == "night" }), values.count == 1,
              let value = values[0].value, let id = UUID(uuidString: value) else { throw ScorebookError.invalidLink }
        return id.uuidString.lowercased()
    }

    func request(_ method: String, id: String? = nil, state: Night? = nil, revision: Int? = nil) async throws -> SharedScorebook {
        if let id, UUID(uuidString: id) == nil { throw ScorebookError.invalidLink }
        let path = "/api/nights" + (id.map { "/\($0)" } ?? "")
        var request = URLRequest(url: URL(string: Self.origin + path)!, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 20)
        request.httpMethod = method
        request.setValue(Self.origin, forHTTPHeaderField: "Origin")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let state {
            struct Update: Encodable { var state: Night; var revision: Int? }
            request.httpBody = try JSONEncoder().encode(Update(state: state.validated(), revision: revision))
            guard request.httpBody!.count <= 150_000 else { throw ScorebookError.server("This scorebook is too large to save. Keep your backup and start a separate scorebook.") }
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        let (data, response) = try await send(request)
        if response.statusCode == 409 { throw ScorebookError.conflict }
        guard (200..<300).contains(response.statusCode) else {
            struct Failure: Decodable { var error: String }
            let message = (try? JSONDecoder().decode(Failure.self, from: data))?.error
            throw ScorebookError.server(message ?? "Team scores are unavailable. Please retry.")
        }
        // Reject unknown state fields rather than silently removing newer web features on PUT.
        guard data.count <= 1_000_000, let root = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let raw = root["state"] as? [String: Any], Set(raw.keys).isSubset(of: ["game", "rolls", "finals", "history", "drinkTargets", "match"]),
              let history = raw["history"] as? [[String: Any]],
              history.allSatisfy({ Set($0.keys).isSubset(of: ["game", "rolls", "finals"]) }) else { throw ScorebookError.invalidData }
        if let targets = raw["drinkTargets"] as? [String: Any], !Set(targets.keys).isSubset(of: ["high", "low", "qualificationRule"]) { throw ScorebookError.invalidData }
        if let match = raw["match"] as? [String: Any] {
            guard Set(match.keys).isSubset(of: ["season", "week", "opponent", "ours", "opponentGames"]),
                  let opponent = match["opponent"] as? [String: Any], Set(opponent.keys).isSubset(of: ["number", "name", "bowlers"]),
                  let ours = match["ours"] as? [[String: Any]], let theirs = opponent["bowlers"] as? [[String: Any]],
                  (ours + theirs).allSatisfy({ Set($0.keys).isSubset(of: ["name", "handicap"]) }) else { throw ScorebookError.invalidData }
        }
        let result = try JSONDecoder().decode(SharedScorebook.self, from: data)
        _ = try result.state.validated()
        guard result.revision > 0 else { throw ScorebookError.invalidData }
        if method == "POST" {
            guard let created = result.id, UUID(uuidString: created) != nil else { throw ScorebookError.invalidData }
        }
        return result
    }
}

struct ScorebookBackup: Codable {
    var night: Night
    var id: String?
    var revision: Int
    var pending: Bool
}

@MainActor
final class ScorebookStore: ObservableObject {
    static let legacyArchiveName = "strike-ceiling.bowlers.v1"
    @Published private(set) var night = Night()
    @Published private(set) var teamID: String?
    @Published private(set) var revision = 0
    @Published private(set) var pending = false
    @Published private(set) var busy = false
    @Published private(set) var error: String?
    @Published private(set) var status = "Saved on this device"
    @Published private(set) var legacy: [Bowler] = []
    @Published private(set) var loaded = false
    private let client: ScorebookClient
    private let defaults: UserDefaults
    private let directory: URL
    private var generation = 0
    private var needsLoad = false
    private var damagedBackup = false
    var canEdit: Bool { loaded && !busy && !pending && !needsLoad && !damagedBackup }
    var canSwitchTeam: Bool { loaded && !busy && !pending && !damagedBackup }
    var shareURL: URL? { teamID.flatMap { URL(string: ScorebookClient.origin + "/?night=" + $0) } }
    var canMigrate: Bool { canEdit && teamID == nil && night == Night() && !legacy.isEmpty }

    init(client: ScorebookClient = ScorebookClient(), defaults: UserDefaults = .standard, directory: URL? = nil) {
        self.client = client
        self.defaults = defaults
        self.directory = directory ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("Scorebooks", isDirectory: true)
    }

    private func backupURL(_ id: String?) -> URL { directory.appendingPathComponent((id ?? "local") + ".json") }
    private func persist(_ value: Night, id: String?, revision: Int, pending: Bool) throws {
        do {
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            let data = try JSONEncoder().encode(ScorebookBackup(night: value.validated(), id: id, revision: revision, pending: pending))
            try data.write(to: backupURL(id), options: .atomic)
        } catch { throw ScorebookError.storage }
    }

    func start() async {
        guard !loaded else { return }
        loaded = true
        if let data = defaults.data(forKey: Self.legacyArchiveName), let old = try? JSONDecoder().decode([Bowler].self, from: data) { legacy = old }
        if let remembered = defaults.string(forKey: "strike-ceiling.shared-team.v2"), let uuid = UUID(uuidString: remembered) { teamID = uuid.uuidString.lowercased() }
        needsLoad = teamID != nil
        let url = backupURL(teamID)
        if FileManager.default.fileExists(atPath: url.path) {
            do {
                let value = try JSONDecoder().decode(ScorebookBackup.self, from: Data(contentsOf: url))
                guard value.id == teamID, teamID == nil ? value.revision == 0 && !value.pending : value.revision > 0 else { throw ScorebookError.invalidData }
                night = try value.night.validated(); revision = value.revision; pending = value.pending
            } catch {
                damagedBackup = true
                self.error = "The saved backup could not be read. It has been kept on this device. Restore it before continuing."
                status = "Backup needs attention"
                return
            }
        }
        if pending {
            status = "Unsaved edit recovered"
            error = "Your previous edit is backed up. Retry to check whether it reached the team, or review the latest team scores."
        } else if teamID != nil { await refresh(force: true) }
    }

    func refresh(force: Bool = false) async {
        guard let id = teamID, !busy, !pending, !damagedBackup else { return }
        busy = true
        let ticket = generation
        defer { busy = false }
        do {
            let result = try await client.request("GET", id: id)
            guard ticket == generation, teamID == id, !pending else { return }
            guard result.revision >= revision else { throw ScorebookError.invalidData }
            if force || result.revision > revision || needsLoad {
                try persist(result.state, id: id, revision: result.revision, pending: false)
                night = result.state; revision = result.revision
            }
            needsLoad = false; error = nil; status = "Saved to team"
        } catch {
            needsLoad = true
            self.error = error.localizedDescription
            status = "Team unavailable. Scores are backed up."
        }
    }

    func openTeam(_ link: String) async {
        guard canSwitchTeam else { return }
        busy = true; generation += 1
        defer { busy = false }
        do {
            let id = try ScorebookClient.teamID(from: link)
            // Recover this team's pending backup before any network read can replace it.
            let url = backupURL(id)
            if FileManager.default.fileExists(atPath: url.path) {
                let saved = try JSONDecoder().decode(ScorebookBackup.self, from: Data(contentsOf: url))
                _ = try saved.night.validated()
                guard saved.id == id, saved.revision > 0 else { throw ScorebookError.invalidData }
                if saved.pending {
                    teamID = id; night = saved.night; revision = saved.revision; pending = true; needsLoad = true
                    defaults.set(id, forKey: "strike-ceiling.shared-team.v2")
                    status = "Unsaved edit recovered"; error = "This team's backed-up edit needs review or retry."
                    return
                }
            }
            let result = try await client.request("GET", id: id)
            try persist(result.state, id: id, revision: result.revision, pending: false)
            teamID = id; night = result.state; revision = result.revision; pending = false; needsLoad = false
            defaults.set(id, forKey: "strike-ceiling.shared-team.v2")
            error = nil; status = "Saved to team"
        } catch { self.error = error.localizedDescription }
    }

    func createTeam() async {
        guard canEdit, teamID == nil else { return }
        busy = true; generation += 1
        defer { busy = false }
        do {
            let result = try await client.request("POST", state: night)
            let id = result.id!.lowercased()
            // Remember the created link even if the disk backup fails afterwards.
            teamID = id; revision = result.revision; night = result.state
            defaults.set(id, forKey: "strike-ceiling.shared-team.v2")
            try persist(night, id: id, revision: revision, pending: false)
            error = nil; status = "Saved to team"
        } catch { self.error = error.localizedDescription; status = "Could not finish sharing" }
    }

    func change(_ update: (inout Night) -> Void) async {
        guard canEdit else { return }
        var next = night; update(&next)
        do {
            _ = try next.validated()
            guard next != night else { return }
            try persist(next, id: teamID, revision: revision, pending: teamID != nil)
            night = next; generation += 1; error = nil
            if teamID != nil { pending = true; await savePending() }
            else { status = "Saved on this device" }
        } catch { self.error = error.localizedDescription }
    }

    private func savePending() async {
        guard pending, let id = teamID, !busy else { return }
        busy = true; status = "Saving to team…"
        defer { busy = false }
        do {
            let result = try await client.request("PUT", id: id, state: night, revision: revision)
            guard result.state == night, result.revision == revision + 1 else { throw ScorebookError.invalidData }
            try persist(result.state, id: id, revision: result.revision, pending: false)
            revision = result.revision; pending = false; needsLoad = false; error = nil; status = "Saved to team"
        } catch { self.error = error.localizedDescription; status = "Not saved to team. Edit backed up." }
    }

    func retry() async {
        guard !busy, !damagedBackup else { return }
        guard pending, let id = teamID else { await refresh(force: true); return }
        busy = true
        do {
            let result = try await client.request("GET", id: id)
            if result.state == night, result.revision >= revision {
                // The server may have saved a PUT whose response was lost.
                try persist(result.state, id: id, revision: result.revision, pending: false)
                revision = result.revision; pending = false; needsLoad = false; error = nil; status = "Saved to team"
            } else if result.revision != revision {
                throw ScorebookError.conflict
            }
            busy = false
            if pending { await savePending() }
        } catch { busy = false; self.error = error.localizedDescription; status = "Edit still backed up" }
    }

    // Explicitly invoked only after the user confirms discarding their pending edit.
    func discardAndReload() async {
        guard let id = teamID, !busy, !damagedBackup else { return }
        busy = true; generation += 1
        defer { busy = false }
        do {
            let result = try await client.request("GET", id: id)
            if pending {
                let data = try JSONEncoder().encode(ScorebookBackup(night: night, id: id, revision: revision, pending: true))
                try data.write(to: directory.appendingPathComponent("discarded-\(UUID().uuidString).json"), options: .atomic)
            }
            try persist(result.state, id: id, revision: result.revision, pending: false)
            night = result.state; revision = result.revision; pending = false; needsLoad = false
            status = "Saved to team"; error = nil
        } catch { self.error = error.localizedDescription }
    }

    func migrateLegacy() async {
        guard canMigrate else { return }
        var next = Night()
        for (index, name) in Night.names.enumerated() {
            let matches = legacy.filter { $0.name.trimmingCharacters(in: .whitespacesAndNewlines).caseInsensitiveCompare(name) == .orderedSame }
            guard matches.count <= 1 else { error = "More than one archived bowler is named \(name). The archive is unchanged."; return }
            if let bowler = matches.first { next.rolls[index] = bowler.game.rolls }
        }
        await change { $0 = next }
    }
}
