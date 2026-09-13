import AVFoundation
import CoreImage
import Foundation

/// Bounded disk ring. One queued frame, one active writer, at most one finalizer.
/// No microphone, network, Photos library or unbounded raw-frame buffer.
final class LaneReplayWriter: @unchecked Sendable {
    struct Clip: Identifiable, Sendable {
        let id: UUID
        let url: URL
        let capturedAt: Date
        let seconds: Double
        let source: String
    }
    var onClip: (@Sendable (Clip) -> Void)?
    var onError: (@Sendable (String) -> Void)?
    private let queue = DispatchQueue(label: "BA4L.replay.writer", qos: .utility)
    private let frameSlot = DispatchSemaphore(value: 1)
    private let context = CIContext(options: [.cacheIntermediates: false])
    private let directory: URL
    private let source: String
    private let segmentSeconds: Double
    private var generation = 0
    private var stopped = false
    private var writer: AVAssetWriter?
    private var input: AVAssetWriterInput?
    private var adaptor: AVAssetWriterInputPixelBufferAdaptor?
    private var finalizing: AVAssetWriter?
    private var firstTimestamp: Int64 = 0
    private var lastTimestamp: Int64 = 0
    private var capturedAt = Date()
    private var dimensions = CGSize.zero
    private var frames = 0
    private var clips: [Clip] = []

    init(directory: URL, source: String, segmentSeconds: Double = 10) {
        self.directory = directory; self.source = source; self.segmentSeconds = segmentSeconds
    }
    func append(_ pixelBuffer: CVPixelBuffer, timestampNs: Int64, rotation: Int = 0) {
        guard frameSlot.wait(timeout: .now()) == .success else { return }
        queue.async { [self] in
            defer { frameSlot.signal() }
            guard !stopped, finalizing == nil else { return }
            do { try process(pixelBuffer, timestampNs: timestampNs, rotation: rotation) }
            catch { fail() }
        }
    }
    private func process(_ pixelBuffer: CVPixelBuffer, timestampNs: Int64, rotation: Int) throws {
        if writer != nil {
            guard timestampNs > lastTimestamp else { return }
            if timestampNs - lastTimestamp > 2_000_000_000 { finish(); return }
            if timestampNs - lastTimestamp < 66_666_666 { return }
            if Double(timestampNs - firstTimestamp) / 1e9 >= segmentSeconds { finish(); return }
        }
        var image = CIImage(cvPixelBuffer: pixelBuffer)
        switch rotation {
        case 90: image = image.oriented(.right)
        case 180: image = image.oriented(.down)
        case 270: image = image.oriented(.left)
        default: break
        }
        if writer == nil {
            while clips.count >= 3 { try? FileManager.default.removeItem(at: clips.removeFirst().url) }
            let scale = min(1, 720 / max(image.extent.width, image.extent.height))
            dimensions = CGSize(width: max(2, floor(image.extent.width * scale / 2) * 2), height: max(2, floor(image.extent.height * scale / 2) * 2))
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            let url = directory.appendingPathComponent(UUID().uuidString + ".mp4")
            let next = try AVAssetWriter(outputURL: url, fileType: .mp4)
            let nextInput = AVAssetWriterInput(mediaType: .video, outputSettings: [AVVideoCodecKey: AVVideoCodecType.h264, AVVideoWidthKey: Int(dimensions.width), AVVideoHeightKey: Int(dimensions.height), AVVideoCompressionPropertiesKey: [AVVideoAverageBitRateKey: 1_500_000, AVVideoExpectedSourceFrameRateKey: 15]])
            nextInput.expectsMediaDataInRealTime = true
            guard next.canAdd(nextInput) else { throw ReplayError.encoding }
            next.add(nextInput)
            let nextAdaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: nextInput, sourcePixelBufferAttributes: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA, kCVPixelBufferWidthKey as String: Int(dimensions.width), kCVPixelBufferHeightKey as String: Int(dimensions.height), kCVPixelBufferIOSurfacePropertiesKey as String: [:]])
            guard next.startWriting() else { throw ReplayError.encoding }
            next.startSession(atSourceTime: .zero)
            writer = next; input = nextInput; adaptor = nextAdaptor
            firstTimestamp = timestampNs; lastTimestamp = timestampNs - 1; frames = 0; capturedAt = Date()
        }
        guard let input, let adaptor, input.isReadyForMoreMediaData, let pool = adaptor.pixelBufferPool else { return }
        var output: CVPixelBuffer?
        guard CVPixelBufferPoolCreatePixelBuffer(nil, pool, &output) == kCVReturnSuccess, let output else { return }
        let scale = min(dimensions.width / image.extent.width, dimensions.height / image.extent.height)
        image = image.transformed(by: CGAffineTransform(translationX: -image.extent.minX, y: -image.extent.minY)).transformed(by: CGAffineTransform(scaleX: scale, y: scale))
        image = image.transformed(by: CGAffineTransform(translationX: (dimensions.width - image.extent.width) / 2, y: (dimensions.height - image.extent.height) / 2))
        let canvas = CGRect(origin: .zero, size: dimensions)
        context.render(image.composited(over: CIImage(color: .black).cropped(to: canvas)), to: output, bounds: canvas, colorSpace: CGColorSpaceCreateDeviceRGB())
        guard adaptor.append(output, withPresentationTime: CMTime(value: timestampNs - firstTimestamp, timescale: 1_000_000_000)) else { throw ReplayError.encoding }
        lastTimestamp = timestampNs; frames += 1
    }
    func finishSegment() { queue.async { self.finish() } }
    private func finish() {
        guard let current = writer, let input else { return }
        let seconds = Double(lastTimestamp - firstTimestamp) / 1e9
        self.writer = nil; self.input = nil; adaptor = nil
        guard frames >= 2, seconds >= 0.1 else { current.cancelWriting(); try? FileManager.default.removeItem(at: current.outputURL); return }
        input.markAsFinished()
        current.endSession(atSourceTime: CMTime(seconds: seconds + 1.0 / 15, preferredTimescale: 600))
        finalizing = current
        let attempt = generation
        let clip = Clip(id: UUID(), url: current.outputURL, capturedAt: capturedAt, seconds: seconds, source: source)
        current.finishWriting { [weak self] in
            guard let self else { try? FileManager.default.removeItem(at: current.outputURL); return }
            self.queue.async {
                self.finalizing = nil
                guard self.generation == attempt, !self.stopped, current.status == .completed else { try? FileManager.default.removeItem(at: current.outputURL); return }
                self.clips.append(clip)
                while self.clips.count > 3 { try? FileManager.default.removeItem(at: self.clips.removeFirst().url) }
                self.onClip?(clip)
            }
        }
    }
    func stop() {
        queue.async {
            self.stopped = true; self.generation += 1
            self.writer?.cancelWriting(); self.finalizing?.cancelWriting()
            self.writer = nil; self.input = nil; self.adaptor = nil; self.clips = []
            try? FileManager.default.removeItem(at: self.directory)
        }
    }
    /// Serial barrier for deterministic media tests and teardown.
    func drain() async { await withCheckedContinuation { continuation in queue.async { continuation.resume() } } }
    private func fail() {
        writer?.cancelWriting(); writer = nil; input = nil; adaptor = nil
        stopped = true
        try? FileManager.default.removeItem(at: directory)
        onError?("Local replay could not be recorded. Check available storage and enable replays again.")
    }
    private enum ReplayError: Error { case encoding }
}
