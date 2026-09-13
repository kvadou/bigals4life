import SwiftUI

struct NativeSoundboardView: View {
    let isHost: Bool
    let connected: Bool
    let connectionID: String?
    @StateObject private var board: NativeSoundboardModel
    @StateObject private var audio: NativeSoundboardAudio
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var hidden = false
    @State private var visible = false
    @State private var recordingTitle = ""
    @State private var confirmHostMute = false
    @State private var removing: SoundboardClip?
    init(sessionID: String, isHost: Bool, connected: Bool, connectionID: String?, send: @escaping SeasonTransport) {
        self.isHost = isHost; self.connected = connected; self.connectionID = connectionID
        let audio = NativeSoundboardAudio()
        _audio = StateObject(wrappedValue:audio)
        _board = StateObject(wrappedValue:NativeSoundboardModel(sessionID:sessionID,audio:audio,send:send))
    }
    private var activeID: String? { connected && visible && !hidden && (scenePhase == .active || (scenePhase == .inactive && audio.requesting)) ? connectionID : nil }
    var body: some View {
        VStack(alignment:.leading,spacing:16) {
            HStack {
                Label("Lane soundboard",systemImage:"speaker.wave.2").font(.headline)
                Spacer()
                Button(hidden ? "Show" : "Hide") { hidden.toggle() }.frame(minHeight:44)
                    .accessibilityLabel(hidden ? "Show lane soundboard" : "Hide lane soundboard")
            }
            if !hidden {
                Text("A little noise for a big shot. Tap a cue to celebrate with the session.").font(.callout).foregroundStyle(BA4LTheme.secondary)
                if activeID == nil { Text("Connect to use the soundboard.").foregroundStyle(BA4LTheme.secondary) }
                else if !board.loaded && board.error == nil { ProgressView("Loading sounds…") }
                if let event = board.celebration {
                    HStack(spacing:12) {
                        if reduceMotion { Text(emoji(event.soundId)).font(.largeTitle) }
                        else {
                            Text(emoji(event.soundId)).font(.largeTitle)
                                .phaseAnimator([0.0, -8.0, 8.0, 0.0]) { content, angle in
                                    content.rotationEffect(.degrees(angle))
                                } animation: { _ in .easeInOut(duration:0.18) }
                        }
                        Text("\(event.author) · \(title(event.soundId))")
                    }
                        .font(.headline).padding().frame(maxWidth:.infinity,alignment:.leading)
                        .background(Color("BrandIvory"),in:RoundedRectangle(cornerRadius:12))
                        .transition(reduceMotion ? .identity : .opacity)
                }
                Text("Sound on this device").font(.subheadline.weight(.semibold))
                Picker("Sound on this device",selection:Binding(get:{board.listening},set:{ mode in
                    if mode == .off { board.mute() } else { Task { await board.choose(mode) } }
                })) {
                    ForEach(NativeSoundboardModel.Listening.allCases,id:\.self) { Text($0.rawValue).tag($0) }
                }.pickerStyle(.menu).frame(minHeight:44)
                Text(board.listening == .speaker ? "This device is the lane speaker. Keep this screen open." : board.listening == .personal ? "Personal listening is on. Headphones keep the lane from hearing duplicates." : "Sound is off. Visual celebrations still appear. Only one device can be the lane speaker.")
                    .font(.caption).foregroundStyle(BA4LTheme.secondary)
                if board.loaded && !board.enabled { Label("The host muted session sounds.",systemImage:"speaker.slash").font(.callout) }
                LazyVGrid(columns:[GridItem(.adaptive(minimum:130))],spacing:10) {
                    ForEach(NativeSoundboardModel.builtIns,id:\.id) { sound in
                        Button { Task { await board.play(sound.id) } } label: {
                            Text("\(sound.emoji) \(sound.title)").frame(maxWidth:.infinity,minHeight:44)
                        }.buttonStyle(.bordered).disabled(!board.canSend || activeID == nil)
                    }
                }
                if !board.clips.isEmpty {
                    Text("Session clips").font(.subheadline.weight(.semibold))
                    ForEach(board.clips) { clip in
                        HStack {
                            Button(clip.title,systemImage:"play.circle") { Task { await board.play(clip.id) } }
                                .frame(maxWidth:.infinity,minHeight:44,alignment:.leading).disabled(!board.canSend || activeID == nil)
                            if isHost || clip.canRemove == true {
                                Button { removing = clip } label:{ Image(systemName:"trash").frame(minWidth:44,minHeight:44) }
                                    .accessibilityLabel("Remove \(clip.title)").disabled(board.busy || activeID == nil)
                            }
                        }
                    }
                }
                DisclosureGroup("Record your own sound") { recordingControls.padding(.top,12) }
                if let message = board.message { Text(message).font(.callout).foregroundStyle(BA4LTheme.secondary) }
                if let error = board.error {
                    Text(error).font(.callout).foregroundStyle(BA4LTheme.secondary)
                    Button("Refresh sounds") { Task { await board.refresh() } }.frame(minHeight:44).disabled(activeID == nil)
                }
                if isHost {
                    Button(board.enabled ? "Mute session sounds" : "Enable session sounds",systemImage:board.enabled ? "speaker.slash" : "speaker.wave.2") { confirmHostMute = true }
                        .frame(minHeight:44).disabled(board.busy || !board.loaded || activeID == nil)
                }
            }
        }.padding().background(.background,in:RoundedRectangle(cornerRadius:16))
            .animation(reduceMotion ? nil : .easeOut(duration:0.2),value:board.celebration?.id)
            .onAppear { visible = true }.onDisappear { visible = false; board.suspend() }
            .onChange(of:activeID) { _, id in board.activate(id) }
            .task(id:activeID) {
                board.activate(activeID)
                guard activeID != nil else { return }
                while !Task.isCancelled { await board.refresh(); do { try await Task.sleep(for:.seconds(3)) } catch { break } }
            }
            .task(id:activeID) {
                guard activeID != nil else { return }
                while !Task.isCancelled { board.tick(); do { try await Task.sleep(for:.seconds(1)) } catch { break } }
            }
            .confirmationDialog(board.enabled ? "Mute sounds for everyone?" : "Enable sounds for this session?",isPresented:$confirmHostMute,titleVisibility:.visible) {
                Button(board.enabled ? "Mute session sounds" : "Enable session sounds") { Task { await board.setEnabled(!board.enabled) } }
                Button("Cancel",role:.cancel) {}
            }
            .confirmationDialog("Remove this session clip?",isPresented:Binding(get:{removing != nil},set:{if !$0 {removing=nil}}),titleVisibility:.visible) {
                Button("Remove clip",role:.destructive) { if let clip = removing { Task { await board.remove(clip) } }; removing=nil }
                Button("Cancel",role:.cancel) { removing=nil }
            }
    }
    private var recordingControls: some View {
        VStack(alignment:.leading,spacing:12) {
            Text("Record up to 8 seconds using this device’s microphone. Preview it privately, then choose Share with session. Your live camera never broadcasts the microphone.")
                .font(.callout).foregroundStyle(BA4LTheme.secondary)
            if audio.recording {
                Label("Recording · stops at 8 seconds",systemImage:"mic.fill").font(.headline)
                Button("Stop recording",systemImage:"stop.circle") { audio.stopRecording() }.frame(minHeight:44)
            } else {
                Button(audio.requesting ? "Requesting microphone…" : "Record sound",systemImage:"mic") { board.prepareRecording(); Task { await audio.startRecording() } }
                    .frame(minHeight:44).disabled(activeID == nil || audio.requesting || board.busy)
            }
            if let data = audio.draft {
                Text(String(format:"Recorded %.1f seconds. Only on this device until shared.",audio.duration)).font(.caption).foregroundStyle(BA4LTheme.secondary)
                HStack {
                    Button("Preview",systemImage:"play") { audio.preview() }.frame(minHeight:44).disabled(activeID == nil)
                    Button("Stop preview",systemImage:"stop") { audio.stopPlayback() }.frame(minHeight:44)
                    Button("Discard",role:.destructive) { audio.discard() }.frame(minHeight:44).disabled(board.busy)
                }
                TextField("Clip title",text:$recordingTitle).textFieldStyle(.roundedBorder)
                    .onChange(of:recordingTitle) { _, value in recordingTitle = String(value.prefix(40)); while recordingTitle.utf16.count > 40 { recordingTitle.removeLast() } }
                Button("Share with session",systemImage:"square.and.arrow.up") {
                    let title = recordingTitle
                    Task { if await board.save(title:title,data:data) { audio.discard(); recordingTitle="" } }
                }.buttonStyle(.borderedProminent).foregroundStyle(BA4LTheme.onTint).frame(minHeight:44)
                    .disabled(activeID == nil || board.busy || recordingTitle.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty)
            }
            if let error = audio.error { Text(error).font(.callout).foregroundStyle(BA4LTheme.secondary) }
        }
    }
    private func emoji(_ id: String) -> String { NativeSoundboardModel.builtIns.first { $0.id == id }?.emoji ?? "🎉" }
    private func title(_ id:String) -> String {
        NativeSoundboardModel.builtIns.first {$0.id == id}?.title ?? board.clips.first {$0.id == id}?.title ?? "Session sound"
    }
}
