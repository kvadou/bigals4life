import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// Synthetic, in-memory transports only. This runner never authenticates or calls a server.
// The actual production model declarations are compiled, without iOS-only SwiftUI views.
const root = resolve(import.meta.dir, "../..");
const scratch = mkdtempSync(join(tmpdir(), "ba4l-model-tests-"));
function extract(file: string, marker: string, extra = "") {
  const source = readFileSync(join(root, "ios/Sources", file), "utf8");
  if (!source.includes(marker)) throw Error(`Model/view boundary not found in ${file}`);
  const output = join(scratch, file);
  writeFileSync(output, source.split(marker)[0] + extra);
  return output;
}
function run(command: string, args: string[]) {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit", timeout: 60_000 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw Error(`${command} failed (${result.status})`);
}

const seasonFixture = String.raw`import Foundation

@main struct SeasonCheck {
    @MainActor static func main() async throws {
        let fixture = """
        {"season":"2026-27","weeks":[{"id":"week-one","bowledOn":"2026-09-10","week":1,"opponent":"Team B","opponentGames":[[200,null]],"ourHandicaps":[20,30,40,50],"prebowl":null,"games":[{"game":1,"scores":[191,null,0,200],"complete":[true,false,true,true],"team":null,"hasRolls":true}],"series":[191,null,0,200],"gamesBowled":[1,0,1,1],"teamSeries":null,"finishedGames":0,"recordedGames":1,"points":{"ours":1.5,"theirs":2.5,"remaining":32,"team":[0,0],"individual":[1.5,2.5],"games":[{"game":1,"split":[0,0],"ours":null,"theirs":null}],"series":{"split":[0,0],"ours":null,"theirs":null},"bowlers":[{"name":"Doug","opponent":"Other","games":[[0.5,0.5]],"series":[0,0],"total":[0.5,0.5]}]}}]}
        """
        let decoded = try JSONDecoder().decode(SeasonResponse.self, from: Data(fixture.utf8))
        precondition(decoded.weeks[0].series[1] == nil)
        precondition(decoded.weeks[0].series[2] == 0)
        precondition(decoded.weeks[0].points?.ours == 1.5)
        let model = SeasonModel { request in
            let json = request.url!.path == "/api/me" ? "{\"admin\":true,\"scorebooks\":[{\"id\":\"week-one\",\"role\":\"viewer\",\"updatedAt\":null}],\"legacy\":[]}" : fixture
            return (Data(json.utf8), HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
        }
        await model.refresh()
        precondition(model.season?.weeks.count == 1 && model.account?.scorebooks.first?.role == "viewer")
        precondition(model.error == nil && !model.loading)
        let unauthorized = SeasonModel { request in
            (Data("{\"error\":\"Sign in\"}".utf8), HTTPURLResponse(url: request.url!, statusCode: 401, httpVersion: nil, headerFields: nil)!)
        }
        await unauthorized.refresh()
        precondition(unauthorized.error == "Sign in" && unauthorized.accountError == "Sign in")
        print("Season fixtures passed: null/zero, half points, viewer discovery, authenticated loading, 401 errors")
    }
}
`;

const broFixture = String.raw`import Foundation
@main struct BroCheck {
    @MainActor static func main() async throws {
        let fixture = """
        {"night":{"week":1,"bowledOn":"2026-09-10","prebowl":null,"opponent":"Team B","games":[{"game":1,"complete":true,"stats":{"score":191,"strikes":4,"spares":5,"opens":1,"framesPlayed":10,"cleanFrames":9,"firstBallAvg":8.5,"tenth":"/"}}]},"bowler":0,"names":["Doug","Mustafa","Kyle","Pete"],"review":{"context":{"lanes":"7 & 8","onPair":8,"lefties":false,"highRev":true,"oil":"House"},"games":[{"ball":"Bionic","tags":["light"],"note":"Keep this"}],"debrief":[{"role":"coach","text":"Keep this turn","question":"Where?","ideas":[{"key":"move","text":"An idea","source":"USBC","url":"https://bowl.com","agree":2}],"at":"2026-09-10T20:00:00Z"}],"closed":false},"profile":{"arsenal":["Bionic"],"hand":"left","language":"technical"}}
        """
        let accountID = "11111111-1111-4111-8111-111111111111"
        let nightID = "f1c74a06-b404-4e39-b3e7-6e0b84dc24b5"
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent("ba4l-review-draft-fixtures-" + UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        var writes: [String: Any] = [:]
        var posts = 0
        var offline = false
        var race = false
        var remote = try JSONDecoder().decode(BroPayload.self, from: Data(fixture.utf8))
        let transport: SeasonTransport = { request in
            if offline { throw URLError(.notConnectedToInternet) }
            if request.httpMethod == "PUT" {
                posts += 1
                writes = try JSONSerialization.jsonObject(with: request.httpBody!) as! [String: Any]
                if race {
                    remote.review.games[0].note = "Concurrent server winner"
                    return (Data("{\"error\":\"A newer review was saved\"}".utf8), HTTPURLResponse(url: request.url!, statusCode: 409, httpVersion: nil, headerFields: nil)!)
                }
                remote.review = try JSONDecoder().decode(BroReview.self, from: JSONSerialization.data(withJSONObject: writes["review"]!))
                remote.profile = try JSONDecoder().decode(BroProfile.self, from: JSONSerialization.data(withJSONObject: writes["profile"]!))
                return (Data("{\"ok\":true}".utf8), HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
            }
            return (try JSONEncoder().encode(remote), HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
        }
        let model = BroReviewModel(nightID: nightID, accountID: accountID, draftRoot: directory, send: transport)
        await model.load()
        precondition(model.payload?.review.context.lefties == false && model.awaitingAnswer)
        model.changeGame(0) { $0.note = "Updated note" }
        let firstSave = await model.save(); precondition(firstSave)
        let savedReview = writes["review"] as! [String: Any]
        let savedContext = savedReview["context"] as! [String: Any]
        precondition(savedContext["lefties"] as? Bool == false && savedContext["highRev"] as? Bool == true)
        precondition((savedReview["debrief"] as! [[String: Any]]).count == 1)
        precondition((writes["profile"] as! [String: Any])["hand"] as? String == "left")
        let expectedReview = writes["expectedReview"] as! [String: Any]
        precondition((expectedReview["games"] as! [[String: Any]])[0]["note"] as? String == "Keep this")
        precondition(writes["expectedProfile"] != nil)

        offline = true
        model.changeGame(0) { $0.note = "Must survive failure" }
        model.changeAnswer("A saved answer from the lanes")
        let saved = await model.save()
        precondition(!saved && model.dirty && model.payload?.review.games[0].note == "Must survive failure")
        await model.load(bowler: 1)
        precondition(model.payload?.bowler == 0 && model.dirty)
        let relaunched = BroReviewModel(nightID: nightID, accountID: accountID, draftRoot: directory, send: transport)
        await relaunched.load()
        precondition(relaunched.payload?.review.games[0].note == "Must survive failure")
        precondition(relaunched.answer == "A saved answer from the lanes" && relaunched.dirty)
        let otherAccount = BroReviewModel(nightID: nightID, accountID: "22222222-2222-4222-8222-222222222222", draftRoot: directory, send: transport)
        await otherAccount.load()
        precondition(otherAccount.payload == nil, "Another account must never read a draft")
        offline = false
        remote.review.games[0].note = "Changed on web"
        let conflicting = BroReviewModel(nightID: nightID, accountID: accountID, draftRoot: directory, send: transport)
        let beforeConflict = posts
        await conflicting.load()
        precondition(conflicting.conflict && conflicting.payload?.review.games[0].note == "Must survive failure")
        let refused = await conflicting.save()
        precondition(!refused && posts == beforeConflict)
        conflicting.resolveConflict(useDraft: true)
        let explicitlyKept = await conflicting.save()
        precondition(explicitlyKept && remote.review.games[0].note == "Must survive failure")
        precondition(((writes["expectedReview"] as! [String: Any])["games"] as! [[String: Any]])[0]["note"] as? String == "Changed on web")

        // Two native windows cannot silently overwrite each other's local drafts.
        let secondWindow = BroReviewModel(nightID: nightID, accountID: accountID, draftRoot: directory, send: transport)
        await secondWindow.load()
        conflicting.changeGame(0) { $0.note = "Old window edit" }
        precondition(conflicting.localWriteFailed)
        let beforeOldWindow = posts
        let staleWrite = await conflicting.save()
        precondition(!staleWrite && posts == beforeOldWindow)
        conflicting.reloadSavedDraft()
        precondition(conflicting.payload?.review.games[0].note == "Must survive failure")

        // An answer-only local write failure must not be replaced by a routine reload.
        let answerRoot = directory.appendingPathComponent("answer-only-window")
        let answerWindow = BroReviewModel(nightID: nightID, accountID: accountID, draftRoot: answerRoot, send: transport)
        await answerWindow.load()
        let otherAnswerWindow = BroReviewModel(nightID: nightID, accountID: accountID, draftRoot: answerRoot, send: transport)
        await otherAnswerWindow.load()
        answerWindow.changeAnswer("Only this window has my answer")
        precondition(answerWindow.localWriteFailed && !answerWindow.dirty)
        let answerReloaded = await answerWindow.load()
        precondition(!answerReloaded && answerWindow.answer == "Only this window has my answer" && answerWindow.localWriteFailed)
        let postsBeforeAnswerRetry = posts
        let answerRetried = await answerWindow.save()
        precondition(!answerRetried && posts == postsBeforeAnswerRetry && answerWindow.answer == "Only this window has my answer")
        // Only the explicitly destructive recovery action may discard the window's answer.
        answerWindow.reloadSavedDraft()
        precondition(!answerWindow.localWriteFailed && answerWindow.answer.isEmpty)

        // The server may race between the preflight and PUT. A 409 opens resolution without rebasing.
        conflicting.changeGame(0) { $0.note = "Local race draft" }
        race = true
        let raceSaved = await conflicting.save()
        precondition(!raceSaved && conflicting.conflict && conflicting.dirty)
        precondition(conflicting.payload?.review.games[0].note == "Local race draft")
        conflicting.resolveConflict(useDraft: false)
        precondition(conflicting.payload?.review.games[0].note == "Concurrent server winner" && !conflicting.dirty && conflicting.answer.isEmpty)
        race = false

        // A disk failure cannot be disguised as an offline success or followed by a network write.
        let blocked = directory.appendingPathComponent("not-a-directory")
        try Data("fixture".utf8).write(to: blocked)
        let diskFailure = BroReviewModel(nightID: nightID, accountID: accountID, draftRoot: blocked, send: transport)
        await diskFailure.load()
        precondition(diskFailure.localWriteFailed)
        diskFailure.changeGame(0) { $0.note = "Keep on screen" }
        let beforeDiskFailure = posts
        let diskSaved = await diskFailure.save()
        precondition(!diskSaved && posts == beforeDiskFailure && diskFailure.payload?.review.games[0].note == "Keep on screen")
        print("Bro fixtures passed: complete contract + CAS expectations, offline relaunch/answer recovery, account separation, changed-server conflict, explicit resolution, multiwindow stale write + answer-only reload protection, 409 race, disk failure blocks writes")
    }
}
`;

const teamFixture = String.raw`import Foundation
@main struct TeamCheck {
    @MainActor static func main() async throws {
        let id = "f1c74a06-b404-4e39-b3e7-6e0b84dc24b5"
        var admin = false
        var access = "owner"
        var posts = 0
        let model = TeamAccessModel { r in
            var text: String
            if r.url!.path == "/api/me" { text = "{\"user\":{\"id\":\"me\",\"email\":\"test@example.com\"},\"admin\":\(admin),\"profile\":{\"displayName\":\"Test\",\"bowlerName\":null}}" }
            else if r.httpMethod == "POST" {
                posts += 1
                if r.url!.path.hasSuffix("claim") { access = "owner"; text = "{\"id\":\"\(id)\",\"role\":\"owner\"}" }
                else { text = "{\"id\":\"\(id)\",\"email\":\"new@example.com\",\"role\":\"viewer\",\"status\":\"invited\"}" }
            } else { text = "{\"role\":\"\(access)\",\"members\":[],\"invites\":[]}" }
            return (Data(text.utf8), HTTPURLResponse(url: r.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
        }
        await model.load(bookID: id)
        precondition(posts == 0 && model.canInvite)
        let ownerBlocked = await model.invite(email: "new@example.com", role: "owner")
        precondition(!ownerBlocked && posts == 0)
        let valid = await model.invite(email: "new@example.com", role: "viewer")
        precondition(valid && posts == 1)
        access = "viewer"; await model.load(bookID: id)
        let viewerBlocked = await model.invite(email: "new@example.com", role: "viewer")
        precondition(!viewerBlocked && posts == 1)
        access = "legacy"; await model.load(bookID: id)
        let claimBlocked = await model.claim()
        precondition(!claimBlocked && posts == 1)
        admin = true; await model.load(bookID: id)
        let claimed = await model.claim()
        precondition(claimed && posts == 2 && model.members?.role == "owner")

        // A completed request from the old book must not update the new book's UI.
        let nextID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
        var resumeInvite: CheckedContinuation<Void, Never>?
        let staleModel = TeamAccessModel { r in
            let text: String
            if r.url!.path == "/api/me" {
                text = "{\"user\":{\"id\":\"me\",\"email\":\"test@example.com\"},\"admin\":true,\"profile\":{\"displayName\":\"Test\",\"bowlerName\":null}}"
            } else if r.httpMethod == "POST" {
                await withCheckedContinuation { resumeInvite = $0 }
                text = "{\"id\":\"\(id)\",\"email\":\"new@example.com\",\"role\":\"viewer\",\"status\":\"invited\"}"
            } else {
                let role = r.url!.path.contains(nextID) ? "viewer" : "owner"
                text = "{\"role\":\"\(role)\",\"members\":[],\"invites\":[]}"
            }
            return (Data(text.utf8), HTTPURLResponse(url: r.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
        }
        await staleModel.load(bookID: id)
        let oldInvite = Task { await staleModel.invite(email: "new@example.com", role: "viewer") }
        for _ in 0..<1000 { if resumeInvite != nil { break }; await Task.yield() }
        precondition(resumeInvite != nil, "Fixture did not reach pending invitation")
        await staleModel.load(bookID: nextID)
        resumeInvite?.resume()
        let appliedOldInvite = await oldInvite.value
        precondition(!appliedOldInvite && staleModel.bookID == nextID && staleModel.members?.role == "viewer")
        precondition(staleModel.notice == nil && staleModel.error == nil && !staleModel.busy)
        print("Team fixtures passed: load never mutates, non-admin owner blocked, explicit viewer invite, viewer invite blocked, non-admin claim blocked, admin claim updates access, old-book response discarded")
    }
}
`;

const framesFixture = String.raw`import Foundation
@main struct FramesCheck {
    @MainActor static func main() async throws {
        var requests = 0
        var invalid = false
        let fixture = """
        {"state":{"game":2,"rolls":[[10],[],[],[]],"history":[{"game":1,"rolls":[[9,1,10],[],[],[]],"finals":[191,null,0,200]}]},"revision":1,"role":"viewer"}
        """
        let model = WeekGameModel(nightID: "f1c74a06-b404-4e39-b3e7-6e0b84dc24b5") { request in
            requests += 1
            precondition(request.httpMethod == "GET" && request.httpBody == nil, "History must never mutate a scorebook")
            let json = invalid ? fixture.replacingOccurrences(of: "\"game\":2", with: "\"futureField\":true,\"game\":2") : fixture
            return (Data(json.utf8), HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
        }
        await model.refresh()
        precondition(requests == 1 && model.games.map(\.game) == [1, 2])
        precondition(model.games[0].finals?[0] == 191 && model.games[0].finals?[1] == nil && model.games[0].finals?[2] == 0)
        precondition(model.games[0].bowling(0).cumulativeScores[0] == 20)
        precondition(model.games[1].bowling(0).cumulativeScores[0] == nil)
        invalid = true
        await model.refresh()
        precondition(requests == 2 && model.error != nil && model.games.map(\.game) == [1, 2])
        print("Frames fixtures passed: GET-only history, current/history selection, final overrides/null/zero, bonus pending, unknown-field rejection")
    }
}`;

try {
  const season = extract("SeasonView.swift", "/// Collapses into", "\nprivate extension Array { func at(_ index: Int) -> Element? { indices.contains(index) ? self[index] : nil } }\n");
  const review = extract("ReviewView.swift", "/// Parent supplies");
  const team = extract("TeamAccessView.swift", "/// These controls");
  const frames = extract("WeekGameView.swift", "/// A read-only");
  for (const [name, fixture, models] of [
    ["season", seasonFixture, [season]],
    ["review", broFixture, [season, review, join(root, "ios/Sources/ReviewDraftStorage.swift")]],
    ["team", teamFixture, [season, team]],
    ["frames", framesFixture, [season, frames]],
  ] as const) {
    const source = join(scratch, `${name}-fixtures.swift`);
    const binary = join(scratch, name);
    writeFileSync(source, fixture);
    run("swiftc", ["ios/Sources/BowlingGame.swift", ...models, source, "-o", binary]);
    run(binary, []);
  }
  console.log("Native models: all synthetic fixture checks passed; no network requests.");
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
