import Foundation

@main
struct AccountSessionTests {
    @MainActor
    static func main() async throws {
        var checks = 0
        func check(_ condition: Bool, _ message: String) {
            checks += 1
            precondition(condition, message)
        }
        let config = AccountSession.Configuration(url: "https://test-project.supabase.co", anonKey: "sb_publishable_test_configuration")!
        check(AccountSession.Configuration(url: "http://test-project.supabase.co", anonKey: config.anonKey) == nil, "Reject insecure auth host")
        check(AccountSession.Configuration(url: "https://test-project.supabase.co.evil.test", anonKey: config.anonKey) == nil, "Reject impostor auth host")
        check(AccountSession.Configuration(url: "https://test-project.supabase.co", anonKey: "sb_secret_never_distribute") == nil, "Never accept a service key")
        let serviceClaim = Data("{\"role\":\"service_role\"}".utf8).base64EncodedString()
        check(AccountSession.Configuration(url: "https://test-project.supabase.co", anonKey: "header." + serviceClaim + ".signature") == nil, "Reject legacy service role")
        let server = AuthServer()
        let disk = MemoryTokens()
        var time = Date(timeIntervalSince1970: 1_800_000_000)
        let session = AccountSession(configuration: config, transport: server.send, storage: disk.storage, now: { time })
        check(session.configured && !session.signedIn, "Fresh session")
        check(await session.requestCode(email: " Doug@Example.com "), "OTP request succeeds")
        check(session.codeSent && !session.signedIn, "Sending code does not authenticate")
        let otp = try server.body(server.requests.last!)
        check(otp["email"] as? String == "doug@example.com" && otp["create_user"] as? Bool == true, "OTP matches web flow")
        let requestCount = server.requests.count
        check(!(await session.verifyCode(email: "doug@example.com", code: "12345x")), "Invalid OTP rejected locally")
        check(server.requests.count == requestCount, "Invalid OTP not sent")
        check(await session.verifyCode(email: "doug@example.com", code: "123456"), "Verify signs in")
        check(session.signedIn && session.userID == server.userID && session.email == "doug@example.com", "Verified user published")
        check(disk.data != nil, "Tokens persisted securely through injected storage")
        check(!(await session.signIn(email: "other@example.com", password: "pass12345")), "Switching requires signout")
        var api = URLRequest(url: URL(string: "https://bigals4life.com/api/season")!)
        api.setValue("stale-cookie", forHTTPHeaderField: "Cookie")
        api.setValue("Bearer injected", forHTTPHeaderField: "Authorization")
        _ = try await session.send(api)
        let sent = server.requests.last!
        check(sent.value(forHTTPHeaderField: "Authorization") == "Bearer access-1", "Attach session bearer")
        check(sent.value(forHTTPHeaderField: "Cookie") == nil && !sent.httpShouldHandleCookies, "Never mix web cookies")
        check(sent.value(forHTTPHeaderField: "Origin") == "https://bigals4life.com", "Canonical API Origin")
        for url in ["http://bigals4life.com/api/season", "https://evil.test/api/season", "https://bigals4life.com.evil.test/api/season", "https://user@bigals4life.com/api/season", "https://bigals4life.com:443/api/season", "https://bigals4life.com/api/../login", "https://bigals4life.com/api/%2Fsecret", "https://bigals4life.com/api//season", "https://bigals4life.com/season", "https://bigals4life.com/api/season#fragment"] {
            let before = server.requests.count
            do { _ = try await session.send(URLRequest(url: URL(string: url)!)); check(false, "Unsafe destination must fail") } catch { check(true, "Unsafe destination rejected") }
            check(before == server.requests.count, "Unsafe destination never receives tokens")
        }
        check(await session.updatePassword("eightchars"), "Password update succeeds")
        check(session.hasPassword, "Password metadata published")
        let update = try server.body(server.requests.last!)
        check((update["data"] as? [String: Bool])?["has_password"] == true, "Password flow matches web metadata")
        let restored = AccountSession(configuration: config, transport: server.send, storage: disk.storage, now: { time })
        check(restored.userID == session.userID && restored.hasPassword, "Saved identity restores")
        time = time.addingTimeInterval(3601)
        let parallelRequest = api
        async let a = restored.send(parallelRequest)
        async let b = restored.send(parallelRequest)
        _ = try await (a, b)
        check(server.refreshes == 1, "Concurrent requests share one refresh")
        check(server.requests.last!.value(forHTTPHeaderField: "Authorization") == "Bearer access-2", "Rotated token attached")
        server.api401 = 1
        _ = try await restored.send(api)
        check(server.refreshes == 2, "GET 401 retries once after refresh")
        var put = api; put.httpMethod = "PUT"
        server.api401 = 1
        let denied = try await restored.send(put)
        check(denied.1.statusCode == 401 && server.refreshes == 2, "Never replay a rejected mutation automatically")
        time = time.addingTimeInterval(3601)
        server.offlineRefresh = true
        do { _ = try await restored.send(api); check(false, "Offline refresh fails") } catch { check(restored.signedIn, "Network failure preserves account") }
        server.offlineRefresh = false
        server.refreshStatus = 401
        do { _ = try await restored.send(api); check(false, "Revoked refresh fails") } catch { check(!restored.signedIn && disk.data == nil, "Revoked refresh clears identity and persistence") }
        server.refreshStatus = 200
        check(await restored.signIn(email: "doug@example.com", password: "test-password"), "Password login succeeds")
        let gate = AuthGate()
        server.gate = gate
        server.gatedPath = "/api/season"
        let pending = Task { try await restored.send(api) }
        await gate.waitUntilEntered()
        await restored.signOut()
        check(!restored.signedIn && disk.data == nil, "Signout clears account immediately")
        server.gate = nil
        check(await restored.signIn(email: "doug@example.com", password: "test-password"), "New sign-in after signout")
        await gate.release()
        do { _ = try await pending.value; check(false, "Old account response cannot return") } catch { check(true, "In-flight old account data rejected") }
        await restored.signOut()
        let logout = server.requests.last!
        check(logout.url?.query == "scope=local", "Signout preserves web session")
        let signedOutRequests = server.requests.count
        do { _ = try await restored.send(api); check(false, "Signed-out API request must fail") } catch { check(server.requests.count == signedOutRequests, "Signed-out API requests never reach anonymous endpoints") }
        let refreshGate = AuthGate()
        check(await restored.signIn(email: "doug@example.com", password: "test-password"), "Login for refresh-race test")
        time = time.addingTimeInterval(3601)
        server.gate = refreshGate; server.gatedPath = "/auth/v1/token"
        let refreshing = Task { try await restored.send(api) }
        await refreshGate.waitUntilEntered()
        await restored.signOut()
        server.gate = nil
        await refreshGate.release()
        do { _ = try await refreshing.value; check(false, "Refresh cannot restore signed-out account") } catch { check(!restored.signedIn && disk.data == nil, "Logout wins over in-flight refresh") }
        let otpGate = AuthGate()
        server.gate = otpGate; server.gatedPath = "/auth/v1/otp"
        let sendingCode = Task { await restored.requestCode(email: "doug@example.com") }
        await otpGate.waitUntilEntered()
        await restored.signOut()
        server.gate = nil
        await otpGate.release()
        let sentCode = await sendingCode.value
        check(!sentCode && !restored.codeSent, "Stale OTP response cannot advance login flow")
        server.confirmed = false
        check(!(await restored.signIn(email: "doug@example.com", password: "test-password")) && !restored.signedIn, "Unconfirmed email cannot authenticate")
        server.confirmed = true
        check(await restored.signIn(email: "doug@example.com", password: "test-password"), "Login for failed logout test")
        disk.failRemoves = true
        await restored.signOut()
        check(restored.signedIn && restored.error?.contains("Could not sign out") == true, "Failed secure deletion does not pretend signout succeeded")
        disk.failRemoves = false
        await restored.signOut()
        check(!restored.signedIn && disk.data == nil, "Retry securely clears credentials")
        disk.failWrites = true
        check(!(await restored.signIn(email: "doug@example.com", password: "test-password")) && !restored.signedIn, "Storage failure never publishes unpersisted session")
        disk.failWrites = false
        let unavailable = AccountSession(configuration: nil, transport: server.send, storage: disk.storage)
        check(!(await unavailable.requestCode(email: "doug@example.com")) && unavailable.error?.contains("not configured") == true, "Missing config has actionable error")
        print("Passed \(checks) native account security and lifecycle checks")
    }
}

@MainActor
private final class MemoryTokens {
    var data: Data?
    var failWrites = false
    var failRemoves = false
    var storage: AccountSession.TokenStorage {
        AccountSession.TokenStorage(read: { self.data }, write: { value in
            if self.failWrites { throw URLError(.cannotWriteToFile) }
            self.data = value
        }, remove: {
            if self.failRemoves { throw URLError(.cannotRemoveFile) }
            self.data = nil
        })
    }
}

private actor AuthGate {
    var entered = false
    var blocked: CheckedContinuation<Void, Never>?
    var observer: CheckedContinuation<Void, Never>?
    func wait() async {
        entered = true
        observer?.resume(); observer = nil
        await withCheckedContinuation { blocked = $0 }
    }
    func waitUntilEntered() async {
        if !entered { await withCheckedContinuation { observer = $0 } }
    }
    func release() { blocked?.resume(); blocked = nil }
}

@MainActor
private final class AuthServer {
    let userID = "bf5be0eb-8fdb-4a20-a8dd-3b19b59ad95f"
    var requests: [URLRequest] = []
    var confirmed = true
    var refreshes = 0
    var tokenNumber = 1
    var api401 = 0
    var refreshStatus = 200
    var offlineRefresh = false
    var gate: AuthGate?
    var gatedPath = ""
    func body(_ request: URLRequest) throws -> [String: Any] {
        try JSONSerialization.jsonObject(with: request.httpBody!) as! [String: Any]
    }
    func send(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        requests.append(request)
        if let gate, request.url?.path == gatedPath { await gate.wait() }
        let url = request.url!
        var object: [String: Any] = [:]
        var status = 200
        if url.path.hasPrefix("/api/") {
            if api401 > 0 { status = 401; api401 -= 1 }
        } else if url.path.hasSuffix("token") || url.path.hasSuffix("verify") {
            if url.query == "grant_type=refresh_token" {
                refreshes += 1
                await Task.yield()
                if offlineRefresh { throw URLError(.notConnectedToInternet) }
                status = refreshStatus
                tokenNumber += 1
            }
            object = ["access_token": "access-\(tokenNumber)", "refresh_token": "refresh-\(tokenNumber)", "expires_in": 3600,
                      "token_type": "bearer", "user": user()]
        } else if url.path.hasSuffix("user") { object = user(hasPassword: true) }
        return (try JSONSerialization.data(withJSONObject: object), HTTPURLResponse(url: url, statusCode: status, httpVersion: nil, headerFields: nil)!)
    }
    func user(hasPassword: Bool = false) -> [String: Any] {
        ["id": userID, "email": "doug@example.com", "email_confirmed_at": confirmed ? "2026-09-12T12:00:00Z" : "", "user_metadata": ["has_password": hasPassword]]
    }
}
