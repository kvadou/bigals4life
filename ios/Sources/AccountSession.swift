import Foundation
import Combine
import Security

/// Supabase email-code/password identity shared with the web app. Tokens never enter UserDefaults.
@MainActor
final class AccountSession: ObservableObject {
    struct Configuration {
        let url: URL
        let anonKey: String

        init?(url: String, anonKey: String) {
            guard let parts = URLComponents(string: url), parts.scheme == "https",
                  let host = parts.host, host.hasSuffix(".supabase.co"),
                  parts.user == nil, parts.password == nil, parts.port == nil,
                  parts.query == nil, parts.fragment == nil, ["", "/"].contains(parts.path),
                  let parsed = parts.url, Self.isPublicKey(anonKey) else { return nil }
            self.url = parsed
            self.anonKey = anonKey
        }

        static var bundled: Configuration? {
            guard let url = Bundle.main.object(forInfoDictionaryKey: "BA4LSupabaseURL") as? String,
                  let key = Bundle.main.object(forInfoDictionaryKey: "BA4LSupabaseAnonKey") as? String else { return nil }
            return Configuration(url: url, anonKey: key)
        }

        private static func isPublicKey(_ key: String) -> Bool {
            if key.hasPrefix("sb_publishable_"), key.count > 20 { return true }
            let pieces = key.split(separator: ".", omittingEmptySubsequences: false)
            guard pieces.count == 3 else { return false }
            var encoded = String(pieces[1]).replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
            encoded += String(repeating: "=", count: (4 - encoded.count % 4) % 4)
            guard let data = Data(base64Encoded: encoded),
                  let claims = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return false }
            // The only legacy key safe to distribute is explicitly the anonymous public role.
            return claims["role"] as? String == "anon"
        }
    }

    struct TokenStorage {
        var read: () throws -> Data?
        var write: (Data) throws -> Void
        var remove: () throws -> Void

        static func keychain(account: String) -> TokenStorage {
            let query: [String: Any] = [
                kSecClass as String: kSecClassGenericPassword,
                kSecAttrService as String: "com.dougkvamme.StrikeCeiling.account.v1",
                kSecAttrAccount as String: account,
                kSecAttrSynchronizable as String: false
            ]
            return TokenStorage(read: {
                var search = query
                search[kSecReturnData as String] = true
                search[kSecMatchLimit as String] = kSecMatchLimitOne
                var item: CFTypeRef?
                let status = SecItemCopyMatching(search as CFDictionary, &item)
                if status == errSecItemNotFound { return nil }
                guard status == errSecSuccess, let data = item as? Data else { throw Failure.storage }
                return data
            }, write: { data in
                let attributes: [String: Any] = [kSecValueData as String: data, kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly]
                let status = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
                if status == errSecItemNotFound {
                    var new = query
                    attributes.forEach { new[$0.key] = $0.value }
                    guard SecItemAdd(new as CFDictionary, nil) == errSecSuccess else { throw Failure.storage }
                } else if status != errSecSuccess { throw Failure.storage }
            }, remove: {
                let status = SecItemDelete(query as CFDictionary)
                guard status == errSecSuccess || status == errSecItemNotFound else { throw Failure.storage }
            })
        }
    }

    typealias Transport = (URLRequest) async throws -> (Data, HTTPURLResponse)
    @Published private(set) var userID: String?
    @Published private(set) var email: String?
    @Published private(set) var busy = false
    @Published var error: String?
    @Published private(set) var codeSent = false
    @Published private(set) var hasPassword = false
    var signedIn: Bool { session != nil }
    var configured: Bool { configuration != nil }

    private struct User: Codable {
        struct Metadata: Codable { var has_password: Bool? }
        var id: String
        var email: String
        var email_confirmed_at: String?
        var confirmed_at: String?
        var user_metadata: Metadata?
    }
    private struct Response: Decodable {
        var access_token: String
        var refresh_token: String
        var expires_in: Double?
        var expires_at: Double?
        var token_type: String
        var user: User
    }
    private struct Session: Codable {
        var accessToken: String
        var refreshToken: String
        var expiresAt: Date
        var user: User
    }
    private enum Failure: LocalizedError {
        case configuration, storage, response, destination, changed, expired, message(String)
        var errorDescription: String? {
            switch self {
            case .configuration: return "Sign-in is not configured in this build. Install the latest BA4L update."
            case .storage: return "BA4L could not update secure sign-in storage. Unlock your device and try again."
            case .response: return "The sign-in service returned an unexpected response. Please try again."
            case .destination: return "This request is outside the BA4L service."
            case .changed: return "The account changed. Reload to continue."
            case .expired: return "Your session expired. Sign in again to continue."
            case .message(let text): return text
            }
        }
    }
    private struct HTTPFailure: Error { let status: Int }
    private let configuration: Configuration?
    private let transport: Transport
    private let storage: TokenStorage
    private let now: () -> Date
    private var session: Session?
    private var generation = UUID()
    private var refreshTask: Task<String, Error>?

    init(configuration: Configuration? = .bundled, transport: Transport? = nil,
         storage: TokenStorage? = nil, now: @escaping () -> Date = Date.init) {
        self.configuration = configuration
        self.transport = transport ?? { request in try await AccountHTTP.send(request) }
        self.storage = storage ?? .keychain(account: configuration?.url.host ?? "unconfigured")
        self.now = now
        guard configuration != nil else { return }
        do {
            if let data = try self.storage.read() {
                let saved = try JSONDecoder().decode(Session.self, from: data)
                guard Self.valid(saved.user), !saved.accessToken.isEmpty, !saved.refreshToken.isEmpty else { throw Failure.response }
                publish(saved)
            }
        } catch {
            self.error = "Could not restore your secure sign-in. Please sign in again."
            try? self.storage.remove()
        }
    }

    @discardableResult
    func requestCode(email: String) async -> Bool {
        await operation {
            guard session == nil else { throw Failure.message("Sign out before switching accounts.") }
            let address = try Self.address(email)
            let current = generation
            _ = try await auth("otp", body: ["email": address, "create_user": true])
            guard generation == current else { throw Failure.changed }
            codeSent = true
        }
    }

    @discardableResult
    func verifyCode(email: String, code: String) async -> Bool {
        await operation {
            guard session == nil else { throw Failure.message("Sign out before switching accounts.") }
            let address = try Self.address(email)
            let digits = code.trimmingCharacters(in: .whitespacesAndNewlines)
            guard digits.count == 6, digits.allSatisfy({ $0.isASCII && $0.isNumber }) else { throw Failure.message("Enter the 6-digit code from the email.") }
            let current = generation
            let data = try await auth("verify", body: ["email": address, "token": digits, "type": "email"])
            try accept(data, generation: current)
            codeSent = false
        }
    }

    @discardableResult
    func signIn(email: String, password: String) async -> Bool {
        await operation {
            guard session == nil else { throw Failure.message("Sign out before switching accounts.") }
            let address = try Self.address(email)
            guard !password.isEmpty else { throw Failure.message("Enter your password, or use an emailed code.") }
            let current = generation
            let data = try await auth("token?grant_type=password", body: ["email": address, "password": password])
            try accept(data, generation: current)
        }
    }

    @discardableResult
    func updatePassword(_ password: String) async -> Bool {
        await operation {
            guard password.count >= 8 else { throw Failure.message("Use at least 8 characters.") }
            let current = generation
            let token = try await accessToken()
            let data = try await auth("user", method: "PUT", body: ["password": password, "data": ["has_password": true]], bearer: token)
            guard current == generation, var updated = session else { throw Failure.changed }
            let user = try JSONDecoder().decode(User.self, from: data)
            guard Self.valid(user), user.id == updated.user.id else { throw Failure.response }
            updated.user = user
            try persist(updated)
        }
    }

    /// Clears identity before awaiting revocation, so in-flight requests cannot populate another account's UI.
    func signOut() async {
        let oldToken = session?.accessToken
        generation = UUID()
        refreshTask?.cancel()
        refreshTask = nil
        busy = false
        do { try storage.remove() } catch {
            self.error = "Could not sign out securely. Unlock your device and try again."
            return
        }
        publish(nil)
        codeSent = false
        error = nil
        // Local scope keeps the user's web session intact. Local credentials stay removed even when offline.
        if let oldToken { _ = try? await auth("logout?scope=local", body: nil, bearer: oldToken) }
    }

    /// The caller must recreate account-scoped stores when userID changes. No supplied cookies/tokens are trusted.
    func send(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        guard session != nil else { throw Failure.expired }
        guard let url = request.url, let parts = URLComponents(url: url, resolvingAgainstBaseURL: false),
              parts.scheme == "https", parts.host == "bigals4life.com", parts.port == nil,
              parts.user == nil, parts.password == nil, parts.fragment == nil,
              parts.percentEncodedPath == parts.path, parts.path.hasPrefix("/api/"),
              !parts.path.contains("//"), !parts.path.split(separator: "/").contains(where: { $0 == "." || $0 == ".." }) else { throw Failure.destination }
        let current = generation
        var outgoing = request
        outgoing.setValue(nil, forHTTPHeaderField: "Authorization")
        outgoing.setValue(nil, forHTTPHeaderField: "Cookie")
        outgoing.httpShouldHandleCookies = false
        outgoing.setValue("https://bigals4life.com", forHTTPHeaderField: "Origin")
        if session != nil { outgoing.setValue("Bearer " + (try await accessToken()), forHTTPHeaderField: "Authorization") }
        guard generation == current else { throw Failure.changed }
        let result = try await transport(outgoing)
        guard generation == current else { throw Failure.changed }
        // Retry only GET/HEAD after a 401; never replay mutations whose outcome could be ambiguous.
        if result.1.statusCode == 401, session != nil, ["GET", "HEAD"].contains(outgoing.httpMethod ?? "GET") {
            outgoing.setValue("Bearer " + (try await accessToken(forceRefresh: true)), forHTTPHeaderField: "Authorization")
            guard generation == current else { throw Failure.changed }
            let retried = try await transport(outgoing)
            guard generation == current else { throw Failure.changed }
            return retried
        }
        return result
    }

    private func operation(_ action: () async throws -> Void) async -> Bool {
        guard !busy else { return false }
        busy = true
        error = nil
        let current = generation
        defer { if current == generation { busy = false } }
        do {
            guard configuration != nil else { throw Failure.configuration }
            try await action()
            guard current == generation else { return false }
            return true
        } catch {
            if current == generation {
                if let http = error as? HTTPFailure {
                    self.error = http.status == 429 ? "Too many attempts. Wait a few minutes and try again." : "Sign-in could not be completed. Check your details or request a new email code."
                } else if error is URLError { self.error = "Could not reach sign-in. Check your connection and try again." }
                else { self.error = (error as? Failure)?.localizedDescription ?? "Sign-in could not be completed. Please try again." }
            }
            return false
        }
    }

    private func accessToken(forceRefresh: Bool = false) async throws -> String {
        guard let saved = session else { throw Failure.expired }
        if !forceRefresh, saved.expiresAt.timeIntervalSince(now()) > 60 { return saved.accessToken }
        if let task = refreshTask { return try await task.value }
        let current = generation
        let task = Task<String, Error> { [self] in
            do {
                let data = try await auth("token?grant_type=refresh_token", body: ["refresh_token": saved.refreshToken])
                try Task.checkCancellation()
                try accept(data, generation: current, expectedUser: saved.user.id)
                guard let token = session?.accessToken else { throw Failure.expired }
                return token
            } catch {
                if current == generation, let http = error as? HTTPFailure, [400, 401, 403].contains(http.status) {
                    generation = UUID()
                    publish(nil)
                    busy = false
                    try? storage.remove()
                    self.error = Failure.expired.localizedDescription
                    throw Failure.expired
                }
                throw error
            }
        }
        refreshTask = task
        defer { if current == generation || session == nil { refreshTask = nil } }
        return try await task.value
    }

    private func auth(_ path: String, method: String = "POST", body: [String: Any]?, bearer: String? = nil) async throws -> Data {
        guard let configuration, let url = URL(string: configuration.url.absoluteString.trimmingCharacters(in: CharacterSet(charactersIn: "/")) + "/auth/v1/" + path) else { throw Failure.configuration }
        var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 25)
        request.httpMethod = method
        request.httpShouldHandleCookies = false
        request.setValue(configuration.anonKey, forHTTPHeaderField: "apikey")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let bearer { request.setValue("Bearer " + bearer, forHTTPHeaderField: "Authorization") }
        if let body { request.httpBody = try JSONSerialization.data(withJSONObject: body) }
        let (data, response) = try await transport(request)
        guard (200..<300).contains(response.statusCode) else { throw HTTPFailure(status: response.statusCode) }
        guard data.count <= 100_000 else { throw Failure.response }
        return data
    }

    private func accept(_ data: Data, generation expected: UUID, expectedUser: String? = nil) throws {
        guard generation == expected else { throw Failure.changed }
        let result = try JSONDecoder().decode(Response.self, from: data)
        let expiry = result.expires_at.map(Date.init(timeIntervalSince1970:)) ?? result.expires_in.map { now().addingTimeInterval($0) }
        guard Self.valid(result.user), !result.access_token.isEmpty, result.access_token.count <= 16_384,
              !result.refresh_token.isEmpty, result.refresh_token.count <= 16_384,
              result.token_type.lowercased() == "bearer", let expiry, expiry > now(),
              expectedUser == nil || result.user.id == expectedUser else { throw Failure.response }
        try persist(Session(accessToken: result.access_token, refreshToken: result.refresh_token, expiresAt: expiry, user: result.user))
    }

    private func persist(_ value: Session) throws {
        try storage.write(JSONEncoder().encode(value))
        publish(value)
    }
    private func publish(_ value: Session?) {
        session = value
        userID = value?.user.id
        email = value?.user.email
        hasPassword = value?.user.user_metadata?.has_password == true
    }
    private static func valid(_ user: User) -> Bool {
        UUID(uuidString: user.id) != nil && !user.email.isEmpty && !(user.email_confirmed_at ?? user.confirmed_at ?? "").isEmpty
    }
    private static func address(_ value: String) throws -> String {
        let address = value.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard address.count <= 254, address.range(of: #"^[^\s@]+@[^\s@]+\.[^\s@]+$"#, options: .regularExpression) != nil else { throw Failure.message("Enter the email address the team knows you by.") }
        return address
    }
}

/// Redirects are rejected before URLSession can carry a bearer token to any other destination.
private final class AccountHTTP: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
    private static let delegate = AccountHTTP()
    private static let session: URLSession = {
        let config = URLSessionConfiguration.ephemeral
        config.httpCookieStorage = nil
        config.httpShouldSetCookies = false
        config.urlCache = nil
        return URLSession(configuration: config, delegate: delegate, delegateQueue: nil)
    }()
    static func send(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw URLError(.badServerResponse) }
        return (data, http)
    }
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
        completionHandler(nil)
    }
}
