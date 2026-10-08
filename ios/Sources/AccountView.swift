import SwiftUI
import UserNotifications

struct TeamCard: Decodable {
    struct Bowler: Decodable, Identifiable {
        let name: String; let fullName: String; let average: Int?; let handicap: Int?; let games: Int?
        let you: Bool; let signedIn: Bool; let role: String?
        var id: String { name }
    }
    let team: String?; let scorebookId: String?; let yourRole: String?
    let bowlers: [Bowler]; let invites: [String]
}

/// Account opens on you and your team. Password, device archive and the web link sit behind "More".
struct AccountView: View {
    @ObservedObject var session: AccountSession
    @ObservedObject var store: ScorebookStore
    @Binding var selectedBowler: Int?
    @Binding var profile: TonightProfile?
    let accountID: String
    let preferences: UserDefaults
    let send: (URLRequest) async throws -> (Data, HTTPURLResponse)

    @State private var team: TeamCard?
    @State private var teamError: String?
    @State private var message: String?
    @State private var editingName = false
    @State private var firstName = ""
    @State private var lastName = ""
    @State private var savingName = false
    @State private var reminder = false
    @State private var reminderNote: String?

    private static let reminderID = "ba4l.league-night-reminder"

    var body: some View {
        List {
            Section { header }.listRowInsets(EdgeInsets()).listRowBackground(Color.clear)
            teamSection
            scorerSection
            Section {
                Toggle(isOn: Binding(get: { reminder }, set: { value in Task { await setReminder(value) } })) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("League night reminder")
                        Text("Thursdays at 5:30 PM").font(.caption).foregroundStyle(BA4LTheme.secondary)
                    }
                }
                .tint(BA4LTheme.tint)
                .accessibilityIdentifier("leagueReminder")
                if let reminderNote { Text(reminderNote).font(.footnote).foregroundStyle(BA4LTheme.secondary) }
            } header: { Text("Notifications") } footer: { Text("Sheet and teammate alerts come with push in a later build.") }
            Section {
                NavigationLink { more } label: {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("More")
                        Text("Password, device backups, BA4L on the web").font(.caption).foregroundStyle(BA4LTheme.secondary)
                    }.frame(minHeight: 44)
                }
            }
            if let message { Section { Text(message).font(.footnote) } }
            if let error = session.error { Section { Text(error).foregroundStyle(.red) } }
            Section {
                HStack {
                    Text(session.email ?? "Team member").font(.footnote).foregroundStyle(BA4LTheme.secondary).textSelection(.enabled)
                    Spacer()
                    Button("Sign out") { Task { await session.signOut() } }.font(.footnote).disabled(store.busy || session.busy)
                }
            } footer: { Text(store.pending ? "Your pending edit stays backed up for this account. Sign back in to retry it." : "Scores stay with your team. Device backups are kept separately for each account.") }
        }
        .listStyle(.insetGrouped)
        .navigationTitle("Account")
        .navigationBarTitleDisplayMode(.inline)
        .task { reminder = preferences.bool(forKey: "leagueReminder"); await loadTeam() }
        .refreshable { await loadTeam() }
        .sheet(isPresented: $editingName) { nameSheet }
    }

    // MARK: Header

    private var header: some View {
        let me = team?.bowlers.first { $0.you }
        return HStack(spacing: 14) {
            avatar(initials(profile?.fullName ?? session.email ?? "?"), size: 60, on: true)
            VStack(alignment: .leading, spacing: 4) {
                Button { startEditingName() } label: {
                    HStack(spacing: 6) {
                        Text(profile?.fullName ?? session.email?.split(separator: "@").first.map(String.init) ?? "Team member").font(.title3.weight(.semibold))
                        Image(systemName: "pencil").font(.caption).foregroundStyle(BA4LTheme.onTint.opacity(0.7))
                    }
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Edit your name")
                .accessibilityIdentifier("editName")
                Text(statLine(me)).font(.subheadline).foregroundStyle(BA4LTheme.onTint.opacity(0.85))
            }
            Spacer()
        }
        .foregroundStyle(BA4LTheme.onTint)
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(BA4LTheme.tint, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .padding(.horizontal, 16)
    }

    private func statLine(_ me: TeamCard.Bowler?) -> String {
        guard let me, let average = me.average else { return team == nil ? "Loading your league numbers…" : "No league numbers yet" }
        var parts = ["\(average) avg"]
        if let handicap = me.handicap { parts.append("hdcp \(handicap)") }
        if let games = me.games { parts.append("\(games) games this season") }
        return parts.joined(separator: " · ")
    }

    // MARK: Team

    @ViewBuilder private var teamSection: some View {
        Section {
            if let team {
                ForEach(team.bowlers) { bowler in
                    HStack(spacing: 12) {
                        avatar(String(bowler.name.prefix(1)), size: 36, on: bowler.signedIn)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(bowler.fullName).font(.body.weight(bowler.you ? .semibold : .regular))
                            Text(status(bowler)).font(.caption).foregroundStyle(bowler.signedIn ? BA4LTheme.secondary : Color("BrandGold"))
                        }
                        Spacer()
                        if let average = bowler.average { Text("\(average)").monospacedDigit().foregroundStyle(BA4LTheme.secondary).accessibilityLabel("average \(average)") }
                    }
                    .frame(minHeight: 44)
                    .accessibilityElement(children: .combine)
                }
                if !team.invites.isEmpty {
                    Text("Invited: \(team.invites.joined(separator: ", "))").font(.footnote).foregroundStyle(BA4LTheme.secondary)
                }
                if team.yourRole == "owner" {
                    NavigationLink { TeamAccessView(store: store) } label: { Label("Invite a teammate", systemImage: "person.badge.plus") }
                        .frame(minHeight: 44)
                        .accessibilityIdentifier("inviteTeammate")
                } else {
                    NavigationLink("Team access") { TeamAccessView(store: store) }.frame(minHeight: 44)
                }
            } else if let teamError {
                Label(teamError, systemImage: "exclamationmark.circle").foregroundStyle(BA4LTheme.secondary)
                Button("Try again") { Task { await loadTeam() } }
            } else {
                ProgressView("Loading the team…")
            }
        } header: { Text(team?.team?.capitalized ?? "Your team") }
    }

    private func status(_ b: TeamCard.Bowler) -> String {
        var parts: [String] = []
        switch b.role { case "owner": parts.append("Owner"); case "editor": parts.append("Can edit"); case "viewer": parts.append("View only"); default: break }
        if b.you { parts.append("you") } else if !b.signedIn { parts.append("Not signed in yet") } else if b.role == nil { parts.append("Signed in") }
        return parts.joined(separator: " · ")
    }

    // MARK: Scorer

    private var scorerSection: some View {
        Section {
            HStack(spacing: 12) {
                ForEach(Night.names.indices, id: \.self) { index in
                    let on = selectedBowler == index
                    Button {
                        selectedBowler = index
                        Task { await saveBowler(Night.names[index]) }
                    } label: {
                        VStack(spacing: 4) {
                            avatar(String(Night.names[index].prefix(1)), size: 44, on: on, gold: on)
                            Text(Night.names[index]).font(.caption2).foregroundStyle(on ? .primary : BA4LTheme.secondary)
                        }
                        .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(Night.names[index])
                    .accessibilityAddTraits(on ? .isSelected : [])
                    .accessibilityIdentifier("scoreAs-\(index)")
                }
            }
            .padding(.vertical, 4)
        } header: { Text("I usually score as") } footer: { Text("The Score tab opens on this bowler.") }
    }

    // MARK: More

    private var more: some View {
        MoreView(session: session)
    }

    // MARK: Name sheet

    private var nameSheet: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("First name", text: $firstName).textContentType(.givenName).autocorrectionDisabled()
                    TextField("Last name", text: $lastName).textContentType(.familyName).autocorrectionDisabled()
                } footer: { Text("Shown in greetings and to your team. It does not change access or scores.") }
            }
            .navigationTitle("Your name")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { editingName = false } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(savingName ? "Saving…" : "Save") { Task { await saveName() } }
                        .disabled(savingName || firstName.trimmingCharacters(in: .whitespaces).isEmpty || lastName.trimmingCharacters(in: .whitespaces).isEmpty)
                        .accessibilityIdentifier("saveName")
                }
            }
        }
        .presentationDetents([.medium])
    }

    // MARK: Pieces

    private func avatar(_ text: String, size: CGFloat, on: Bool, gold: Bool = false) -> some View {
        Text(text.uppercased())
            .font(.system(size: size * 0.4, weight: .bold, design: .rounded))
            .frame(width: size, height: size)
            .background(gold ? Color("BrandGold") : on ? BA4LTheme.tint : Color(.tertiarySystemFill), in: Circle())
            .foregroundStyle(gold ? Color("OnGoldSurface") : on ? BA4LTheme.onTint : BA4LTheme.secondary)
            .overlay(Circle().stroke(Color("BrandGold"), lineWidth: gold ? 3 : 0).padding(-3))
            .accessibilityHidden(true)
    }
    private func initials(_ name: String) -> String {
        let parts = name.split(separator: " ").prefix(2)
        let letters = parts.compactMap { $0.first }.map(String.init).joined()
        return letters.isEmpty ? String(name.prefix(1)) : letters
    }

    // MARK: Actions

    private func startEditingName() {
        let parts = (profile?.fullName ?? "").split(separator: " ", maxSplits: 1).map(String.init)
        firstName = parts.first ?? ""; lastName = parts.count > 1 ? parts[1] : ""
        editingName = true
    }
    @MainActor private func loadTeam() async {
        teamError = nil
        do {
            let (data, response) = try await send(URLRequest(url: URL(string: ScorebookClient.origin + "/api/me/team")!, cachePolicy: .reloadIgnoringLocalCacheData))
            struct Failure: Decodable { let error: String }
            guard response.statusCode == 200 else { teamError = (try? JSONDecoder().decode(Failure.self, from: data))?.error ?? "Team details are unavailable."; return }
            team = try JSONDecoder().decode(TeamCard.self, from: data)
        } catch { teamError = "Team details could not load. Check your connection." }
    }
    @MainActor private func patchMe(_ body: [String: String?]) async -> (TonightProfile?, String?) {
        do {
            var request = URLRequest(url: URL(string: ScorebookClient.origin + "/api/me")!)
            request.httpMethod = "PATCH"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONEncoder().encode(body)
            let (data, response) = try await send(request)
            struct Saved: Decodable { let profile: TonightProfile?; let error: String? }
            let saved = try? JSONDecoder().decode(Saved.self, from: data)
            guard response.statusCode == 200, let updated = saved?.profile else { return (nil, saved?.error ?? "Could not save.") }
            return (updated, nil)
        } catch { return (nil, "Could not save. Check your connection.") }
    }
    @MainActor private func saveName() async {
        savingName = true
        defer { savingName = false }
        let (updated, error) = await patchMe(["firstName": firstName.trimmingCharacters(in: .whitespaces), "lastName": lastName.trimmingCharacters(in: .whitespaces)])
        if let updated { profile = updated; message = "Name saved."; editingName = false } else { message = error }
    }
    @MainActor private func saveBowler(_ name: String) async {
        let (updated, error) = await patchMe(["bowlerName": name])
        if let updated { profile = updated; message = nil; await loadTeam() } else { message = error }
    }
    @MainActor private func setReminder(_ on: Bool) async {
        let center = UNUserNotificationCenter.current()
        if on {
            let granted = (try? await center.requestAuthorization(options: [.alert, .sound])) ?? false
            guard granted else { reminder = false; reminderNote = "Allow notifications for BA4L in Settings to get the reminder."; return }
            let content = UNMutableNotificationContent()
            content.title = "League night"
            content.body = "Big Al's at 6:30. Bring your ball."
            content.sound = .default
            var date = DateComponents(); date.weekday = 5; date.hour = 17; date.minute = 30
            let request = UNNotificationRequest(identifier: Self.reminderID, content: content, trigger: UNCalendarNotificationTrigger(dateMatching: date, repeats: true))
            do { try await center.add(request); reminder = true; reminderNote = nil; preferences.set(true, forKey: "leagueReminder") }
            catch { reminder = false; reminderNote = "Could not schedule the reminder." }
        } else {
            center.removePendingNotificationRequests(withIdentifiers: [Self.reminderID])
            reminder = false; reminderNote = nil; preferences.set(false, forKey: "leagueReminder")
        }
    }
}

/// Password, device archive and the web link. Rarely touched, so they live one level down.
private struct MoreView: View {
    @ObservedObject var session: AccountSession
    @State private var password = ""
    @State private var message: String?
    var body: some View {
        Form {
            Section("Password") {
                SecureField("New password", text: $password).textContentType(.newPassword)
                Button("Update password") { Task { if await session.updatePassword(password) { password = ""; message = "Password updated." } } }.disabled(password.count < 8 || session.busy)
                if let message { Text(message).font(.footnote) }
                if let error = session.error { Text(error).foregroundStyle(.red) }
            }
            Section { NavigationLink("Original device scorecards") { DeviceArchiveView() } } footer: { Text("Scorecards from before accounts, kept read-only for recovery.") }
            Section { Link("BA4L on the web", destination: URL(string: ScorebookClient.origin)!) }
        }
        .navigationTitle("More")
        .navigationBarTitleDisplayMode(.inline)
    }
}
