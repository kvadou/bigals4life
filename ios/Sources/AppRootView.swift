import SwiftUI

struct AppRootView: View {
    @StateObject private var session: AccountSession
    init() {
        #if DEBUG
        _session = StateObject(wrappedValue: nativeFixtureSession() ?? AccountSession())
        #else
        _session = StateObject(wrappedValue: AccountSession())
        #endif
    }
    var body: some View {
        Group {
            if let userID = session.userID, session.signedIn {
                if session.needsPasswordReset { SetPasswordView(session: session).id("reset-password") }
                else { SignedInApp(session: session, userID: userID).id(userID) }
            } else { SignInView(session: session) }
        }.tint(BA4LTheme.tint)
    }
}

struct SignInView: View {
    @ObservedObject var session: AccountSession
    @State private var email = ""
    @State private var password = ""
    @State private var code = ""
    @State private var usePassword = true
    @State private var recoveryMode = false
    var body: some View {
        NavigationStack {
            Form {
                Section {
                    HStack(spacing: 12) { BA4LBrandMark(size: 54).background(Color("BrandForest"), in: RoundedRectangle(cornerRadius: 12)); Text("Big Al’s 4 Life").font(.title.bold()) }
                    Text("Sign in with the same account you use on bigals4life.com. Your weeks, scores and team will appear here.")
                }
                Section("Your account") {
                    TextField("Email", text: $email).textContentType(.emailAddress).keyboardType(.emailAddress).textInputAutocapitalization(.never).autocorrectionDisabled()
                    if usePassword {
                        SecureField("Password", text: $password).textContentType(.password)
                        Button("Sign in") { Task { _ = await session.signIn(email: email, password: password) } }.disabled(email.isEmpty || password.isEmpty)
                        Button("Forgot password?") { code = ""; session.error = nil; recoveryMode = true; usePassword = false }.frame(minHeight: 44)
                        Button("Use an emailed sign-in code instead") { code = ""; session.error = nil; recoveryMode = false; usePassword = false }.frame(minHeight: 44)
                    } else {
                        Button(session.codeSent ? "Send another code" : "Email me a sign-in code") { Task { _ = await session.requestCode(email: email) } }.disabled(email.isEmpty)
                        if session.codeSent {
                            TextField("Email code", text: $code).textContentType(.oneTimeCode).keyboardType(.numberPad)
                            Button(recoveryMode ? "Verify & reset password" : "Verify & sign in") { Task { _ = await session.verifyCode(email: email, code: code, recovery: recoveryMode) } }.disabled(code.isEmpty)
                        }
                        Button("Use my password instead") { session.error = nil; usePassword = true }.frame(minHeight: 44)
                    }
                }.disabled(session.busy)
                if session.busy { ProgressView("Signing in…") }
                if let error = session.error { Section { Text(error).foregroundStyle(.red) } }
                Section { Text("Existing device scorecards remain backed up on this device. Signing in loads your shared team data.").font(.footnote) }
            }.navigationTitle("Welcome to BA4L")
        }
    }
}

private struct SetPasswordView: View {
    @ObservedObject var session: AccountSession
    @State private var password = ""
    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Label("Choose a new password", systemImage: "key.fill").font(.title2)
                    Text("Your email is verified. Set a password for faster sign-in next time.")
                }
                Section("New password") {
                    SecureField("Password", text: $password).textContentType(.newPassword)
                    Button("Save password") { Task { _ = await session.updatePassword(password) } }.disabled(password.count < 8)
                }
                if let error = session.error { Section { Text(error).foregroundStyle(.red) } }
            }
            .navigationTitle("Reset password")
        }
    }
}

struct SignedInApp: View {
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    @ObservedObject var session: AccountSession
    @StateObject private var store: ScorebookStore
    private let accountID: String
    @State private var tab = 0
    @State private var showSeason = false
    @State private var showGuestStudio = false
    @State private var homeIsRoot = true
    @State private var seasonSelection: String?
    @State private var scoreSeasonOrigin: String?
    @State private var selectedBowler: Int?
    @State private var profile: TonightProfile?
    private let preferences: UserDefaults
    @State private var waitingForTeam = false
    @State private var checkingAccess = false
    @State private var password = ""
    @State private var message: String?
    init(session: AccountSession, userID: String) {
        self.session = session
        self.accountID = userID
        let preferences = UserDefaults(suiteName: "com.dougkvamme.BA4L.account.\(userID)")!
        self.preferences = preferences
        let saved = preferences.object(forKey: "selectedBowler") as? Int
        _selectedBowler = State(initialValue: saved.flatMap { Night.names.indices.contains($0) ? $0 : nil })
        let directory = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("Accounts", isDirectory: true).appendingPathComponent(userID, isDirectory: true)
        _store = StateObject(wrappedValue: ScorebookStore(client: ScorebookClient(send: { request in
            guard session.userID == userID else { throw ScorebookError.server("Sign in to the original account to use this scorebook.") }
            return try await session.send(request)
        }), defaults: UserDefaults(suiteName: "com.dougkvamme.BA4L.account.\(userID)")!, directory: directory))
    }
    var body: some View {
        Group {
        if waitingForTeam {
            NavigationStack {
                Form {
                    Section {
                        Label("You’re signed in", systemImage: "person.crop.circle.badge.checkmark").font(.title2)
                        Text("Ask Doug to add this email to the team. Your shared scores will appear here once you have access.")
                        Text(session.email ?? "").font(.callout)
                    }
                    Section {
                        Button("Invited live sessions & private practice") { showGuestStudio = true }
                        Button("Check team access") { Task { await checkMembership() } }.disabled(checkingAccess)
                        Button("Sign out", role: .destructive) { Task { await session.signOut() } }
                    }
                }.navigationTitle("Welcome to BA4L")
            }
        } else {
        TabView(selection: $tab) {
            TonightView(store: store, selectedBowler: $selectedBowler, profile: profile, send: send, accountID: accountID, homeIsRoot: $homeIsRoot, showSeason: $showSeason, seasonSelection: $seasonSelection, onOpenNight: openNight)
                .tabItem { Label("Tonight", systemImage: "house") }.tag(0)
            ScoreboardView(store: store, selectedBowler: $selectedBowler, onReturnToSeason: scoreSeasonOrigin == nil ? nil : returnToSeason).tabItem { Label("Score", systemImage: "figure.bowling") }.tag(1)
            LeagueView(send: send).tabItem { Label("League", systemImage: "trophy") }.tag(2)
            NavigationStack {
                if let id = store.teamID {
                    ReviewView(nightID: id, accountID: accountID, send: send).id(id)
                } else {
                    ContentUnavailableView("Choose a night", systemImage: "text.bubble", description: Text("Open a night from Season to review your games with Bowling Bro’."))
                }
            }.tabItem { Label("Review", systemImage: "text.bubble") }.tag(3)
            NavigationStack {
                Form {
                    Section("Signed in") {
                        Text(session.email ?? "Team member")
                        if let profile { Text(profile.displayName).font(.headline) }
                        Picker("Preferred scorecard", selection: $selectedBowler) {
                            Text("Choose a bowler").tag(nil as Int?)
                            ForEach(Night.names.indices, id: \.self) { Text(Night.names[$0]).tag(Optional($0)) }
                        }
                    }
                    Section {
                        NavigationLink("Team access") { TeamAccessView(store: store) }
                        NavigationLink("Original device scorecards") { DeviceArchiveView() }
                    }
                    Section("Password") {
                        SecureField("New password", text: $password).textContentType(.newPassword)
                        Button("Update password") { Task { if await session.updatePassword(password) { password = ""; message = "Password updated." } } }.disabled(password.count < 8 || session.busy)
                    }
                    if let message { Text(message) }
                    if let error = session.error { Text(error).foregroundStyle(.red) }
                    Section {
                        Button("Sign out", role: .destructive) { Task { await session.signOut() } }.disabled(store.busy || session.busy)
                    } footer: { Text(store.pending ? "Your pending edit stays backed up for this account. Sign back in to retry it." : "Scores stay with your team. Device backups are kept separately for each account.") }
                    Section { Link("BA4L on the web", destination: URL(string: ScorebookClient.origin)!) }
                }.navigationTitle("Account")
            }.tabItem { Label("Account", systemImage: "person.crop.circle") }.tag(4)
        }.tint(horizontalSizeClass == .regular && tab == 0 && homeIsRoot && !showSeason ? Color("BrandGold") : BA4LTheme.tint)
            .modifier(NativeTabScrollBehavior(compact: horizontalSizeClass == .compact))
        }
        }.fullScreenCover(isPresented: $showGuestStudio) { LiveStudioView(accountID: accountID, send: send) }
        .onChange(of: tab) { old, new in
            if old == 1 && new != 1 { scoreSeasonOrigin = nil }
        }.onChange(of: selectedBowler) { _, value in
            if let value { preferences.set(value, forKey: "selectedBowler") }
            else { preferences.removeObject(forKey: "selectedBowler") }
        }.task {
            await checkMembership()
            guard !waitingForTeam else { return }
            await store.start()
            guard store.teamID == nil, store.night == Night(), store.canSwitchTeam else { return }
            do {
                let (data, response) = try await send(URLRequest(url: URL(string: ScorebookClient.origin + "/api/season")!))
                guard response.statusCode == 200 else { return }
                let season = try JSONDecoder().decode(SeasonResponse.self, from: data)
                guard let id = season.weeks.first?.id, store.teamID == nil, store.night == Night(), store.canSwitchTeam else { return }
                await store.openTeam(ScorebookClient.origin + "/season/" + id)
            } catch { /* Season displays the retryable load error. Never replace local edits. */ }
        }
    }
    private func checkMembership() async {
        guard !checkingAccess else { return }
        checkingAccess = true
        defer { checkingAccess = false }
        do {
            let (data, response) = try await send(URLRequest(url: URL(string: ScorebookClient.origin + "/api/me")!))
            guard response.statusCode == 200 else { return }
            let account = try JSONDecoder().decode(SeasonAccount.self, from: data)
            struct Identity: Decodable { let profile: TonightProfile }
            if let identity = try? JSONDecoder().decode(Identity.self, from: data) {
                profile = identity.profile
                if selectedBowler == nil { selectedBowler = identity.profile.bowlerIndex }
            }
            waitingForTeam = !account.admin && account.scorebooks.isEmpty
        } catch { /* Offline accounts keep their account-scoped backups; APIs enforce access. */ }
    }
    private func send(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        guard session.userID == accountID else { throw ScorebookError.server("This account changed. Reopen this screen.") }
        return try await session.send(request)
    }
    private func returnToSeason() {
        seasonSelection = scoreSeasonOrigin
        tab = 0
        showSeason = true
    }
    private func openNight(_ id: String) {
        scoreSeasonOrigin = id
        Task {
            await store.start()
            if !store.canSwitchTeam { tab = 1; return }
            await store.openTeam(ScorebookClient.origin + "/season/" + id)
            tab = 1
        }
    }
}

/// Let the system animate its own tab bar and update scroll-safe-area insets.
/// Regular-width iPad tabs keep their existing top navigation behavior.
private struct NativeTabScrollBehavior: ViewModifier {
    let compact: Bool
    @ViewBuilder func body(content: Content) -> some View {
        if #available(iOS 26.0, *) {
            content.tabBarMinimizeBehavior(compact ? .onScrollDown : .never)
        } else {
            content
        }
    }
}
