import AVFoundation
import CryptoKit
import SwiftUI

struct PrivatePracticeClip: Identifiable, Hashable {
    var id: URL { url }
    let url: URL
    let created: Date
}

@MainActor
final class PrivatePracticeRecorder: ObservableObject {
    @Published private(set) var cameraReady = false
    @Published private(set) var preparing = false
    @Published private(set) var recording = false
    @Published private(set) var saving = false
    @Published private(set) var clips: [PrivatePracticeClip] = []
    @Published var message: String?
    let capture = PrivatePracticeCapture()
    private var generation = 0
    // Keep finalization alive if the recording sheet is dismissed before AVFoundation finishes.
    private var finalizationOwner: PrivatePracticeRecorder?
    private let directory: URL
    init(accountID: String, storageRoot: URL? = nil) {
        directory = (storageRoot ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0])
            .appendingPathComponent("BA4L/PrivatePractice", isDirectory: true)
            .appendingPathComponent(SHA256.hash(data: Data(accountID.utf8)).map { String(format: "%02x", $0) }.joined(), isDirectory: true)
        capture.onFinished = { [weak self] url, error in
            Task { @MainActor in self?.finished(url: url, error: error) }
        }
        capture.onInterrupted = { [weak self] in
            Task { @MainActor in self?.stopCamera(); self?.message = "Camera interrupted. Enable it again when you’re ready." }
        }
        refresh()
    }
    func enableCamera() async {
        guard !preparing, !cameraReady, !saving else { return }
        generation += 1; let attempt = generation
        preparing = true; message = nil
        let allowed = AVCaptureDevice.authorizationStatus(for: .video) == .authorized
            ? true : await AVCaptureDevice.requestAccess(for: .video)
        guard generation == attempt else { return }
        guard allowed else { preparing = false; message = "Allow Camera in Settings to record a practice shot."; return }
        let error = await capture.start()
        guard generation == attempt else { capture.stop(); return }
        preparing = false; cameraReady = error == nil; message = error
    }
    func startRecording() {
        guard cameraReady, !recording, !saving else { return }
        do {
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            var folder = directory; var values = URLResourceValues(); values.isExcludedFromBackup = true
            try folder.setResourceValues(values)
            refresh()
            let size = try storageBytes()
            guard clips.count < 30, size < 936_000_000 else { message = "Practice storage is full. Export or delete a saved clip before recording another."; return }
            let free = try directory.resourceValues(forKeys: [.volumeAvailableCapacityForImportantUsageKey]).volumeAvailableCapacityForImportantUsage ?? 0
            guard free >= 128_000_000 else { message = "Not enough device storage. Free at least 128 MB, then try again."; return }
            message = nil; recording = true; finalizationOwner = self
            capture.record(to: directory.appendingPathComponent(UUID().uuidString + ".pending.mov"), maximumBytes: min(512_000_000, 1_000_000_000 - size, free - 64_000_000))
        } catch { message = "Could not prepare local storage. Try again after freeing device space." }
    }
    func stopRecording() {
        guard recording else { return }
        recording = false; saving = true; capture.finishRecording()
    }
    func stopCamera() {
        generation += 1; preparing = false; cameraReady = false
        if recording { recording = false; saving = true }
        capture.stop()
    }
    func saveLastTenSeconds(of clip: PrivatePracticeClip) async {
        guard clips.contains(clip) else { return }
        await exportClip(from: clip.url, lastTenOnly: true)
    }
    func importClip(from url: URL) async {
        guard url.isFileURL else { message = "Only an on-device replay can be saved here."; return }
        await exportClip(from: url, lastTenOnly: false)
    }
    private func exportClip(from source: URL, lastTenOnly: Bool) async {
        guard !recording, !saving else { return }
        saving = true; message = nil
        let temporary = directory.appendingPathComponent(UUID().uuidString + ".pending.mov")
        do {
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            var folder = directory; var values = URLResourceValues(); values.isExcludedFromBackup = true
            try folder.setResourceValues(values)
            let used = try storageBytes()
            let free = try directory.resourceValues(forKeys: [.volumeAvailableCapacityForImportantUsageKey]).volumeAvailableCapacityForImportantUsage ?? 0
            guard clips.count < 30, used + 64_000_000 <= 1_000_000_000, free >= 128_000_000 else { throw TrimError.storage }
            let asset = AVURLAsset(url: source)
            let duration = try await asset.load(.duration)
            guard duration.seconds.isFinite, duration.seconds > 0.2,
                  let export = AVAssetExportSession(asset: asset, presetName: AVAssetExportPresetPassthrough) else { throw TrimError.invalid }
            export.outputURL = temporary; export.outputFileType = .mov; export.fileLengthLimit = 64_000_000
            export.timeRange = CMTimeRange(start: CMTime(seconds: lastTenOnly ? max(0, duration.seconds - 10) : 0, preferredTimescale: 600), end: duration)
            await export.export()
            guard export.status == .completed else { throw TrimError.invalid }
            guard finished(url: temporary, error: nil) else { return }
            message = lastTenOnly ? "Saved the last up to 10 seconds as a separate replay. The original recording is unchanged." : "Replay saved to your private library on this device."
        } catch {
            saving = false; try? FileManager.default.removeItem(at: temporary)
            message = "Could not save a short replay. Check free storage or try another clip."
        }
    }
    private enum TrimError: Error { case storage, invalid }
    func delete(_ clip: PrivatePracticeClip) {
        do { try FileManager.default.removeItem(at: clip.url); refresh() }
        catch { message = "Could not delete that clip. Try again." }
    }
    private func storageBytes() throws -> Int64 {
        try FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: [.fileSizeKey])
            .reduce(Int64(0)) { $0 + Int64(try $1.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0) }
    }
    private func refresh() {
        do {
            guard FileManager.default.fileExists(atPath: directory.path) else { clips = []; return }
            let pending = try FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: [.contentModificationDateKey])
            for file in pending where file.lastPathComponent.contains(".pending.") {
                if let date = try? file.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate,
                   Date().timeIntervalSince(date) > 86_400 { try? FileManager.default.removeItem(at: file) }
            }
            clips = try FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: [.creationDateKey])
                .filter { $0.pathExtension == "mov" && !$0.lastPathComponent.contains(".pending.") }
                .map { PrivatePracticeClip(url: $0, created: (try? $0.resourceValues(forKeys: [.creationDateKey]).creationDate) ?? .distantPast) }
                .sorted { $0.created > $1.created }
        } catch { message = "Could not read saved clips. Your files have not been removed." }
    }
    @discardableResult private func finished(url: URL, error: String?) -> Bool {
        defer { finalizationOwner = nil }
        recording = false; saving = false
        if let error { try? FileManager.default.removeItem(at: url); message = error; return false }
        do {
            let destination = directory.appendingPathComponent(UUID().uuidString + ".mov")
            try FileManager.default.moveItem(at: url, to: destination)
            refresh(); message = "Clip saved on this device. Replay your recording below."
            return true
        } catch { message = "The clip could not be saved. Free some device storage and try again."; try? FileManager.default.removeItem(at: url); return false }
    }
}

/// All session operations are serialized off the main thread. No audio input is installed.
final class PrivatePracticeCapture: NSObject, AVCaptureFileOutputRecordingDelegate, @unchecked Sendable {
    let session = AVCaptureSession()
    var onFinished: ((URL, String?) -> Void)?
    var onInterrupted: (() -> Void)?
    private let queue = DispatchQueue(label: "BA4L.private.practice")
    private let output = AVCaptureMovieFileOutput()
    private var configured = false
    private var rotation: CGFloat = 90
    private var stopRequested = false
    private var observers: [NSObjectProtocol] = []
    override init() {
        super.init()
        for name in [AVCaptureSession.wasInterruptedNotification, AVCaptureSession.runtimeErrorNotification] {
            observers.append(NotificationCenter.default.addObserver(forName: name, object: session, queue: nil) { [weak self] _ in self?.stop(); self?.onInterrupted?() })
        }
    }
    deinit { observers.forEach(NotificationCenter.default.removeObserver) }
    func start() async -> String? {
        await withCheckedContinuation { continuation in queue.async {
            do {
                if !self.configured {
                    guard let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back) else { throw CaptureError.noCamera }
                    let input = try AVCaptureDeviceInput(device: device)
                    self.session.beginConfiguration()
                    self.session.sessionPreset = .hd1280x720
                    guard self.session.canAddInput(input), self.session.canAddOutput(self.output) else { self.session.commitConfiguration(); throw CaptureError.noCamera }
                    self.session.addInput(input); self.session.addOutput(self.output)
                    self.output.maxRecordedDuration = CMTime(seconds: 600, preferredTimescale: 600)
                    self.output.maxRecordedFileSize = 512_000_000
                    self.output.minFreeDiskSpaceLimit = 64_000_000
                    if let connection = self.output.connection(with: .video), connection.isVideoRotationAngleSupported(self.rotation) { connection.videoRotationAngle = self.rotation }
                    self.session.commitConfiguration(); self.configured = true
                }
                self.session.startRunning()
                continuation.resume(returning: self.session.isRunning ? nil : "Camera unavailable. Try again when it is free.")
            } catch { continuation.resume(returning: "A rear camera is required. Camera preview is unavailable on this device.") }
        } }
    }
    func setRotation(_ angle: CGFloat) { queue.async {
        self.rotation = angle
        if !self.output.isRecording, let connection = self.output.connection(with: .video), connection.isVideoRotationAngleSupported(angle) { connection.videoRotationAngle = angle }
    } }
    func record(to url: URL, maximumBytes: Int64) { queue.async {
        guard self.session.isRunning, !self.output.isRecording else { self.onFinished?(url, "Camera is not ready. Enable it and try again."); return }
        self.stopRequested = false
        self.output.maxRecordedFileSize = maximumBytes
        self.output.startRecording(to: url, recordingDelegate: self)
    } }
    func finishRecording() { queue.async { self.stopRequested = true; if self.output.isRecording { self.output.stopRecording() } } }
    func stop() { queue.async { self.stopRequested = true; if self.output.isRecording { self.output.stopRecording() }; if self.session.isRunning { self.session.stopRunning() } } }
    func fileOutput(_ output: AVCaptureFileOutput, didStartRecordingTo url: URL, from connections: [AVCaptureConnection]) {
        queue.async { if self.stopRequested, self.output.isRecording { self.output.stopRecording() } }
    }
    func fileOutput(_ output: AVCaptureFileOutput, didFinishRecordingTo url: URL, from connections: [AVCaptureConnection], error: Error?) {
        let succeeded = error == nil || (error as NSError?)?.userInfo[AVErrorRecordingSuccessfullyFinishedKey] as? Bool == true
        onFinished?(url, succeeded ? nil : "Recording could not finish. Keep the app open and try another shot.")
    }
    private enum CaptureError: Error { case noCamera }
}
