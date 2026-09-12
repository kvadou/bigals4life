import SwiftUI

struct TeamAccessAccount: Decodable {
    struct User: Decodable { let id: String; let email: String }
    struct Profile: Decodable { let displayName: String; let bowlerName: String? }
    let user: User
    let admin: Bool
    let profile: Profile
}
struct TeamAccessMembers: Decodable {
    struct Member: Decodable, Identifiable {
        let userId: String
        let role: String
        var id: String { userId }
    }
    struct Invite: Decodable, Identifiable {
        let email: String
        let role: String
        var id: String { email }
    }
    let role: String
    let members: [Member]
    let invites: [Invite]
}

@MainActor
final class TeamAccessModel: ObservableObject {
    @Published private(set) var account: TeamAccessAccount?
    @Published private(set) var members: TeamAccessMembers?
    @Published private(set) var bookID: String?
    @Published private(set) var busy = false
    @Published private(set) var error: String?
    @Published private(set) var notice: String?
    private let send: SeasonTransport
    private var generation = 0
    private struct Failure: Decodable { let error: String }
    private struct InviteBody: Encodable { let email: String; let role: String }
    private struct InviteResult: Decodable { let id: String; let email: String; let role: String; let status: String }
    private struct ClaimResult: Decodable { let id: String; let role: String }
    init(send: @escaping SeasonTransport) { self.send = send }
    var canInvite: Bool { members?.role == "owner" && !busy }
    var canClaim: Bool { account?.admin == true && members?.role == "legacy" && !busy }

    func load(bookID: String?) async {
        generation += 1
        let ticket = generation
        self.bookID = bookID; members = nil; account = nil; busy = true; error = nil; notice = nil
        defer { if generation == ticket { busy = false } }
        do {
            let me: TeamAccessAccount = try await request("/api/me")
            guard ticket == generation else { return }
            account = me
            if let bookID {
                guard UUID(uuidString: bookID) != nil else { throw failure("This scorebook link is invalid.") }
                let loaded: TeamAccessMembers = try await request("/api/nights/\(bookID)/members")
                guard ticket == generation else { return }
                members = loaded
            }
        } catch { if ticket == generation { self.error = error.localizedDescription } }
    }

    @discardableResult
    func invite(email: String, role: String) async -> Bool {
        guard canInvite, let bookID else { return false }
        let address = email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard Self.validEmail(address) else { error = "Enter a valid email address."; return false }
        guard ["editor", "viewer"].contains(role) || (role == "owner" && account?.admin == true) else { error = "Choose an allowed role."; return false }
        let ticket = generation
        busy = true; error = nil; notice = nil
        defer { if ticket == generation { busy = false } }
        do {
            let result: InviteResult = try await request("/api/nights/\(bookID)/members", method: "POST", body: JSONEncoder().encode(InviteBody(email: address, role: role)))
            guard ticket == generation, self.bookID == bookID else { return false }
            guard result.id == bookID && result.status == "invited" else { throw failure("The invitation response was incomplete. Refresh the teammate list before retrying.") }
            notice = "\(result.email) can sign in with that address to access this scorebook as \(result.role)."
            do {
                let updated: TeamAccessMembers = try await request("/api/nights/\(bookID)/members")
                guard ticket == generation else { return false }
                members = updated
            } catch { if ticket == generation { self.error = "The invitation was saved, but the teammate list could not refresh. Reload to check it." } }
            return true
        } catch { if ticket == generation { self.error = error.localizedDescription }; return false }
    }

    @discardableResult
    func claim() async -> Bool {
        guard canClaim, let bookID else { return false }
        let ticket = generation
        busy = true; error = nil; notice = nil
        defer { if ticket == generation { busy = false } }
        do {
            let result: ClaimResult = try await request("/api/nights/\(bookID)/claim", method: "POST")
            guard ticket == generation, self.bookID == bookID else { return false }
            guard result.id == bookID && result.role == "owner" else { throw failure("Ownership could not be confirmed. Reload this scorebook.") }
            notice = "This scorebook is now owned by your account. Add your teammates below."
            let updated: TeamAccessMembers = try await request("/api/nights/\(bookID)/members")
            guard ticket == generation else { return false }
            members = updated
            return true
        } catch { if ticket == generation { self.error = error.localizedDescription }; return false }
    }

    static func validEmail(_ value: String) -> Bool {
        value.count <= 120 && value.range(of: #"^[^\s@]+@[^\s@]+\.[^\s@]+$"#, options: .regularExpression) != nil
    }
    private func failure(_ message: String) -> NSError { NSError(domain: "BA4L.Team", code: 0, userInfo: [NSLocalizedDescriptionKey: message]) }
    private func request<T: Decodable>(_ path: String, method: String = "GET", body: Data? = nil) async throws -> T {
        var r = URLRequest(url: URL(string: ScorebookClient.origin + path)!, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 30)
        r.httpMethod = method; r.httpBody = body
        r.setValue("application/json", forHTTPHeaderField: "Accept")
        if body != nil { r.setValue("application/json", forHTTPHeaderField: "Content-Type") }
        let (data, response) = try await send(r)
        guard (200..<300).contains(response.statusCode) else {
            throw failure((try? JSONDecoder().decode(Failure.self, from: data).error) ?? "Team access is unavailable. Try again.")
        }
        return try JSONDecoder().decode(T.self, from: data)
    }
}

/// These controls change only the currently selected scorebook after an explicit button tap.
struct TeamAccessView: View {
    @ObservedObject private var store: ScorebookStore
    @StateObject private var model: TeamAccessModel
    @State private var email = ""
    @State private var role = "editor"
    @State private var showClaim = false
    @State private var claimBookID: String?
    init(store: ScorebookStore) {
        self.store = store
        _model = StateObject(wrappedValue: TeamAccessModel(send: store.transport))
    }
    var body: some View {
        Form {
            if let me = model.account {
                Section("Your account") {
                    Text(me.profile.displayName).font(.headline)
                    Text(me.user.email).foregroundStyle(.secondary).textSelection(.enabled)
                    if let bowler = me.profile.bowlerName { LabeledContent("Bowler", value: bowler) }
                    if me.admin { Label("League admin", systemImage: "person.badge.shield.checkmark") }
                }
            }
            if let error = model.error {
                Section {
                    Label(error, systemImage: "exclamationmark.circle").foregroundStyle(.secondary)
                    Button("Reload team access") { Task { await model.load(bookID: store.teamID) } }
                }
            }
            if let notice = model.notice { Section { Label(notice, systemImage: "checkmark.circle") } }
            if store.teamID == nil {
                Section {
                    ContentUnavailableView("Choose a team scorebook", systemImage: "person.2", description: Text("Open a night from the season, or save your local game to the team. Access is managed separately for each scorebook."))
                }
            } else if let members = model.members {
                Section("This scorebook") {
                    LabeledContent("Your access", value: accessName(members.role))
                    Text(accessDescription(members.role)).foregroundStyle(.secondary)
                    if let link = store.shareURL { ShareLink(item: link) { Label("Share scorebook link", systemImage: "square.and.arrow.up") } }
                    if members.role == "legacy" {
                        if model.account?.admin == true {
                            Button("Claim this scorebook") { claimBookID = model.bookID; showClaim = true }.disabled(!model.canClaim)
                        } else { Text("Only the league admin can claim this earlier scorebook.").font(.footnote).foregroundStyle(.secondary) }
                    }
                }
                Section("Members") {
                    if members.members.isEmpty { Text("No account memberships yet.").foregroundStyle(.secondary) }
                    ForEach(Array(members.members.enumerated()), id: \.element.id) { index, member in
                        VStack(alignment: .leading, spacing: 4) {
                            Text(member.userId == model.account?.user.id ? "You" : "Team member \(index + 1)").font(.headline)
                            Text(accessName(member.role)).font(.subheadline).foregroundStyle(.secondary)
                            if member.userId != model.account?.user.id {
                                Text("Account \(member.userId.prefix(8))").font(.caption).foregroundStyle(.secondary)
                            }
                        }
                    }
                }
                Section("Pending invitations") {
                    if members.invites.isEmpty { Text("No pending invitations.").foregroundStyle(.secondary) }
                    ForEach(members.invites) { invite in
                        VStack(alignment: .leading, spacing: 4) {
                            Text(invite.email).textSelection(.enabled)
                            Text(accessName(invite.role)).font(.subheadline).foregroundStyle(.secondary)
                        }
                    }
                }
                if members.role == "owner" {
                    Section {
                        TextField("Teammate’s email", text: $email).keyboardType(.emailAddress).textContentType(.emailAddress).textInputAutocapitalization(.never).autocorrectionDisabled()
                            .onChange(of: email) { _, value in if value.count > 120 { email = String(value.prefix(120)) } }
                        Picker("Access", selection: $role) {
                            Text("Can edit scores").tag("editor")
                            Text("Can view scores").tag("viewer")
                            if model.account?.admin == true { Text("Owner").tag("owner") }
                        }
                        Button("Add teammate") {
                            Task { guard model.bookID == store.teamID else { return }; if await model.invite(email: email, role: role) { email = "" } }
                        }.disabled(!model.canInvite || !TeamAccessModel.validEmail(email.trimmingCharacters(in: .whitespacesAndNewlines)))
                    } header: { Text("Add a teammate") } footer: { Text("They must sign in with this email address. Sharing the link alone does not grant access to a claimed scorebook.") }
                }
            }
            if model.busy { ProgressView("Updating team access…") }
        }
        .navigationTitle("Team access")
        .disabled(model.busy)
        .task(id: store.teamID) { email = ""; role = "editor"; await model.load(bookID: store.teamID) }
        .refreshable { await model.load(bookID: store.teamID) }
        .confirmationDialog("Claim this scorebook?", isPresented: $showClaim, titleVisibility: .visible) {
            Button("Claim for my account") {
                Task { guard claimBookID == store.teamID, model.bookID == store.teamID else { return }; if await model.claim() { await store.refresh(force: true) } }
            }
        } message: { Text("This secures the earlier scorebook under your account. Add the team afterward so they can sign in and access it.") }
    }
    private func accessName(_ value: String) -> String {
        switch value { case "owner": "Owner"; case "editor": "Can edit"; case "viewer": "View only"; case "legacy": "Unclaimed"; default: "Unavailable" }
    }
    private func accessDescription(_ value: String) -> String {
        switch value {
        case "owner": "You can edit scores and add teammates."
        case "editor": "You can record scores. Ask the owner to add teammates."
        case "viewer": "You can see scores. Ask the owner for edit access."
        case "legacy": "This earlier scorebook has not been claimed by an account."
        default: "Reload to check access."
        }
    }
}
