import Foundation

var checks = 0
func expect(_ condition: @autoclosure () -> Bool, _ message: String) {
    checks += 1
    precondition(condition(), message)
}
func game(_ rolls: [Int]) -> BowlingGame {
    var result = BowlingGame()
    for roll in rolls { expect(result.add(roll), "Invalid test roll \(roll)") }
    return result
}
expect(game([]).maximumScore == 300, "Fresh game")
expect(game([9]).maximumScore == 290, "First nine leaves spare ceiling")
expect(game([9, 0]).maximumScore == 279, "Open frame")
expect(game([10, 7]).maximumScore == 280, "Pending strike then seven")
expect(game(Array(repeating: 10, count: 12)).settledScore == 300, "Perfect game")
expect(game(Array(repeating: 0, count: 20)).settledScore == 0, "Gutters")
expect(game(Array(repeating: [9, 0], count: 10).flatMap { $0 }).settledScore == 90, "Nines")
expect(game(Array(repeating: 5, count: 21)).settledScore == 150, "All spares")
expect(game([10, 7, 3, 9, 0, 10, 0, 8, 8, 2, 0, 6, 10, 10, 10, 8, 1]).settledScore == 167, "Mixed game")
let nineGutters = Array(repeating: 0, count: 18)
var tenth = game(nineGutters + [10, 7])
expect(tenth.pinsAvailable == 3, "Tenth strike then seven leaves three")
expect(!tenth.add(4), "Reject impossible bonus")
expect(tenth.add(3) && tenth.isComplete && tenth.settledScore == 20, "Tenth bonus spare")
expect(!tenth.add(0), "Reject completed game roll")
tenth.undo()
expect(!tenth.isComplete && tenth.pinsAvailable == 3, "Undo bonus")
expect(game(nineGutters + [7, 3]).pinsAvailable == 10, "Tenth spare resets pins")
expect(game(nineGutters + [10, 10]).pinsAvailable == 10, "Tenth double resets pins")
expect(game([]).symbols(for: [7, 3, 7]) == "7  /  7", "Spare bonus uses fresh rack")
expect(game([]).symbols(for: [10, 7, 3]) == "X  7  /", "Strike bonus spare notation")
var randomSeed: UInt64 = 0xBAF12026
func nextRandom(_ upperBound: Int) -> Int {
    randomSeed = randomSeed &* 6364136223846793005 &+ 1442695040888963407
    return Int((randomSeed >> 32) % UInt64(upperBound))
}
for _ in 0..<1000 {
    var current = BowlingGame()
    var ceiling = 300
    while !current.isComplete {
        expect(current.add(nextRandom(current.pinsAvailable + 1)), "Legal random roll")
        expect(current.maximumScore <= ceiling, "Ceiling cannot increase")
        expect(current.maximumScore >= current.settledScore, "Ceiling bounds settled score")
        ceiling = current.maximumScore
    }
    expect(current.maximumScore == current.settledScore, "Final ceiling equals score")
}
print("Passed \(checks) bowling checks")

struct BowlingFixture: Decodable {
    let rolls: [Int]
    let complete: Bool
    let available: Int
    let frame: Int
    let ball: Int
    let score: Int
    let maximum: Int
    let frames: [[Int]]
    let scores: [Int?]
    let symbols: [String]
}
if let path = ProcessInfo.processInfo.environment["BOWLING_FIXTURES"] {
    let fixtures = try JSONDecoder().decode([BowlingFixture].self, from: Data(contentsOf: URL(fileURLWithPath: path)))
    for fixture in fixtures {
        let current = game(fixture.rolls)
        let label = "Web parity \(fixture.rolls)"
        expect(current.isComplete == fixture.complete, "\(label): complete")
        expect(current.pinsAvailable == fixture.available, "\(label): available")
        expect(current.frameNumber == fixture.frame, "\(label): frame")
        if !current.isComplete { expect(current.ballNumber == fixture.ball, "\(label): next ball") }
        expect(current.settledScore == fixture.score, "\(label): settled score")
        expect(current.maximumScore == fixture.maximum, "\(label): maximum")
        for index in 0..<10 {
            let frame = index < current.frames.count ? current.frames[index] : []
            let score = index < current.cumulativeScores.count ? current.cumulativeScores[index] : nil
            expect(frame == fixture.frames[index], "\(label): frame rolls \(index)")
            expect(score == fixture.scores[index], "\(label): cumulative score \(index)")
            expect(current.symbols(for: frame) == fixture.symbols[index], "\(label): symbols \(index)")
        }
    }
    print("Passed \(fixtures.count) web scoring fixtures; \(checks) total checks")
}

func expectThrows(_ message: String, _ body: () throws -> Void) {
    do { try body(); expect(false, message) } catch { expect(true, message) }
}

final class TestServer {
    let id = "bf5be0eb-8fdb-4a20-a8dd-3b19b59ad95f"
    var state = Night()
    var revision = 1
    var offline = false
    var loseNextAcknowledgement = false
    var requests: [URLRequest] = []
    var missingTeamID: String?
    var overrideData: Data?
    var delay: (() async -> Void)?
    func send(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        requests.append(request)
        if let delay { await delay() }
        if offline { throw URLError(.notConnectedToInternet) }
        expect(request.value(forHTTPHeaderField: "Origin") == ScorebookClient.origin, "Native request has canonical Origin")
        expect(request.url?.host == "strike-ceiling-web.vercel.app", "Native transport host")
        if request.url?.lastPathComponent == missingTeamID {
            return (Data("{\"error\":\"Team scorebook not found.\"}".utf8), HTTPURLResponse(url: request.url!, statusCode: 404, httpVersion: nil, headerFields: nil)!)
        }
        var status = 200
        if request.httpMethod == "PUT" {
            let update = try JSONDecoder().decode(SharedScorebook.self, from: request.httpBody!)
            if update.revision != revision {
                status = 409
            } else {
                state = update.state; revision += 1
                if loseNextAcknowledgement { loseNextAcknowledgement = false; throw URLError(.networkConnectionLost) }
            }
        } else if request.httpMethod == "POST" {
            let object = try JSONSerialization.jsonObject(with: request.httpBody!) as! [String: Any]
            state = try JSONDecoder().decode(Night.self, from: JSONSerialization.data(withJSONObject: object["state"]!))
            status = 201
        }
        let body = try overrideData ?? JSONEncoder().encode(SharedScorebook(id: request.httpMethod == "POST" ? id : nil, state: state, revision: revision))
        return (body, HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!)
    }
}

actor TestGate {
    private var continuation: CheckedContinuation<Void, Never>?
    private(set) var entered = false
    func wait() async {
        entered = true
        await withCheckedContinuation { continuation = $0 }
    }
    func release() { continuation?.resume(); continuation = nil }
}

@MainActor
func runScorebookTests() async throws {
    let server = TestServer()
    let client = ScorebookClient(send: server.send)
    let root = FileManager.default.temporaryDirectory.appendingPathComponent("bafl-tests-" + UUID().uuidString)
    let suite = "bafl-tests-" + UUID().uuidString
    let defaults = UserDefaults(suiteName: suite)!
    defer { defaults.removePersistentDomain(forName: suite); try? FileManager.default.removeItem(at: root) }
    let link = ScorebookClient.origin + "/?night=" + server.id
    let parsedID = try ScorebookClient.teamID(from: link)
    expect(parsedID == server.id, "Canonical team link")
    for invalid in ["http://strike-ceiling-web.vercel.app/?night=\(server.id)", "https://evil.test/?night=\(server.id)", "https://strike-ceiling-web.vercel.app/league?night=\(server.id)", link + "&night=" + server.id, ScorebookClient.origin + "/?night=no", "https://user@strike-ceiling-web.vercel.app/?night=\(server.id)"] {
        expectThrows("Reject unsafe or ambiguous team link") { _ = try ScorebookClient.teamID(from: invalid) }
    }
    let minimal = Data("{\"game\":1,\"rolls\":[[],[],[],[]],\"history\":[]}".utf8)
    let decodedMinimal = try JSONDecoder().decode(Night.self, from: minimal).validated()
    expect(decodedMinimal == Night(), "Optional web metadata may be absent")
    var invalid = Night(); invalid.rolls = [[], [], []]
    expectThrows("Require four bowler slots") { _ = try invalid.validated() }
    invalid = Night(); invalid.rolls[0] = [9, 2]
    expectThrows("Reject impossible roll sequences") { _ = try invalid.validated() }
    invalid = Night(); invalid.finals = [301, nil, nil, nil]
    expectThrows("Reject impossible final totals") { _ = try invalid.validated() }
    invalid = Night(); invalid.drinkTargets = DrinkTargets(high: 200, low: 100, qualificationRule: "unknown")
    expectThrows("Reject unsupported qualification rule") { _ = try invalid.validated() }

    let leagueMatch = LeagueMatch(
        season: "2026-27", week: 2,
        opponent: MatchOpponent(number: 7, name: "Test Opponent", bowlers: [MatchBowler(name: "Alex", handicap: 32), MatchBowler(name: "Sam", handicap: 0)]),
        ours: Night.names.enumerated().map { MatchBowler(name: $0.element, handicap: $0.offset * 10) },
        opponentGames: [[145, nil], [nil, 201], []]
    )
    invalid = Night(); invalid.match = leagueMatch; invalid.match?.ours[0].handicap = 121
    expectThrows("Reject out-of-range match handicap") { _ = try invalid.validated() }
    invalid = Night(); invalid.match = leagueMatch; invalid.match?.opponentGames[0][0] = 301
    expectThrows("Reject out-of-range opponent scratch score") { _ = try invalid.validated() }

    let store = ScorebookStore(client: client, defaults: defaults, directory: root)
    await store.start()
    expect(store.canEdit && store.teamID == nil, "Fresh local store editable")
    await store.change {
        $0.rolls[0] = [10]
        $0.finals = [nil, 145, nil, 177]
        $0.drinkTargets = DrinkTargets(high: 200, low: 120, qualificationRule: "threshold")
        $0.history = [RecordedGame(game: 1, rolls: [[], [], [], []], finals: [200, 150, 160, 170])]
        $0.game = 2
        $0.match = leagueMatch
    }
    await store.change { $0.drinkTargets?.qualificationRule = nil }
    let local = store.night
    let localRelaunch = ScorebookStore(client: client, defaults: defaults, directory: root)
    await localRelaunch.start()
    expect(localRelaunch.night == local, "Local state persists all metadata")
    await store.createTeam()
    expect(store.teamID == server.id && store.revision == 1 && store.canEdit, "POST creates and remembers shared team")
    expect(server.state == local, "Create preserves finals, targets, history")
    expect(server.state.match == leagueMatch && localRelaunch.night.match == leagueMatch, "Match lineups, handicaps, and nullable opponent games survive POST and relaunch")
    await store.change { $0.rolls[0].append(7) }
    expect(store.revision == 2 && !store.pending && server.state == store.night, "PUT advances revision")
    expect(store.night.finals == local.finals && store.night.history == local.history && store.night.drinkTargets == local.drinkTargets, "Roll edits preserve web metadata")

    expect(server.state.match == leagueMatch && store.night.match == leagueMatch, "PUT preserves all match metadata")

    server.offline = true
    await store.change { $0.rolls[0].append(3) }
    let pending = store.night
    expect(store.pending && !store.canEdit && store.revision == 2, "Offline write locks editing and keeps revision")
    await store.change { $0.game = 99 }
    expect(store.night == pending, "Pending edits cannot be overwritten locally")
    let requestCount = server.requests.count
    let recovered = ScorebookStore(client: client, defaults: defaults, directory: root)
    await recovered.start()
    expect(recovered.pending && recovered.night == pending && !recovered.canEdit, "Relaunch recovers pending edit")
    expect(server.requests.count == requestCount, "Relaunch never overwrites pending backup with GET")
    server.offline = false
    await recovered.retry()
    expect(!recovered.pending && recovered.canEdit && recovered.revision == 3 && server.state == pending, "Offline retry writes at original revision")

    server.loseNextAcknowledgement = true
    await recovered.change { $0.rolls[1] = [8] }
    expect(recovered.pending && server.revision == 4 && recovered.revision == 3, "Lost acknowledgement preserves pending revision")
    let putCount = server.requests.filter { $0.httpMethod == "PUT" }.count
    await recovered.retry()
    expect(!recovered.pending && recovered.revision == 4, "Retry recognizes already-saved edit")
    expect(server.requests.filter { $0.httpMethod == "PUT" }.count == putCount, "Lost acknowledgement retry does not write twice")

    server.state.rolls[2] = [10]; server.revision += 1
    await recovered.change { $0.rolls[3] = [9] }
    let conflicted = recovered.night
    expect(recovered.pending && recovered.revision == 4 && !recovered.canEdit, "409 retains local pending state")
    let putsBeforeConflictRetry = server.requests.filter { $0.httpMethod == "PUT" }.count
    await recovered.retry()
    expect(recovered.pending && recovered.night == conflicted, "Conflict retry preserves pending edit")
    expect(server.requests.filter { $0.httpMethod == "PUT" }.count == putsBeforeConflictRetry, "Conflict retry never overwrites newer remote revision")
    await recovered.discardAndReload()
    expect(!recovered.pending && recovered.canEdit && recovered.night == server.state, "Explicit discard loads remote state")
    let files = try FileManager.default.contentsOfDirectory(atPath: root.path)
    expect(files.contains { $0.hasPrefix("discarded-") }, "Discard retains recovery archive")

    let beforeMalformed = recovered.night
    server.overrideData = Data("{\"state\":{\"game\":1,\"rolls\":[[]],\"history\":[]},\"revision\":6}".utf8)
    await recovered.refresh()
    expect(recovered.night == beforeMalformed && !recovered.canEdit && recovered.error != nil, "Malformed remote response cannot replace valid scores")
    server.overrideData = Data("{\"state\":{\"game\":1,\"rolls\":[[],[],[],[]],\"history\":[],\"newFeature\":true},\"revision\":6}".utf8)
    await recovered.retry()
    expect(recovered.night == beforeMalformed && !recovered.canEdit, "Unknown web field blocks lossy native update")
    server.overrideData = nil
    await recovered.retry()
    expect(recovered.canEdit, "Valid response restores editing after malformed response")

    let separate = ScorebookStore(client: client, defaults: UserDefaults(suiteName: suite + ".new")!, directory: root.appendingPathComponent("other"))
    defer { UserDefaults().removePersistentDomain(forName: suite + ".new") }
    await separate.start(); await separate.openTeam(link)
    expect(separate.teamID == server.id && separate.night == server.state, "Paste link joins existing team")
    server.state.rolls[2] = [10, 10]; server.revision += 1
    await separate.refresh()
    expect(separate.night == server.state && separate.revision == server.revision, "Refresh imports newer web scores")

    let beforeInvalidLink = separate.night
    let beforeInvalidLinkRevision = separate.revision
    await separate.openTeam("https://invalid.example/?night=" + server.id)
    expect(separate.canEdit && separate.teamID == server.id && separate.night == beforeInvalidLink && separate.revision == beforeInvalidLinkRevision, "Invalid pasted link preserves existing editable team")
    expect(separate.error != nil, "Invalid pasted link reports its error")

    let missingDefaults = UserDefaults(suiteName: suite + ".missing")!
    defer { missingDefaults.removePersistentDomain(forName: suite + ".missing") }
    let missingID = "aa223b14-dd82-4771-97e4-67a1f3e1cbcd"
    missingDefaults.set(missingID, forKey: "strike-ceiling.shared-team.v2")
    server.missingTeamID = missingID
    let missingStore = ScorebookStore(client: client, defaults: missingDefaults, directory: root.appendingPathComponent("missing"))
    await missingStore.start()
    expect(missingStore.teamID == missingID && !missingStore.canEdit && missingStore.canSwitchTeam && missingStore.error != nil, "Remembered team 404 locks edits while allowing another team")
    await missingStore.openTeam(link)
    expect(missingStore.teamID == server.id && missingStore.canEdit && missingStore.night == server.state, "Missing remembered team can be replaced with a valid team link")
    expect(missingDefaults.string(forKey: "strike-ceiling.shared-team.v2") == server.id, "Replacement team persists for next launch")
    server.missingTeamID = nil

    let gate = TestGate()
    server.delay = { await gate.wait() }
    server.state.rolls[3] = [8]; server.revision += 1
    let delayedRefresh = Task { await separate.refresh() }
    while !(await gate.entered) { await Task.yield() }
    let duringRefresh = separate.night
    expect(separate.busy && !separate.canEdit, "In-flight refresh serializes state changes")
    await separate.change { $0.game = 90 }
    await separate.openTeam(link)
    expect(separate.night == duringRefresh, "Delayed response cannot race an edit or scorebook switch")
    await gate.release()
    await delayedRefresh.value
    server.delay = nil
    expect(separate.night == server.state && separate.canEdit, "Delayed refresh applies exactly once")
    let acceptedRevision = server.revision
    server.revision -= 1
    await separate.refresh()
    expect(separate.revision == acceptedRevision && !separate.canEdit, "Older remote revision cannot roll back accepted state")
    server.revision = acceptedRevision
    await separate.retry()
    expect(separate.canEdit, "Recovery after obsolete response")

    let legacyDefaults = UserDefaults(suiteName: suite + ".legacy")!
    defer { legacyDefaults.removePersistentDomain(forName: suite + ".legacy") }
    let legacyData = try JSONEncoder().encode([Bowler(name: "Mustafa", game: game([7, 2])), Bowler(name: " Doug ", game: game([10])), Bowler(name: "Guest", game: game([3]))])
    legacyDefaults.set(legacyData, forKey: ScorebookStore.legacyArchiveName)
    let legacyStore = ScorebookStore(client: client, defaults: legacyDefaults, directory: root.appendingPathComponent("legacy"))
    await legacyStore.start()
    expect(legacyStore.canMigrate && legacyStore.night == Night(), "Legacy migration requires explicit action")
    await legacyStore.migrateLegacy()
    expect(legacyStore.night.rolls == [[10], [7, 2], [], []], "Legacy migration maps by fixed web bowler name")
    expect(legacyDefaults.data(forKey: ScorebookStore.legacyArchiveName) == legacyData && legacyStore.legacy.count == 3, "Legacy archive including extra bowlers remains untouched")

    let previousGame = localRelaunch.night
    await localRelaunch.change { night in
        night.history.append(night.current)
        night.game += 1
        night.rolls = Array(repeating: [], count: 4)
        night.finals = nil
    }
    expect(localRelaunch.night.game == previousGame.game + 1 && localRelaunch.night.rolls == [[], [], [], []] && localRelaunch.night.finals == nil, "Next game resets all current scorecards and final overrides")
    expect(localRelaunch.night.history == previousGame.history + [previousGame.current] && localRelaunch.night.drinkTargets == previousGame.drinkTargets, "Next game archives full scorecards and retains drink targets")
    expect(localRelaunch.night.match == leagueMatch, "Next game retains match and indexed opponent games")
    let archived = localRelaunch.night.history.last!
    expect(archived.score(1) == 145 && archived.complete(1) && archived.score(3) == 177 && archived.complete(3), "Archived final-only totals remain complete")
    expect(!archived.complete(0) && !archived.complete(2), "Archived unfinished scorecards retain incomplete markers")
    let validTransition = localRelaunch.night
    let diskBeforeInvalid = try Data(contentsOf: root.appendingPathComponent("local.json"))
    await localRelaunch.change { $0.rolls[0] = [9, 2] }
    expect(localRelaunch.night == validTransition && localRelaunch.error != nil, "Invalid change cannot mutate displayed state")
    let diskAfterInvalid = try Data(contentsOf: root.appendingPathComponent("local.json"))
    expect(diskAfterInvalid == diskBeforeInvalid, "Invalid change cannot mutate persisted state")

    let corruptedRoot = root.appendingPathComponent("corrupt")
    try FileManager.default.createDirectory(at: corruptedRoot, withIntermediateDirectories: true)
    try Data("not-json".utf8).write(to: corruptedRoot.appendingPathComponent("local.json"))
    let corruptStore = ScorebookStore(client: client, defaults: legacyDefaults, directory: corruptedRoot)
    await corruptStore.start()
    expect(!corruptStore.canEdit && corruptStore.error != nil, "Unreadable backup blocks destructive replacement")
    for request in server.requests where request.httpBody != nil {
        let body = try JSONSerialization.jsonObject(with: request.httpBody!) as! [String: Any]
        let state = body["state"] as! [String: Any]
        if let targets = state["drinkTargets"] as? [String: Any] {
            expect(targets.keys.contains("qualificationRule"), "Nullable qualification rule remains present in wire JSON")
            expect(targets["qualificationRule"] is NSNull, "Nil qualification rule encodes explicit JSON null")
        }
    }
    if let path = ProcessInfo.processInfo.environment["SCOREBOOK_PAYLOADS"] {
        let bodies = try server.requests.compactMap { request -> Any? in
            guard let body = request.httpBody else { return nil }
            return try JSONSerialization.jsonObject(with: body)
        }
        try JSONSerialization.data(withJSONObject: bodies).write(to: URL(fileURLWithPath: path))
    }
    print("Passed deterministic scorebook client/store tests; \(checks) total checks")
}
try await runScorebookTests()
