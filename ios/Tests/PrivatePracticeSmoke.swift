// Standalone macOS AVFoundation smoke. Compile with Sources/PrivatePracticeRecorder.swift.
// Uses only generated silent video in a unique temporary directory; no camera or account data.
import AVFoundation
import CryptoKit
import Foundation

@main struct PrivatePracticeSmoke {
    @MainActor static func main() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("ba4l-practice-test-" + UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let hash = SHA256.hash(data: Data("account-a".utf8)).map { String(format: "%02x", $0) }.joined()
        let directory = root.appendingPathComponent("BA4L/PrivatePractice/" + hash)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let original = directory.appendingPathComponent("generated.mov")
        try await video(at: original)
        try Data("partial".utf8).write(to: directory.appendingPathComponent("unfinished.pending.mov"))
        let a = PrivatePracticeRecorder(accountID: "account-a", storageRoot: root)
        let b = PrivatePracticeRecorder(accountID: "account-b", storageRoot: root)
        precondition(a.clips.count == 1 && b.clips.isEmpty, "Account isolation and pending exclusion")
        precondition(!a.cameraReady && !a.recording, "Never enables or records automatically")
        a.startRecording(); precondition(!a.recording, "Rejects recording without camera")
        await a.saveLastTenSeconds(of: a.clips[0])
        precondition(a.clips.count == 2 && !a.saving, "Trim is a separate persisted clip")
        let trimmed = a.clips.first { $0.url.lastPathComponent != "generated.mov" }!
        let asset = AVURLAsset(url: trimmed.url)
        let duration = try await asset.load(.duration).seconds
        let audio = try await asset.loadTracks(withMediaType: .audio)
        precondition(duration > 9.8 && duration <= 10.1 && audio.isEmpty, "Real silent ten-second replay")
        precondition(FileManager.default.fileExists(atPath: original.path), "Original preserved")
        let reopened = PrivatePracticeRecorder(accountID: "account-a", storageRoot: root)
        precondition(reopened.clips.count == 2, "Library survives reopening")
        a.delete(trimmed); precondition(a.clips.count == 1, "Deletion refreshes library")
        let corrupt = directory.appendingPathComponent("corrupt.mov")
        try Data("not a movie".utf8).write(to: corrupt)
        let broken = PrivatePracticeRecorder(accountID: "account-a", storageRoot: root)
        await broken.saveLastTenSeconds(of: broken.clips.first { $0.url.lastPathComponent == "corrupt.mov" }!)
        precondition(!broken.saving && broken.message?.contains("Could not save") == true, "Invalid clip yields recoverable error")
        let occupied = directory.appendingPathComponent("occupied.pending.mov")
        FileManager.default.createFile(atPath: occupied.path, contents: Data())
        let handle = try FileHandle(forWritingTo: occupied); try handle.truncate(atOffset: 1_000_000_000); try handle.close()
        await a.saveLastTenSeconds(of: a.clips[0])
        precondition(!a.saving && a.clips.count == 1 && a.message?.contains("Could not save") == true, "Pending files count toward disk cap")
        let external = root.appendingPathComponent("livekit-like.mp4")
        try await video(at: external, fileType: .mp4)
        await b.importClip(from: external)
        precondition(b.clips.count == 1 && FileManager.default.fileExists(atPath: original.path), "Explicit import persists copy without deleting source")
        let importedDuration = try await AVURLAsset(url: b.clips[0].url).load(.duration).seconds
        precondition(importedDuration > 14 && importedDuration <= 15, "Imported replay retains its full duration")
        await b.importClip(from: URL(string: "https://example.com/video.mov")!)
        precondition(b.clips.count == 1 && b.message?.contains("on-device") == true, "Remote imports rejected")
        print("PrivatePractice: 13 checks passed, synthetic silent trim duration \(duration)s")
    }
    static func video(at url: URL, fileType: AVFileType = .mov) async throws {
        let writer = try AVAssetWriter(outputURL: url, fileType: fileType)
        let input = AVAssetWriterInput(mediaType: .video, outputSettings: [AVVideoCodecKey: AVVideoCodecType.h264, AVVideoWidthKey: 320, AVVideoHeightKey: 180])
        let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: [kCVPixelBufferPixelFormatTypeKey as String:kCVPixelFormatType_32ARGB,kCVPixelBufferWidthKey as String:320,kCVPixelBufferHeightKey as String:180])
        writer.add(input); precondition(writer.startWriting()); writer.startSession(atSourceTime: .zero)
        for frame in 0..<90 {
            while !input.isReadyForMoreMediaData { try await Task.sleep(for: .milliseconds(5)) }
            var pixel: CVPixelBuffer?; precondition(CVPixelBufferPoolCreatePixelBuffer(nil, adaptor.pixelBufferPool!, &pixel) == kCVReturnSuccess)
            CVPixelBufferLockBaseAddress(pixel!, []); memset(CVPixelBufferGetBaseAddress(pixel!), Int32(frame * 2), CVPixelBufferGetDataSize(pixel!)); CVPixelBufferUnlockBaseAddress(pixel!, [])
            precondition(adaptor.append(pixel!, withPresentationTime: CMTime(value: Int64(frame), timescale: 6)))
        }
        input.markAsFinished(); await writer.finishWriting(); precondition(writer.status == .completed)
    }
}
