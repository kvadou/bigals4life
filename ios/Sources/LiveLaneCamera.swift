import AVFoundation
import SwiftUI
import Vision

/// Local capture only. No video is uploaded and no inferred observation writes scores.
@MainActor final class LiveLaneCamera: ObservableObject {
    enum State: Equatable { case ready, starting, watching, paused, unavailable(String) }
    @Published private(set) var state: State = .ready
    @Published private(set) var peopleVisible = 0
    @Published private(set) var lastObservation: Date?
    @Published private(set) var observationError: String?
    let capture = LiveLaneCapture()
    private var generation = 0
    private var idleTimerWasDisabled = false

    init() {
        capture.onObservation = { [weak self] count, date, error in
            Task { @MainActor in
                guard let self, self.state == .watching else { return }
                self.peopleVisible = count; self.lastObservation = date; self.observationError = error
            }
        }
        capture.onInterrupted = { [weak self] in
            Task { @MainActor in self?.pause() }
        }
    }
    func start() async {
        guard state != .starting && state != .watching else { return }
        generation += 1
        let attempt = generation
        state = .starting
        let authorized = AVCaptureDevice.authorizationStatus(for: .video) == .authorized
            ? true : await AVCaptureDevice.requestAccess(for: .video)
        guard attempt == generation else { return }
        guard authorized else {
            state = .unavailable("Allow Camera in Settings to use Live Lane."); return
        }
        let error = await capture.start()
        guard attempt == generation else { return }
        if let error { state = .unavailable(error); return }
        idleTimerWasDisabled = UIApplication.shared.isIdleTimerDisabled
        UIApplication.shared.isIdleTimerDisabled = true
        state = .watching
    }
    func pause() {
        generation += 1
        if state == .watching { UIApplication.shared.isIdleTimerDisabled = idleTimerWasDisabled }
        capture.stop()
        state = .paused; lastObservation = nil; peopleVisible = 0; observationError = nil
    }
    func stop() { pause(); state = .ready }
}

/// Capture configuration and frame analysis stay off the main thread on one serial queue.
final class LiveLaneCapture: NSObject, AVCaptureVideoDataOutputSampleBufferDelegate, @unchecked Sendable {
    let session = AVCaptureSession()
    var onObservation: ((Int, Date, String?) -> Void)?
    var onInterrupted: (() -> Void)?
    private let queue = DispatchQueue(label: "com.ba4l.live-lane", qos: .userInitiated)
    private var configured = false
    private var lastAnalysis = -Double.infinity
    private var orientation: CGImagePropertyOrientation = .right
    private var observers: [NSObjectProtocol] = []

    override init() {
        super.init()
        for name in [AVCaptureSession.wasInterruptedNotification, AVCaptureSession.runtimeErrorNotification] {
            observers.append(NotificationCenter.default.addObserver(forName: name, object: session, queue: nil) { [weak self] _ in
                self?.stop(); self?.onInterrupted?()
            })
        }
    }
    deinit { observers.forEach(NotificationCenter.default.removeObserver) }
    func setOrientation(_ value: CGImagePropertyOrientation) { queue.async { self.orientation = value } }
    func start() async -> String? {
        await withCheckedContinuation { continuation in
            queue.async {
                do {
                    if !self.configured { try self.configure() }
                    self.lastAnalysis = -Double.infinity
                    self.session.startRunning()
                    continuation.resume(returning: self.session.isRunning ? nil : "Camera interrupted. Resume when the camera is available.")
                } catch { continuation.resume(returning: error.localizedDescription) }
            }
        }
    }
    func stop() { queue.async { if self.session.isRunning { self.session.stopRunning() } } }
    func waitUntilStopped() async {
        await withCheckedContinuation { continuation in queue.async { continuation.resume() } }
    }
    private func configure() throws {
        guard let camera = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back) else {
            throw NSError(domain: "LiveLane", code: 1, userInfo: [NSLocalizedDescriptionKey: "A rear camera is required. Use an iPhone or iPad to watch the lane."])
        }
        let input = try AVCaptureDeviceInput(device: camera)
        let output = AVCaptureVideoDataOutput()
        output.alwaysDiscardsLateVideoFrames = true
        output.setSampleBufferDelegate(self, queue: queue)
        session.beginConfiguration()
        defer { session.commitConfiguration() }
        session.sessionPreset = .hd1280x720
        guard session.canAddInput(input) else { throw NSError(domain: "LiveLane", code: 2, userInfo: [NSLocalizedDescriptionKey: "Camera input is unavailable."]) }
        session.addInput(input)
        guard session.canAddOutput(output) else {
            session.removeInput(input)
            throw NSError(domain: "LiveLane", code: 3, userInfo: [NSLocalizedDescriptionKey: "Camera frames are unavailable."])
        }
        session.addOutput(output)
        configured = true
    }
    func captureOutput(_ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer, from connection: AVCaptureConnection) {
        let time = CMSampleBufferGetPresentationTimeStamp(sampleBuffer).seconds
        guard time - lastAnalysis >= 0.5, let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
        lastAnalysis = time
        let request = VNDetectHumanRectanglesRequest()
        request.upperBodyOnly = false
        do {
            try VNImageRequestHandler(cvPixelBuffer: pixelBuffer, orientation: orientation).perform([request])
            let count = (request.results ?? []).filter { $0.confidence >= 0.6 }.count
            onObservation?(count, Date(), nil)
        } catch {
            onObservation?(0, Date(), "Scene analysis paused. The camera preview is still available.")
        }
    }
}

struct LiveLanePreview: UIViewRepresentable {
    let capture: LiveLaneCapture
    func makeUIView(context: Context) -> Preview {
        let view = Preview(); view.capture = capture
        view.preview.session = capture.session; view.preview.videoGravity = .resizeAspect
        return view
    }
    func updateUIView(_ uiView: Preview, context: Context) {}
    final class Preview: UIView {
        weak var capture: LiveLaneCapture?
        override class var layerClass: AnyClass { AVCaptureVideoPreviewLayer.self }
        var preview: AVCaptureVideoPreviewLayer { layer as! AVCaptureVideoPreviewLayer }
        override func layoutSubviews() {
            super.layoutSubviews()
            let orientation = window?.windowScene?.interfaceOrientation ?? .portrait
            let angle: CGFloat
            let imageOrientation: CGImagePropertyOrientation
            switch orientation {
            case .landscapeLeft: angle = 0; imageOrientation = .up
            case .landscapeRight: angle = 180; imageOrientation = .down
            case .portraitUpsideDown: angle = 270; imageOrientation = .left
            default: angle = 90; imageOrientation = .right
            }
            if let connection = preview.connection, connection.isVideoRotationAngleSupported(angle) { connection.videoRotationAngle = angle }
            capture?.setOrientation(imageOrientation)
        }
    }
}
