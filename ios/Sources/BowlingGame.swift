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

enum MatchLane: String, Codable {
    case odd, even
}

struct Prebowl: Codable, Equatable {
    var week: Int
    var bowlers: [Int]

    func validate() throws {
        guard (1...60).contains(week), (1...4).contains(bowlers.count),
              bowlers.allSatisfy({ (0...3).contains($0) }) else { throw ScorebookError.invalidData }
    }
}

struct LeagueMatch: Codable, Equatable {
    var season: String
    var week: Int
    var opponent: MatchOpponent
    var ours: [MatchBowler]
    var opponentGames: [[Int?]]
    var lane: MatchLane?

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
    var prebowl: Prebowl?
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
        try prebowl?.validate()
        try match?.validate()
        return self
    }
}

enum ScorebookError: LocalizedError {
    case invalidData, invalidLink, conflict, server(String), storage
    var errorDescription: String? {
        switch self {
        case .invalidData: return "This scorebook contains unsupported or invalid scores. Nothing was changed."
        case .invalidLink: return "Paste a BA4L scorebook, week, or review link with a valid night ID."
        case .conflict: return "Another phone updated this game. Your edit is backed up. Reload the team scores to continue, or keep this edit for recovery."
        case .server(let message): return message
        case .storage: return "Could not save the backup on this device. Free some storage and retry."
        }
    }
}

enum ScorebookRole: String, Codable {
    case owner, editor, viewer, legacy
    var allowsWrite: Bool { self == .owner || self == .editor || self == .legacy }
}

struct SharedScorebook: Codable {
    var id: String?
    var state: Night
    var revision: Int
    var role: ScorebookRole?
}

struct ScorebookClient {
    static let origin = "https://bigals4life.com"
    var send: (URLRequest) async throws -> (Data, HTTPURLResponse) = { request in
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw ScorebookError.invalidData }
        return (data, http)
    }

    static func teamID(from text: String) throws -> String {
        guard let url = URLComponents(string: text.trimmingCharacters(in: .whitespacesAndNewlines)),
              url.scheme == "https", ["bigals4life.com", "strike-ceiling-web.vercel.app"].contains(url.host ?? ""),
              url.port == nil, url.user == nil, url.password == nil, url.fragment == nil,
              url.percentEncodedPath == url.path else { throw ScorebookError.invalidLink }
        let query = url.queryItems ?? []
        guard Set(query.map(\.name)).count == query.count else { throw ScorebookError.invalidLink }
        let value: String?
        if ["", "/", "/night"].contains(url.path) {
            guard query.count == 1, query[0].name == "night" else { throw ScorebookError.invalidLink }
            value = query[0].value
        } else {
            let parts = url.path.split(separator: "/", omittingEmptySubsequences: false)
            guard parts.count == 3, parts[0].isEmpty, ["season", "review"].contains(parts[1]),
                  query.isEmpty || (parts[1] == "review" && query.count == 1 && query[0].name == "bowler" && ["0", "1", "2", "3"].contains(query[0].value ?? "")) else { throw ScorebookError.invalidLink }
            value = String(parts[2])
        }
        guard let value, let id = UUID(uuidString: value) else { throw ScorebookError.invalidLink }
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
              let raw = root["state"] as? [String: Any], Set(raw.keys).isSubset(of: ["game", "rolls", "finals", "history", "drinkTargets", "match", "prebowl"]),
              let history = raw["history"] as? [[String: Any]],
              history.allSatisfy({ Set($0.keys).isSubset(of: ["game", "rolls", "finals"]) }) else { throw ScorebookError.invalidData }
        if let targets = raw["drinkTargets"] as? [String: Any], !Set(targets.keys).isSubset(of: ["high", "low", "qualificationRule"]) { throw ScorebookError.invalidData }
        if let value = raw["prebowl"] {
            guard let prebowl = value as? [String: Any], Set(prebowl.keys).isSubset(of: ["week", "bowlers"]) else { throw ScorebookError.invalidData }
        }
        if let match = raw["match"] as? [String: Any] {
            if let lane = match["lane"], !(lane is String) { throw ScorebookError.invalidData }
            guard Set(match.keys).isSubset(of: ["season", "week", "opponent", "ours", "opponentGames", "lane"]),
                  let opponent = match["opponent"] as? [String: Any], Set(opponent.keys).isSubset(of: ["number", "name", "bowlers"]),
                  let ours = match["ours"] as? [[String: Any]], let theirs = opponent["bowlers"] as? [[String: Any]],
                  (ours + theirs).allSatisfy({ Set($0.keys).isSubset(of: ["name", "handicap"]) }) else { throw ScorebookError.invalidData }
        }
        let result = try JSONDecoder().decode(SharedScorebook.self, from: data)
        _ = try result.state.validated()
        guard result.revision > 0, method == "PUT" || result.role != nil else { throw ScorebookError.invalidData }
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
    var cachedRole: ScorebookRole? = nil
    var offlineQueue: Bool? = nil
    var attemptedNight: Night? = nil
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
    @Published private(set) var role: ScorebookRole?
    @Published private(set) var offlineQueue = false
    var transport: (URLRequest) async throws -> (Data, HTTPURLResponse) { client.send }
    private let client: ScorebookClient
    private let defaults: UserDefaults
    private let directory: URL
    private let ephemeral: Bool
    private var generation = 0
    private var needsLoad = false
    private var damagedBackup = false
    private var attemptedNight: Night?
    private var checkingQueue = false
    var canEdit: Bool { (teamID == nil || role?.allowsWrite == true) && loaded && !busy && (!pending || offlineQueue) && !needsLoad && !damagedBackup }
    var canSwitchTeam: Bool { loaded && !busy && !checkingQueue && !pending && !damagedBackup }
    var shareURL: URL? { teamID.flatMap { URL(string: ScorebookClient.origin + "/?night=" + $0) } }
    var canMigrate: Bool { canEdit && teamID == nil && night == Night() && !legacy.isEmpty }

    init(client: ScorebookClient = ScorebookClient(), defaults: UserDefaults = .standard, directory: URL? = nil, ephemeral: Bool = false) {
        self.client = client; self.defaults = defaults; self.ephemeral = ephemeral
        // AppRoot supplies an account-scoped directory and defaults suite for signed-in users.
        self.directory = directory ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("Scorebooks", isDirectory: true)
    }
    private func backupURL(_ id: String?) -> URL { directory.appendingPathComponent((id ?? "local") + ".json") }
    private func persist(_ value: Night, id: String?, revision: Int, pending: Bool, cachedRole: ScorebookRole?, offlineQueue: Bool = false, attemptedNight: Night? = nil) throws {
        guard !ephemeral else { return }
        do {
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            let backup = ScorebookBackup(night: try value.validated(), id: id, revision: revision, pending: pending, cachedRole: cachedRole, offlineQueue: offlineQueue, attemptedNight: attemptedNight)
            let data = try JSONEncoder().encode(backup)
            try data.write(to: backupURL(id), options: .atomic)
        } catch { throw ScorebookError.storage }
    }
    private func validateBackup(_ value: ScorebookBackup, id: String?) throws {
        guard value.id == id, id == nil ? value.revision == 0 && !value.pending : value.revision > 0 else { throw ScorebookError.invalidData }
        _ = try value.night.validated()
        if let attempted = value.attemptedNight { guard value.pending else { throw ScorebookError.invalidData }; _ = try attempted.validated() }
        if value.offlineQueue == true { guard id != nil, value.cachedRole?.allowsWrite == true else { throw ScorebookError.invalidData } }
    }
    private func restore(_ backup: ScorebookBackup) {
        night = backup.night; revision = backup.revision; pending = backup.pending
        role = backup.cachedRole; offlineQueue = backup.offlineQueue == true && role?.allowsWrite == true
        attemptedNight = backup.attemptedNight
        needsLoad = teamID != nil && !offlineQueue
    }
    private func connectivityFailure(_ failure: Error) -> Bool {
        guard let failure = failure as? URLError else { return false }
        return [.notConnectedToInternet, .networkConnectionLost, .timedOut, .cannotFindHost, .cannotConnectToHost, .dnsLookupFailed, .dataNotAllowed, .internationalRoamingOff].contains(failure.code)
    }
    /// Only a positively identified connection failure enables offline edits. Auth/server/storage errors freeze.
    private func handleFailure(_ failure: Error) {
        let connectionOnly = connectivityFailure(failure)
        if !connectionOnly, role?.allowsWrite == true { role = nil }
        let canQueue = connectionOnly && role?.allowsWrite == true && teamID != nil && !damagedBackup
        offlineQueue = false; needsLoad = teamID != nil
        do {
            if let id = teamID {
                try persist(night, id: id, revision: revision, pending: pending, cachedRole: role, offlineQueue: canQueue, attemptedNight: attemptedNight)
            }
            offlineQueue = canQueue
            if canQueue {
                needsLoad = false
                error = "You’re offline. Keep scoring; each change is saved on this device. The team updates when the connection returns."
                status = pending ? "Offline. Scores queued on this device." : "Offline. Saved scores available."
            } else {
                error = failure.localizedDescription
                status = pending ? "Sync needs attention. Scores backed up." : "Team unavailable. Scores are backed up."
            }
        } catch {
            offlineQueue = false; needsLoad = teamID != nil
            self.error = ScorebookError.storage.localizedDescription
            status = "Backup needs attention"
        }
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
                try validateBackup(value, id: teamID); restore(value)
            } catch {
                damagedBackup = true
                self.error = "The saved backup could not be read. It has been kept on this device. Restore it before continuing."
                status = "Backup needs attention"; return
            }
        }
        if pending {
            status = offlineQueue ? "Offline scores recovered. Keep scoring or retry sync." : "Unsaved edit recovered"
            error = offlineQueue ? nil : "Your previous edit is backed up. Retry to check whether it reached the team, or review the latest team scores."
        } else if teamID != nil { await refresh(force: true) }
    }

    func refresh(force: Bool = false) async {
        guard let id = teamID, !busy, !checkingQueue, !damagedBackup else { return }
        if pending {
            if offlineQueue { await retry(background: true) }
            return
        }
        busy = true
        let ticket = generation
        defer { busy = false }
        do {
            let result = try await client.request("GET", id: id)
            guard ticket == generation, teamID == id, !pending else { return }
            guard result.revision >= revision else { throw ScorebookError.invalidData }
            // Always persist permissions, even when no new revision was created.
            try persist(result.state, id: id, revision: result.revision, pending: false, cachedRole: result.role)
            role = result.role; night = result.state; revision = result.revision
            offlineQueue = false; attemptedNight = nil
            needsLoad = false; error = nil; status = "Saved to team"
        } catch { if ticket == generation, teamID == id { handleFailure(error) } }
    }

    func openTeam(_ link: String) async {
        guard canSwitchTeam else { return }
        busy = true; generation += 1
        defer { busy = false }
        do {
            let id = try ScorebookClient.teamID(from: link)
            let url = backupURL(id)
            if FileManager.default.fileExists(atPath: url.path) {
                let saved = try JSONDecoder().decode(ScorebookBackup.self, from: Data(contentsOf: url))
                try validateBackup(saved, id: id)
                if saved.pending {
                    teamID = id; restore(saved)
                    if !ephemeral { defaults.set(id, forKey: "strike-ceiling.shared-team.v2") }
                    status = offlineQueue ? "Offline scores recovered. Keep scoring or retry sync." : "Unsaved edit recovered"
                    error = offlineQueue ? nil : "This team’s backed-up edit needs review or retry."
                    return
                }
            }
            let result = try await client.request("GET", id: id)
            try persist(result.state, id: id, revision: result.revision, pending: false, cachedRole: result.role)
            role = result.role; teamID = id; night = result.state; revision = result.revision
            pending = false; needsLoad = false; offlineQueue = false; attemptedNight = nil
            if !ephemeral { defaults.set(id, forKey: "strike-ceiling.shared-team.v2") }
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
            role = result.role
            teamID = id; revision = result.revision; night = result.state
            if !ephemeral { defaults.set(id, forKey: "strike-ceiling.shared-team.v2") }
            try persist(night, id: id, revision: revision, pending: false, cachedRole: role)
            error = nil; status = "Saved to team"
        } catch {
            if teamID != nil { handleFailure(error) }
            else { self.error = error.localizedDescription; status = "Could not finish sharing" }
        }
    }

    func change(_ update: (inout Night) -> Void) async {
        guard canEdit else { return }
        var next = night; update(&next)
        do {
            _ = try next.validated()
            guard next != night else { return }
            try persist(next, id: teamID, revision: revision, pending: teamID != nil, cachedRole: role, offlineQueue: offlineQueue, attemptedNight: attemptedNight)
            night = next; generation += 1; error = nil
            if teamID != nil {
                pending = true
                if offlineQueue { status = "Offline. Scores queued on this device." }
                else { await savePending() }
            } else { status = "Saved on this device" }
        } catch {
            self.error = error.localizedDescription
            if case ScorebookError.storage = error { offlineQueue = false; role = nil; needsLoad = teamID != nil; status = "Backup needs attention" }
        }
    }

    private func savePending() async {
        guard pending, let id = teamID, !busy else { return }
        guard role?.allowsWrite == true else {
            handleFailure(ScorebookError.server("You can view this scorebook but cannot save edits. Your scores remain backed up. Ask the owner for edit access.")); return
        }
        busy = true; status = "Saving to team…"
        let sending = night; let baseRevision = revision
        defer { busy = false }
        do {
            // Record exactly what may reach the server before sending it. New offline edits retain this snapshot.
            try persist(sending, id: id, revision: baseRevision, pending: true, cachedRole: role, offlineQueue: offlineQueue, attemptedNight: sending)
            attemptedNight = sending
            let result = try await client.request("PUT", id: id, state: sending, revision: baseRevision)
            guard result.state == sending, result.revision == baseRevision + 1 else { throw ScorebookError.invalidData }
            let newRole = result.role ?? role
            try persist(result.state, id: id, revision: result.revision, pending: false, cachedRole: newRole)
            role = newRole; revision = result.revision; pending = false; offlineQueue = false; attemptedNight = nil
            needsLoad = false; error = nil; status = "Saved to team"
        } catch { handleFailure(error) }
    }

    /// Background GET checks do not block offline scoring. A local edit invalidates the response.
    func retry(background: Bool = false) async {
        guard !busy, !checkingQueue, !damagedBackup else { return }
        guard pending, let id = teamID else { await refresh(force: true); return }
        checkingQueue = true
        let ticket = generation
        let backgroundCheck = background && offlineQueue
        if !backgroundCheck { busy = true }
        defer { checkingQueue = false; busy = false }
        do {
            let result = try await client.request("GET", id: id)
            guard generation == ticket, teamID == id, pending else { return }
            busy = true
            role = result.role
            if result.state == night, result.revision >= revision {
                try persist(result.state, id: id, revision: result.revision, pending: false, cachedRole: result.role)
                revision = result.revision; pending = false; needsLoad = false; offlineQueue = false; attemptedNight = nil
                error = nil; status = "Saved to team"; return
            }
            guard role?.allowsWrite == true else {
                throw ScorebookError.server("You can view this scorebook but cannot save edits. Your scores remain backed up. Ask the owner for edit access.")
            }
            if result.revision == revision + 1, let attempted = attemptedNight, result.state == attempted {
                // Only our recorded in-flight snapshot can safely advance the base under a newer queue.
                try persist(night, id: id, revision: result.revision, pending: true, cachedRole: result.role, offlineQueue: offlineQueue)
                revision = result.revision; attemptedNight = nil
            } else if result.revision != revision { throw ScorebookError.conflict }
            needsLoad = false
            busy = false
            await savePending()
        } catch {
            guard generation == ticket, teamID == id else { return }
            handleFailure(error)
        }
    }

    // Explicitly invoked only after the user confirms discarding their pending edit.
    func discardAndReload() async {
        guard let id = teamID, !busy, !checkingQueue, !damagedBackup else { return }
        busy = true; generation += 1
        defer { busy = false }
        do {
            let result = try await client.request("GET", id: id)
            if pending {
                let backup = ScorebookBackup(night: night, id: id, revision: revision, pending: true, cachedRole: role, offlineQueue: offlineQueue, attemptedNight: attemptedNight)
                let data = try JSONEncoder().encode(backup)
                try data.write(to: directory.appendingPathComponent("discarded-\(UUID().uuidString).json"), options: .atomic)
            }
            try persist(result.state, id: id, revision: result.revision, pending: false, cachedRole: result.role)
            role = result.role; night = result.state; revision = result.revision; pending = false
            needsLoad = false; offlineQueue = false; attemptedNight = nil
            status = "Saved to team"; error = nil
        } catch { handleFailure(error) }
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
