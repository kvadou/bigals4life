import AVFoundation
import Combine
import LiveKit

/// Local audio only. Nothing from this recorder is attached to a LiveKit track.
@MainActor final class NativeSoundboardAudio: NSObject, ObservableObject, SoundboardAudio, AVAudioRecorderDelegate, AVAudioPlayerDelegate {
    @Published private(set) var recording = false
    @Published private(set) var requesting = false
    @Published private(set) var draft: Data?
    @Published private(set) var duration: TimeInterval = 0
    @Published var error: String?
    private var recorder: AVAudioRecorder?
    private var player: AVAudioPlayer?
    private var recordingURL: URL?
    private var recordingGeneration = 0
    private var timeout: Task<Void, Never>?
    private struct SessionState {
        let category: AVAudioSession.Category
        let mode: AVAudioSession.Mode
        let options: AVAudioSession.CategoryOptions
        let automatic: Bool
    }
    private var savedSession: SessionState?
    override init() {
        super.init()
        NotificationCenter.default.addObserver(self, selector: #selector(interrupted), name: AVAudioSession.interruptionNotification, object: nil)
    }
    deinit { NotificationCenter.default.removeObserver(self) }
    @objc private func interrupted(_ notification: Notification) { suspend() }
    func startRecording() async {
        guard !recording, !requesting else { return }
        stopPlayback(); discard(); error = nil; requesting = true
        recordingGeneration += 1; let attempt = recordingGeneration
        let allowed = await AVAudioApplication.requestRecordPermission()
        guard attempt == recordingGeneration else { return }
        guard !Task.isCancelled else { requesting = false; return }
        requesting = false
        guard allowed else { error = "Microphone access is off. Enable it in Settings to record a sound."; return }
        do {
            try configure(record: true)
            let url = FileManager.default.temporaryDirectory.appendingPathComponent("ba4l-sound-\(UUID().uuidString).wav")
            recordingURL = url
            let recorder = try AVAudioRecorder(url: url, settings: [
                AVFormatIDKey: kAudioFormatLinearPCM, AVSampleRateKey: 16_000,
                AVNumberOfChannelsKey: 1, AVLinearPCMBitDepthKey: 16,
                AVLinearPCMIsFloatKey: false, AVLinearPCMIsBigEndianKey: false
            ])
            recorder.delegate = self
            guard recorder.prepareToRecord(), recorder.record(forDuration: 8) else { throw SoundboardFailure.invalidAudio }
            self.recorder = recorder; recording = true
            timeout = Task { [weak self] in
                do { try await Task.sleep(for: .seconds(8.2)) } catch { return }
                self?.stopRecording()
            }
        } catch { self.error = "Recording could not start. \(error.localizedDescription)"; clearRecording(); restore() }
    }
    func stopRecording() {
        guard recording else { return }
        recorder?.stop()
        finishRecording(success: true)
    }
    private func finishRecording(success: Bool) {
        guard recording else { return }
        recording = false; timeout?.cancel(); timeout = nil; recorder = nil
        defer { if let recordingURL { try? FileManager.default.removeItem(at: recordingURL) }; recordingURL = nil; restore() }
        guard success, let url = recordingURL else { error = "Recording was interrupted. Please try again."; return }
        do {
            // Canonical PCM WAV keeps upload size/format deterministic across OS recorder variants.
            let file = try AVAudioFile(forReading: url)
            guard file.processingFormat.sampleRate == 16_000, file.processingFormat.channelCount == 1,
                  file.length > 0, file.length <= 128_000,
                  let buffer = AVAudioPCMBuffer(pcmFormat: file.processingFormat, frameCapacity: AVAudioFrameCount(file.length)) else { throw SoundboardFailure.invalidAudio }
            try file.read(into: buffer)
            guard let samples = buffer.floatChannelData?[0] else { throw SoundboardFailure.invalidAudio }
            let count = Int(buffer.frameLength)
            var pcm = Data(capacity: count * 2)
            for index in 0..<count {
                var sample = Int16(max(-32768, min(32767, Int(samples[index] * 32767)))).littleEndian
                withUnsafeBytes(of: &sample) { pcm.append(contentsOf: $0) }
            }
            var wav = Data("RIFF".utf8)
            func append32(_ n: UInt32) { var x=n.littleEndian; withUnsafeBytes(of:&x) { wav.append(contentsOf:$0) } }
            func append16(_ n: UInt16) { var x=n.littleEndian; withUnsafeBytes(of:&x) { wav.append(contentsOf:$0) } }
            append32(UInt32(36 + pcm.count)); wav.append(Data("WAVEfmt ".utf8)); append32(16); append16(1); append16(1)
            append32(16_000); append32(32_000); append16(2); append16(16); wav.append(Data("data".utf8)); append32(UInt32(pcm.count)); wav.append(pcm)
            guard wav.count <= 256 * 1024 else { throw SoundboardFailure.invalidAudio }
            draft = wav; duration = Double(count) / 16_000
        } catch { self.error = "That recording could not be saved. Try recording again." }
    }
    func playBundled(_ name: String) throws {
        guard let url = Bundle.main.url(forResource: name, withExtension: "wav", subdirectory: "Sounds") ?? Bundle.main.url(forResource: name, withExtension: "wav") else { throw SoundboardFailure.invalidAudio }
        try play(data: Data(contentsOf: url))
    }
    func play(data: Data) throws {
        guard !recording, !requesting, data.count <= 256 * 1024 else { return }
        stopPlayback()
        do {
            try configure(record: false)
            let next = try AVAudioPlayer(data: data)
            next.delegate = self
            guard next.duration > 0, next.duration <= 8.1, next.prepareToPlay(), next.play() else { throw SoundboardFailure.invalidAudio }
            player = next
        } catch { restore(); throw error }
    }
    func preview() { guard let draft else { return }; do { try play(data: draft) } catch { self.error = error.localizedDescription } }
    func stopPlayback() { player?.stop(); player = nil; if !recording && !requesting { restore() } }
    func discard() { stopPlayback(); draft = nil; duration = 0 }
    func suspend() {
        recordingGeneration += 1; requesting = false
        if recording { stopRecording() }
        stopPlayback(); restore()
    }
    private func clearRecording() {
        timeout?.cancel(); timeout = nil; recorder?.stop(); recorder = nil; recording = false
        if let recordingURL { try? FileManager.default.removeItem(at: recordingURL) }; recordingURL = nil
    }
    private func configure(record: Bool) throws {
        let session = AVAudioSession.sharedInstance()
        if savedSession == nil {
            savedSession = SessionState(category:session.category,mode:session.mode,options:session.categoryOptions,automatic:AudioManager.shared.audioSession.isAutomaticConfigurationEnabled)
        }
        AudioManager.shared.audioSession.isAutomaticConfigurationEnabled = false
        try session.setCategory(record ? .playAndRecord : .playback, mode:.default, options:record ? [.defaultToSpeaker,.mixWithOthers] : [.mixWithOthers])
        try session.setActive(true)
    }
    private func restore() {
        guard let saved = savedSession else { return }; savedSession = nil
        do { try AVAudioSession.sharedInstance().setCategory(saved.category,mode:saved.mode,options:saved.options) }
        catch { self.error = "Audio settings could not be restored. Reconnect the live session." }
        AudioManager.shared.audioSession.isAutomaticConfigurationEnabled = saved.automatic
    }
    nonisolated func audioRecorderDidFinishRecording(_ recorder: AVAudioRecorder, successfully flag: Bool) {
        Task { @MainActor [weak self] in guard let self, self.recorder === recorder else { return }; self.finishRecording(success:flag) }
    }
    nonisolated func audioRecorderEncodeErrorDidOccur(_ recorder: AVAudioRecorder, error: Error?) {
        Task { @MainActor [weak self] in guard let self, self.recorder === recorder else { return }; self.finishRecording(success:false) }
    }
    nonisolated func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
        Task { @MainActor [weak self] in guard let self, self.player === player else { return }; self.stopPlayback() }
    }
}
