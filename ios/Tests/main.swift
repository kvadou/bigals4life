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
    var role: ScorebookRole = .editor
    var offline = false
    var forcedFailure: Error?
    var forcedStatus: Int?
    var loseNextAcknowledgement = false
    var requests: [URLRequest] = []
    var missingTeamID: String?
    var overrideData: Data?
    var delay: (() async -> Void)?
    func send(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        requests.append(request)
        if let delay { await delay() }
        if offline { throw URLError(.notConnectedToInternet) }
        if let forcedFailure { throw forcedFailure }
        if let forcedStatus { return (Data("{\"error\":\"Test server refusal\"}".utf8), HTTPURLResponse(url: request.url!, statusCode: forcedStatus, httpVersion: nil, headerFields: nil)!) }
        expect(request.value(forHTTPHeaderField: "Origin") == ScorebookClient.origin, "Native request has canonical Origin")
        expect(request.url?.host == "bigals4life.com", "Native transport host")
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
        let body = try overrideData ?? JSONEncoder().encode(SharedScorebook(id: request.httpMethod == "POST" ? id : nil, state: state, revision: revision, role: request.httpMethod == "PUT" ? nil : role))
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
    for host in ["bigals4life.com", "strike-ceiling-web.vercel.app"] {
        for path in ["/?night=", "/night?night=", "/season/", "/review/"] {
            let parsed = try ScorebookClient.teamID(from: "https://" + host + path + server.id)
            expect(parsed == server.id, "Current and legacy night/week/review links")
        }
    }
    let reviewID = try ScorebookClient.teamID(from: ScorebookClient.origin + "/review/" + server.id + "?bowler=2")
    expect(reviewID == server.id, "Bowler review link resolves its night")
    for invalid in [
        "http://bigals4life.com/?night=\(server.id)", "https://evil.test/?night=\(server.id)",
        "https://bigals4life.com.evil.test/?night=\(server.id)", "https://bigals4life.com:443/?night=\(server.id)",
        "https://user@bigals4life.com/?night=\(server.id)", "https://bigals4life.com/league?night=\(server.id)",
        link + "&night=" + server.id, link + "&redirect=evil", link + "#night=other", ScorebookClient.origin + "/?night=no",
        ScorebookClient.origin + "/season//" + server.id, ScorebookClient.origin + "/season/" + server.id + "/",
        ScorebookClient.origin + "/season/" + server.id + "?night=" + server.id,
        ScorebookClient.origin + "/review/" + server.id + "?bowler=4", ScorebookClient.origin + "/review/" + server.id + "?bowler=1&bowler=2",
        ScorebookClient.origin + "/season%2F" + server.id, ScorebookClient.origin + "/night/../?night=" + server.id,
        ScorebookClient.origin + "/review/" + server.id + "/game/1"
    ] {
        expectThrows("Reject unsafe or ambiguous team link: \(invalid)") { _ = try ScorebookClient.teamID(from: invalid) }
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
        opponentGames: [[145, nil], [nil, 201], []], lane: .even
    )
    invalid = Night(); invalid.match = leagueMatch; invalid.match?.ours[0].handicap = 121
    expectThrows("Reject out-of-range match handicap") { _ = try invalid.validated() }
    invalid = Night(); invalid.match = leagueMatch; invalid.match?.opponentGames[0][0] = 301
    expectThrows("Reject out-of-range opponent scratch score") { _ = try invalid.validated() }

    let prebowl = Prebowl(week: 2, bowlers: [0, 2])
    for bad in [Prebowl(week: 0, bowlers: [0]), Prebowl(week: 61, bowlers: [0]), Prebowl(week: 1, bowlers: []), Prebowl(week: 1, bowlers: [4]), Prebowl(week: 1, bowlers: [-1]), Prebowl(week: 1, bowlers: [0, 1, 2, 3, 0])] {
        invalid = Night(); invalid.prebowl = bad
        expectThrows("Reject invalid prebowl week or slots") { _ = try invalid.validated() }
    }
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
        $0.prebowl = prebowl
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

    expect(server.state.match == leagueMatch && store.night.match == leagueMatch, "PUT preserves all match metadata, including lane")
    expect(server.state.prebowl == prebowl && localRelaunch.night.prebowl == prebowl, "Prebowl metadata survives local backup, POST, and PUT")
    for lane in [MatchLane.odd, .even] {
        var webNight = local
        webNight.match?.lane = lane
        server.overrideData = try JSONEncoder().encode(SharedScorebook(id: nil, state: webNight, revision: 2, role: .editor))
        let response = try await client.request("GET", id: server.id)
        expect(response.state == webNight, "GET preserves current web metadata")
    }
    server.overrideData = nil

    server.offline = true
    await store.change { $0.rolls[0].append(3) }
    expect(store.pending && store.canEdit && store.offlineQueue && store.revision == 2, "Recognized connectivity failure enables backed-up offline scoring")
    let offlineRequests = server.requests.count
    await store.change { $0.rolls[0].append(10) }
    await store.change { $0.rolls[1] = [7, 2] }
    let pending = store.night
    expect(pending.rolls[0] == [10, 7, 3, 10] && pending.rolls[1] == [7, 2], "Multiple offline rolls accumulate")
    expect(server.requests.count == offlineRequests, "Each offline edit persists without repeating PUT")
    let requestCount = server.requests.count
    let recovered = ScorebookStore(client: client, defaults: defaults, directory: root)
    await recovered.start()
    expect(recovered.pending && recovered.night == pending && recovered.canEdit && recovered.offlineQueue, "Relaunch restores the full offline queue with cached writable access")
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
    for (section, field, value) in [("prebowl", "futureField", true as Any), ("match", "futureField", true as Any), ("match", "lane", "middle" as Any), ("match", "lane", NSNull()), ("prebowl", "week", 1.5 as Any)] {
        var rootObject = try JSONSerialization.jsonObject(with: JSONEncoder().encode(SharedScorebook(id: nil, state: beforeMalformed, revision: 6))) as! [String: Any]
        var stateObject = rootObject["state"] as! [String: Any]
        var metadata = stateObject[section] as! [String: Any]
        metadata[field] = value
        stateObject[section] = metadata
        rootObject["state"] = stateObject
        server.overrideData = try JSONSerialization.data(withJSONObject: rootObject)
        await recovered.retry()
        expect(recovered.night == beforeMalformed && !recovered.canEdit, "Invalid or unknown nested metadata blocks lossy update")
    }
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

    // A failed switch must not grant the old scorebook the destination's permissions.
    do {
        let viewerID = "11111111-1111-4111-8111-111111111111"
        let ownerID = "22222222-2222-4222-8222-222222222222"
        let failureSuite = suite + ".failed-open"
        let failureDefaults = UserDefaults(suiteName: failureSuite)!
        defer { failureDefaults.removePersistentDomain(forName: failureSuite) }
        let failureDirectory = root.appendingPathComponent("failed-open")
        var requests = 0
        let roleClient = ScorebookClient(send: { request in
            requests += 1
            let result = SharedScorebook(id: nil, state: Night(), revision: 1,
                role: request.url!.lastPathComponent == viewerID ? .viewer : .owner)
            return (try JSONEncoder().encode(result), HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
        })
        let switching = ScorebookStore(client: roleClient, defaults: failureDefaults, directory: failureDirectory)
        await switching.start()
        await switching.openTeam(ScorebookClient.origin + "/?night=" + viewerID)
        expect(switching.role == .viewer && !switching.canEdit, "Initial viewer scorebook stays read-only")
        // A file occupying the backup directory deterministically simulates a disk write failure.
        try FileManager.default.removeItem(at: failureDirectory)
        try Data().write(to: failureDirectory)
        await switching.openTeam(ScorebookClient.origin + "/?night=" + ownerID)
        expect(switching.teamID == viewerID && switching.role == .viewer, "Failed opening another book preserves the original role and ID")
        expect(!switching.canEdit && switching.error != nil, "Failed disk persistence never grants viewer edit access")
        let before = switching.night, requestCount = requests
        await switching.change { $0.game += 1 }
        expect(switching.night == before && requests == requestCount && !switching.pending, "Viewer edit after failed switch causes no write or pending change")
    }

    // Server roles are authoritative, including a downgrade while a local write is pending.
    server.role = .viewer
    await separate.refresh()
    expect(separate.role == .viewer && !separate.canEdit, "Viewer can read but never edit")
    let beforeViewer = separate.night
    let viewerRequests = server.requests.count
    await separate.change { $0.game += 1 }
    expect(separate.night == beforeViewer && server.requests.count == viewerRequests, "Viewer change is refused before disk or network write")
    server.role = .legacy
    await separate.refresh()
    expect(separate.role == .legacy && separate.canEdit, "Explicit legacy access matches web semantics")
    server.role = .owner
    await separate.refresh()
    expect(separate.role == .owner && separate.canEdit, "Owner access enables editing")
    server.offline = true
    await separate.change { $0.drinkTargets?.high = 199 }
    server.offline = false
    let pendingViewer = separate.night
    let writesBeforeDowngrade = server.requests.filter { $0.httpMethod == "PUT" }.count
    server.role = .viewer
    await separate.retry()
    expect(separate.pending && separate.night == pendingViewer && !separate.canEdit, "Role downgrade retains pending backup")
    expect(server.requests.filter { $0.httpMethod == "PUT" }.count == writesBeforeDowngrade, "Viewer retry must not send PUT")
    // A server acknowledgement may still resolve a lost-response edit after a downgrade.
    server.state = pendingViewer; server.revision += 1
    await separate.retry()
    expect(!separate.pending && !separate.canEdit && separate.role == .viewer, "Viewer may recognize an already saved pending edit without writing")
    server.role = .editor
    await separate.refresh()
    await separate.change { $0.drinkTargets?.high = 200 }
    expect(separate.canEdit && separate.role == .editor, "PUT omission of role never removes known permissions")
    for rawRole in ["unexpected", "none", "missing"] {
        var object = try JSONSerialization.jsonObject(with: JSONEncoder().encode(SharedScorebook(id: nil, state: server.state, revision: server.revision))) as! [String: Any]
        object["role"] = rawRole
        server.overrideData = try JSONSerialization.data(withJSONObject: object)
        await separate.refresh()
        expect(!separate.canEdit && separate.error != nil, "Unknown or denied role must never become editable")
    }
    server.overrideData = try JSONEncoder().encode(SharedScorebook(id: nil, state: server.state, revision: server.revision))
    await separate.refresh()
    expect(!separate.canEdit, "GET without a role fails closed")
    server.overrideData = nil
    await separate.retry()
    expect(separate.canEdit, "Explicit editor response restores access")

    // Offline queue recovery is tested against a separate synthetic server and account directory.
    do {
        let queuedServer = TestServer()
        let queuedClient = ScorebookClient(send: queuedServer.send)
        let queueSuite = suite + ".queue"
        let queueDefaults = UserDefaults(suiteName: queueSuite)!
        defer { queueDefaults.removePersistentDomain(forName: queueSuite) }
        let queueDirectory = root.appendingPathComponent("offline-queue")
        let queued = ScorebookStore(client: queuedClient, defaults: queueDefaults, directory: queueDirectory)
        await queued.start(); await queued.openTeam(link)
        queuedServer.loseNextAcknowledgement = true
        await queued.change { $0.rolls[0] = [10] }
        expect(queued.pending && queued.canEdit && queued.revision == 1 && queuedServer.revision == 2, "Lost acknowledgement enables safe queued scoring")
        let firstAttempt = queuedServer.state
        let requestsBeforeMore = queuedServer.requests.count
        await queued.change { $0.rolls[0].append(7) }
        await queued.change { $0.rolls[0].append(2) }
        expect(queuedServer.requests.count == requestsBeforeMore, "Newer queued rolls do not blindly resend the lost-ack PUT")
        let backupPath = queueDirectory.appendingPathComponent(queuedServer.id + ".json")
        let backup = try JSONDecoder().decode(ScorebookBackup.self, from: Data(contentsOf: backupPath))
        expect(backup.attemptedNight == firstAttempt && backup.night == queued.night && backup.cachedRole == .editor && backup.offlineQueue == true, "Backup persists both attempted snapshot and latest queue")
        let queueRelaunch = ScorebookStore(client: queuedClient, defaults: queueDefaults, directory: queueDirectory)
        await queueRelaunch.start()
        expect(queueRelaunch.canEdit && queueRelaunch.pending && queuedServer.requests.count == requestsBeforeMore, "Pending queue relaunch needs no network")
        await queueRelaunch.retry()
        expect(!queueRelaunch.pending && queueRelaunch.revision == 3 && queuedServer.state.rolls[0] == [10, 7, 2], "Exact lost-ack snapshot rebases and sends all newer rolls")
        expect(queuedServer.requests.filter { $0.httpMethod == "PUT" }.count == 2, "Lost-ack with newer edits needs only one additional CAS PUT")

        // During a background GET, further offline edits remain available and invalidate that response.
        queuedServer.offline = true
        await queueRelaunch.change { $0.rolls[1] = [8] }
        queuedServer.offline = false
        let queueGate = TestGate()
        queuedServer.delay = { await queueGate.wait() }
        let background = Task { await queueRelaunch.refresh() }
        while !(await queueGate.entered) { await Task.yield() }
        expect(queueRelaunch.canEdit && !queueRelaunch.busy, "Background queue check does not block pin entry")
        let requestsDuringCheck = queuedServer.requests.count
        await queueRelaunch.refresh()
        expect(queuedServer.requests.count == requestsDuringCheck, "Overlapping queue checks are suppressed")
        await queueRelaunch.change { $0.rolls[1].append(1) }
        await queueGate.release(); await background.value; queuedServer.delay = nil
        expect(queueRelaunch.pending && queueRelaunch.night.rolls[1] == [8, 1], "New edits invalidate older background GET without losing pins")
        expect(queuedServer.requests.count == requestsDuringCheck, "Stale GET does not trigger a PUT")
        await queueRelaunch.refresh()
        expect(!queueRelaunch.pending && queuedServer.state.rolls[1] == [8, 1], "Next background check flushes the latest queue")

        // A different remote state at base+1 is a conflict, even after an ambiguous acknowledgement.
        queuedServer.loseNextAcknowledgement = true
        await queueRelaunch.change { $0.rolls[2] = [7] }
        await queueRelaunch.change { $0.rolls[2].append(2) }
        queuedServer.state.rolls[3] = [10]
        let putsBeforeDifferent = queuedServer.requests.filter { $0.httpMethod == "PUT" }.count
        await queueRelaunch.retry()
        expect(queueRelaunch.pending && !queueRelaunch.canEdit && !queueRelaunch.offlineQueue, "Changed remote beyond attempted snapshot freezes queue")
        expect(queuedServer.requests.filter { $0.httpMethod == "PUT" }.count == putsBeforeDifferent, "Conflicting remote data is never overwritten")
        queuedServer.offline = true
        await queueRelaunch.retry()
        expect(!queueRelaunch.canEdit, "Connectivity failure cannot reopen a previously conflicted queue")
        queuedServer.offline = false
        await queueRelaunch.discardAndReload()

        for code in [401, 403, 503] {
            queuedServer.forcedStatus = code
            await queueRelaunch.change { $0.drinkTargets = DrinkTargets(high: code % 300, low: 100, qualificationRule: nil) }
            expect(queueRelaunch.pending && !queueRelaunch.canEdit && !queueRelaunch.offlineQueue, "HTTP auth/server errors freeze, not offline queue")
            let frozenBackup = try JSONDecoder().decode(ScorebookBackup.self, from: Data(contentsOf: backupPath))
            expect(frozenBackup.cachedRole == nil && frozenBackup.offlineQueue == false, "No stale owner/editor permission survives a server rejection")
            queuedServer.forcedStatus = nil; queuedServer.offline = true
            await queueRelaunch.retry()
            expect(!queueRelaunch.canEdit, "Later offline error does not restore revoked cached write permission")
            queuedServer.offline = false; await queueRelaunch.retry()
            expect(!queueRelaunch.pending && queueRelaunch.canEdit, "Fresh authorized GET permits frozen queue recovery")
        }
        queuedServer.forcedFailure = URLError(.secureConnectionFailed)
        await queueRelaunch.change { $0.rolls[3] = [9] }
        expect(queueRelaunch.pending && !queueRelaunch.canEdit, "TLS failures never enable offline queue mode")
        queuedServer.forcedFailure = nil; await queueRelaunch.retry()

        // A local storage failure must not change either displayed pins or the server.
        queuedServer.offline = true
        await queueRelaunch.change { $0.rolls[3].append(1) }
        let beforeDiskLoss = queueRelaunch.night
        let requestsBeforeDiskLoss = queuedServer.requests.count
        let savedDirectory = root.appendingPathComponent("offline-queue-preserved")
        try FileManager.default.moveItem(at: queueDirectory, to: savedDirectory)
        try Data().write(to: queueDirectory)
        await queueRelaunch.change { $0.rolls[3].append(10) }
        expect(queueRelaunch.night == beforeDiskLoss && !queueRelaunch.canEdit && !queueRelaunch.offlineQueue, "Offline disk failure preserves UI and freezes scoring")
        expect(queuedServer.requests.count == requestsBeforeDiskLoss, "Failed backup never reaches network")
        try FileManager.default.removeItem(at: queueDirectory)
        try FileManager.default.moveItem(at: savedDirectory, to: queueDirectory)
        queuedServer.offline = false; await queueRelaunch.retry()
        expect(!queueRelaunch.pending && queuedServer.state == beforeDiskLoss, "Restored storage sends only safely persisted rolls")

        // Old backups have no cached role; they remain frozen until online authorization.
        let oldBackup = ScorebookBackup(night: queueRelaunch.night, id: queuedServer.id, revision: queueRelaunch.revision, pending: true)
        try JSONEncoder().encode(oldBackup).write(to: backupPath, options: .atomic)
        let oldRelaunch = ScorebookStore(client: queuedClient, defaults: queueDefaults, directory: queueDirectory)
        await oldRelaunch.start()
        expect(oldRelaunch.pending && oldRelaunch.role == nil && !oldRelaunch.canEdit, "Legacy pending backups never infer writable permissions")
    }

    // The same shared night has independent local backups for different signed-in users.
    let accountADefaults = UserDefaults(suiteName: suite + ".accountA")!
    let accountBDefaults = UserDefaults(suiteName: suite + ".accountB")!
    defer {
        accountADefaults.removePersistentDomain(forName: suite + ".accountA")
        accountBDefaults.removePersistentDomain(forName: suite + ".accountB")
    }
    let accountA = ScorebookStore(client: client, defaults: accountADefaults, directory: root.appendingPathComponent("Accounts/A"))
    await accountA.start(); await accountA.openTeam(link)
    server.offline = true
    await accountA.change { $0.drinkTargets?.high = 198 }
    server.offline = false
    expect(accountA.pending, "Account A has isolated pending backup")
    let accountB = ScorebookStore(client: client, defaults: accountBDefaults, directory: root.appendingPathComponent("Accounts/B"))
    await accountB.start()
    expect(accountB.teamID == nil && accountB.night == Night() && !accountB.pending, "Account B cannot inherit Account A selection or scores")
    await accountB.openTeam(link)
    expect(accountB.night == server.state && !accountB.pending, "Account B loads server state instead of Account A pending edits")
    let accountARestored = ScorebookStore(client: client, defaults: accountADefaults, directory: root.appendingPathComponent("Accounts/A"))
    await accountARestored.start()
    expect(accountARestored.pending && accountARestored.night == accountA.night && accountARestored.teamID == server.id, "Returning account recovers only its own pending edit")

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
