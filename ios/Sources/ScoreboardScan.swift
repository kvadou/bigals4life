import SwiftUI
import UIKit

/// One row the web photo reader found on the scoreboard.
struct ScannedRow: Decodable, Identifiable {
    var id: Int = 0
    var name: String
    var rolls: [Int]
    var note: String
    private enum CodingKeys: String, CodingKey { case name, rolls, note }
}

struct ScanResult: Decodable {
    var bowlers: [ScannedRow]
    var warning: String
}

/// Sends a scoreboard photo to the same `/api/scoreboard` route the web app uses.
struct ScoreboardScanner {
    var send: (URLRequest) async throws -> (Data, HTTPURLResponse) = { request in
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw ScorebookError.invalidData }
        return (data, http)
    }

    static func prepare(_ image: UIImage) throws -> Data {
        let longest = max(image.size.width, image.size.height)
        let scale = min(1, 1800 / longest)
        let size = CGSize(width: image.size.width * scale, height: image.size.height * scale)
        let format = UIGraphicsImageRendererFormat.default(); format.scale = 1
        let resized = UIGraphicsImageRenderer(size: size, format: format).image { _ in image.draw(in: CGRect(origin: .zero, size: size)) }
        var quality: CGFloat = 0.9
        while quality >= 0.5 {
            if let data = resized.jpegData(compressionQuality: quality), data.count <= 2_500_000 { return data }
            quality -= 0.1
        }
        throw ScorebookError.server("Please get closer to the scoreboard so the photo is smaller.")
    }

    func read(_ jpeg: Data) async throws -> ScanResult {
        let boundary = "ba4l-" + UUID().uuidString
        var request = URLRequest(url: URL(string: ScorebookClient.origin + "/api/scoreboard")!, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 60)
        request.httpMethod = "POST"
        request.setValue(ScorebookClient.origin, forHTTPHeaderField: "Origin")
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        var body = Data()
        body.append("--\(boundary)\r\nContent-Disposition: form-data; name=\"image\"; filename=\"scoreboard.jpg\"\r\nContent-Type: image/jpeg\r\n\r\n".data(using: .utf8)!)
        body.append(jpeg)
        body.append("\r\n--\(boundary)--\r\n".data(using: .utf8)!)
        request.httpBody = body
        let (data, response) = try await send(request)
        guard (200..<300).contains(response.statusCode) else {
            struct Failure: Decodable { var error: String }
            throw ScorebookError.server((try? JSONDecoder().decode(Failure.self, from: data))?.error ?? "Photo reading is unavailable right now. You can still tap pins manually.")
        }
        var result = try JSONDecoder().decode(ScanResult.self, from: data)
        for index in result.bowlers.indices { result.bowlers[index].id = index }
        // Never trust rolls the server did not validate as a legal sequence.
        result.bowlers = result.bowlers.map { row in
            var game = BowlingGame()
            return row.rolls.count <= 21 && row.rolls.allSatisfy({ game.add($0) }) ? row : ScannedRow(name: row.name, rolls: [], note: row.note.isEmpty ? "Unreadable row. Enter this bowler manually." : row.note)
        }
        return result
    }
}

struct CameraPicker: UIViewControllerRepresentable {
    let source: UIImagePickerController.SourceType
    let onPick: (UIImage?) -> Void
    func makeCoordinator() -> Coordinator { Coordinator(onPick: onPick) }
    func makeUIViewController(context: Context) -> UIImagePickerController {
        let picker = UIImagePickerController()
        picker.sourceType = UIImagePickerController.isSourceTypeAvailable(source) ? source : .photoLibrary
        picker.delegate = context.coordinator
        return picker
    }
    func updateUIViewController(_ controller: UIImagePickerController, context: Context) {}
    final class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        let onPick: (UIImage?) -> Void
        init(onPick: @escaping (UIImage?) -> Void) { self.onPick = onPick }
        func imagePickerController(_ picker: UIImagePickerController, didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) { onPick(info[.originalImage] as? UIImage) }
        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) { onPick(nil) }
    }
}

/// Take a photo, review what was read, assign rows to bowlers, apply to the current game.
struct ScanSheet: View {
    @ObservedObject var store: ScorebookStore
    @Environment(\.dismiss) private var dismiss
    @State private var picker: UIImagePickerController.SourceType?
    @State private var busy = false
    @State private var error: String?
    @State private var warning = ""
    @State private var rows: [ScannedRow] = []
    @State private var targets: [Int: Int] = [:]   // row id -> bowler index, absent = skip
    var scanner = ScoreboardScanner()

    private var assignments: [(index: Int, rolls: [Int])] { rows.compactMap { row in targets[row.id].map { (index: $0, rolls: row.rolls) } }.filter { !$0.rolls.isEmpty } }
    private var duplicate: Bool { Set(assignments.map(\.index)).count != assignments.count }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Button("Take photo", systemImage: "camera") { picker = .camera }.disabled(busy).frame(minHeight: 44)
                    Button("Choose from library", systemImage: "photo.on.rectangle") { picker = .photoLibrary }.disabled(busy).frame(minHeight: 44)
                    if busy { ProgressView("Reading the frame marks…") }
                    if let error { Text(error).foregroundStyle(.red) }
                    if !warning.isEmpty { Text(warning).font(.callout).foregroundStyle(.orange) }
                } footer: {
                    Text("The photo is sent to the team's AI reader. Check every row before applying. Rows replace the selected bowler's current scorecard.")
                }
                if !rows.isEmpty {
                    Section("Review the rolls") {
                        ForEach(rows) { row in
                            VStack(alignment: .leading, spacing: 6) {
                                Text(row.name.isEmpty ? "Row \(row.id + 1)" : row.name).font(.headline)
                                Text(row.rolls.isEmpty ? "No usable rolls" : row.rolls.map { $0 == 10 ? "X" : String($0) }.joined(separator: " ")).font(.body.monospaced())
                                    .fixedSize(horizontal: false, vertical: true)
                                if !row.note.isEmpty { Text(row.note).font(.caption).foregroundStyle(BA4LTheme.secondary) }
                                Picker("Assign to", selection: Binding(get: { targets[row.id] ?? -1 }, set: { targets[row.id] = $0 < 0 ? nil : $0 })) {
                                    Text("Skip").tag(-1)
                                    ForEach(Night.names.indices, id: \.self) { Text(Night.names[$0]).tag($0) }
                                }
                                .pickerStyle(.menu)
                                .frame(minHeight: 44)
                                .accessibilityLabel("Assign \(row.name.isEmpty ? "row \(row.id + 1)" : row.name) to bowler")
                                .disabled(row.rolls.isEmpty)
                            }
                            .padding(.vertical, 4)
                        }
                        if duplicate { Text("Assign each bowler only once.").foregroundStyle(.red) }
                        Button("Apply \(assignments.count) bowler\(assignments.count == 1 ? "" : "s")") {
                            let apply = assignments
                            Task {
                                await store.change { night in
                                    for item in apply {
                                        night.rolls[item.index] = item.rolls
                                        night.finals?[item.index] = nil
                                    }
                                }
                                if store.error == nil { dismiss() }
                            }
                        }
                        .disabled(assignments.isEmpty || duplicate || busy || !store.canEdit)
                    }
                }
            }
            .navigationTitle("Scan scoreboard")
            .navigationBarTitleDisplayMode(.inline)
            .tint(BA4LTheme.tint)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Done") { dismiss() } } }
            .sheet(item: $picker) { source in
                CameraPicker(source: source) { image in
                    picker = nil
                    if let image { Task { await read(image) } }
                }
                .ignoresSafeArea()
            }
        }
    }

    private func read(_ image: UIImage) async {
        busy = true; error = nil; warning = ""; rows = []; targets = [:]
        defer { busy = false }
        do {
            let result = try await scanner.read(try ScoreboardScanner.prepare(image))
            rows = result.bowlers
            warning = result.warning
            for row in rows {
                if let index = Night.names.firstIndex(where: { $0.caseInsensitiveCompare(row.name.trimmingCharacters(in: .whitespaces)) == .orderedSame }), !row.rolls.isEmpty { targets[row.id] = index }
            }
            if rows.isEmpty { error = result.warning.isEmpty ? "No readable bowling rows found. Include names and all ten frames." : result.warning }
        } catch { self.error = error.localizedDescription }
    }
}

extension UIImagePickerController.SourceType: @retroactive Identifiable { public var id: Int { rawValue } }
