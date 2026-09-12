import SwiftUI

struct VoiceEntryView: View {
    @ObservedObject var store: ScorebookStore
    @Environment(\.dismiss) private var dismiss
    @State private var transcript = ""
    @State private var preview: VoiceRoll?
    @State private var original = Night()
    @State private var revision = 0
    @State private var id: String?
    @State private var error: String?
    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Doug strike, or Kyle seven then spare", text: $transcript, axis: .vertical)
                        .lineLimit(2...5).onChange(of: transcript) { _, _ in preview = nil; error = nil }
                    Text("Use the microphone on your keyboard to dictate, or type a roll. You’ll review it before it changes the scorecard.").font(.footnote)
                    Button("Preview rolls") {
                        do {
                            preview = try VoiceRoll.parse(transcript, night: store.night)
                            original = store.night; revision = store.revision; id = store.teamID; error = nil
                        } catch { self.error = error.localizedDescription }
                    }.disabled(transcript.isEmpty || !store.canEdit)
                }
                if let preview {
                    Section("Check before adding") {
                        LabeledContent("Bowler", value: Night.names[preview.index])
                        LabeledContent("Pins to add", value: preview.added.map(String.init).joined(separator: ", "))
                        Button("Add these rolls") {
                            Task {
                                guard store.night == original, store.revision == revision, store.teamID == id, store.canEdit else { error = "The scorecard changed. Preview these rolls again."; self.preview = nil; return }
                                await store.change { $0.rolls[preview.index] = preview.rolls }
                                if let failure = store.error { error = failure; self.preview = nil } else { dismiss() }
                            }
                        }.disabled(!store.canEdit)
                    }
                }
                if let error { Text(error).foregroundStyle(.red) }
            }.navigationTitle("Say a roll")
                .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Done") { dismiss() } } }
    }
}
}
