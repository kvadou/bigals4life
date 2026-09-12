import SwiftUI
import UniformTypeIdentifiers

/// Pre-sign-in scorecards are deliberately separate from every account's active scorebook.
/// This view reads and shares originals. It never imports, changes, deletes, or uploads them.
struct DeviceArchiveView: View {
    @State private var files: [DeviceArchiveFile] = []
    @State private var legacyData: Data?
    @State private var legacyBowlers: [Bowler] = []
    @State private var legacyError: String?
    @State private var loadError: String?
    @State private var loaded = false

    var body: some View {
        List {
            Section {
                Label("Earlier device scorecards", systemImage: "archivebox").font(.headline)
                Text("These files were saved before accounts were introduced. They are not assigned to the account signed in now.")
                Text("Preview or share an original for recovery. Nothing here imports scores, changes your team, or sends data to BA4L.")
                    .font(.footnote).foregroundStyle(.secondary)
            }
            if let loadError { Section { Label(loadError, systemImage: "exclamationmark.triangle").foregroundStyle(.secondary) } }
            if !files.isEmpty {
                Section("Original backup files") {
                    ForEach(files) { file in
                        NavigationLink {
                            DeviceArchiveDetail(file: file)
                        } label: {
                            VStack(alignment: .leading, spacing: 6) {
                                Text(file.title).font(.headline)
                                Text(file.url.lastPathComponent).font(.caption).foregroundStyle(.secondary).lineLimit(2)
                                if let date = file.modified { Text(date, format: .dateTime.month().day().year().hour().minute()).font(.caption).foregroundStyle(.secondary) }
                            }.padding(.vertical, 4)
                        }
                    }
                }
            }
            if let legacyData {
                Section("Original bowler archive") {
                    Text("The earliest version stored these scorecards on this device. They have not been assigned to an account.")
                        .font(.footnote).foregroundStyle(.secondary)
                    if let legacyError { Label(legacyError, systemImage: "exclamationmark.triangle").foregroundStyle(.secondary) }
                    ForEach(Array(legacyBowlers.enumerated()), id: \.offset) { _, bowler in
                        VStack(alignment: .leading, spacing: 4) {
                            Text(bowler.name).font(.headline)
                            Text("\(bowler.game.settledScore) points · \(bowler.game.isComplete ? "Final" : "In progress")")
                            Text("\(bowler.game.rolls.count) recorded rolls").font(.caption).foregroundStyle(.secondary)
                        }.padding(.vertical, 4)
                    }
                    ShareLink(item: LegacyArchiveTransfer(data: legacyData), preview: SharePreview("Original bowler archive")) {
                        Label("Share original bowler archive", systemImage: "square.and.arrow.up")
                    }
                }
            }
            if loaded && files.isEmpty && legacyData == nil && loadError == nil {
                ContentUnavailableView("No earlier device archives", systemImage: "archivebox", description: Text("No pre-sign-in scorecards were found on this device. Account scorebooks remain available in Season."))
            }
        }
        .navigationTitle("Device archives")
        .task { load() }
    }

    private func load() {
        guard !loaded else { return }
        defer { loaded = true }
        let manager = FileManager.default
        let directory = manager.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("Scorebooks", isDirectory: true)
        if manager.fileExists(atPath: directory.path) {
            do {
                files = try manager.contentsOfDirectory(at: directory, includingPropertiesForKeys: [.isRegularFileKey, .isSymbolicLinkKey, .contentModificationDateKey], options: [.skipsHiddenFiles])
                    .filter { url in
                        guard url.pathExtension.lowercased() == "json", let values = try? url.resourceValues(forKeys: [.isRegularFileKey, .isSymbolicLinkKey]) else { return false }
                        return values.isRegularFile == true && values.isSymbolicLink != true
                    }
                    .map { DeviceArchiveFile(url: $0, modified: try? $0.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate) }
                    .sorted { ($0.modified ?? .distantPast) > ($1.modified ?? .distantPast) }
            } catch { loadError = "Device backup files could not be listed. Unlock this device and reopen this screen." }
        }
        if let data = UserDefaults.standard.data(forKey: ScorebookStore.legacyArchiveName) {
            legacyData = data
            do {
                guard data.count <= 2_000_000 else { throw ScorebookError.invalidData }
                let bowlers = try JSONDecoder().decode([Bowler].self, from: data)
                for bowler in bowlers {
                    var checked = BowlingGame()
                    guard bowler.game.rolls.count <= 21, bowler.game.rolls.allSatisfy({ checked.add($0) }) else { throw ScorebookError.invalidData }
                }
                legacyBowlers = bowlers
            } catch { legacyError = "This archive cannot be previewed. Its original data is still available to share for recovery." }
        }
    }
}

private struct LegacyArchiveTransfer: Transferable {
    let data: Data
    static var transferRepresentation: some TransferRepresentation {
        DataRepresentation(exportedContentType: .json) { $0.data }
    }
}

private struct DeviceArchiveFile: Identifiable {
    let url: URL
    let modified: Date?
    var id: String { url.path }
    var title: String {
        if url.lastPathComponent == "local.json" { return "Earlier local scorebook" }
        if url.lastPathComponent.hasPrefix("discarded-") { return "Preserved edit before reload" }
        return "Earlier team scorebook"
    }
}

private struct DeviceArchiveDetail: View {
    let file: DeviceArchiveFile
    @State private var backup: ScorebookBackup?
    @State private var error: String?

    var body: some View {
        List {
            Section {
                Text(file.url.lastPathComponent).font(.caption).textSelection(.enabled)
                Text("Read-only original. Sharing this file does not import or apply its scores to your current account.")
                    .font(.footnote).foregroundStyle(.secondary)
                ShareLink(item: file.url) { Label("Share original backup", systemImage: "square.and.arrow.up") }
            }
            if let error { Section { Label(error, systemImage: "exclamationmark.triangle").foregroundStyle(.secondary) } }
            if let backup {
                Section("Backup status") {
                    Label(backup.pending ? "Pending edit in this backup" : "No pending edit recorded", systemImage: backup.pending ? "exclamationmark.arrow.triangle.2.circlepath" : "checkmark.circle")
                    if backup.pending { Text("This edit may not have reached the team. Keep the original and compare it with the current team scorebook before restoring anything.").font(.footnote).foregroundStyle(.secondary) }
                    if let id = backup.id { Text("Original team ID").font(.caption).foregroundStyle(.secondary); Text(id).font(.caption).textSelection(.enabled) }
                    LabeledContent("Saved revision", value: String(backup.revision))
                    LabeledContent("Current game", value: String(backup.night.game))
                }
                ForEach(Array(([backup.night.current] + backup.night.history.reversed()).enumerated()), id: \.offset) { _, game in
                    Section("Game \(game.game)") {
                        ForEach(Night.names.indices, id: \.self) { index in
                            let bowling = game.bowling(index)
                            let final = game.finals?[index]
                            VStack(alignment: .leading, spacing: 4) {
                                LabeledContent(Night.names[index], value: String(final ?? bowling.settledScore))
                                Text(final != nil || bowling.isComplete ? "Final" : bowling.rolls.isEmpty ? "No rolls recorded" : "In progress · \(bowling.rolls.count) recorded rolls")
                                    .font(.caption).foregroundStyle(.secondary)
                            }
                        }
                    }
                }
            }
        }
        .navigationTitle(file.title)
        .navigationBarTitleDisplayMode(.inline)
        .task(id: file.id) {
            do {
                let values = try file.url.resourceValues(forKeys: [.fileSizeKey])
                guard (values.fileSize ?? 0) <= 2_000_000 else { throw ScorebookError.invalidData }
                let value = try JSONDecoder().decode(ScorebookBackup.self, from: Data(contentsOf: file.url))
                _ = try value.night.validated()
                backup = value
            } catch { self.error = "This backup cannot be previewed. The original file is unchanged and can still be shared for recovery." }
        }
    }
}
