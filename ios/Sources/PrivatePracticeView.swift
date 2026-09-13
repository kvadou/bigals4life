import AVFoundation
import SwiftUI

struct PrivatePracticeView: View {
    @StateObject private var recorder: PrivatePracticeRecorder
    init(accountID: String) { _recorder = StateObject(wrappedValue: PrivatePracticeRecorder(accountID: accountID)) }
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    Text("Your practice. Your replay.").font(.title2.bold())
                    Text("Private practice stays on this device. Record a session, replay it slowly, or compare two saved clips. No microphone.")
                        .foregroundStyle(BA4LTheme.secondary)
                    ZStack {
                        Color("BrandForest")
                        if recorder.cameraReady { PrivatePracticePreview(capture: recorder.capture) }
                        else { Label("Camera is off", systemImage: "video.slash").font(.headline).foregroundStyle(Color("OnBrandGreen")) }
                    }.aspectRatio(3 / 4, contentMode: .fit).frame(maxHeight: 460).clipShape(RoundedRectangle(cornerRadius: 16))
                        .accessibilityLabel(recorder.cameraReady ? "Private camera preview" : "Camera is off")
                    if recorder.recording {
                        Label("Recording. Stops automatically after 10 minutes.", systemImage: "record.circle").foregroundStyle(.red)
                        Button("Stop and save clip", systemImage: "stop.fill") { recorder.stopRecording() }
                            .buttonStyle(.borderedProminent).foregroundStyle(BA4LTheme.onTint).frame(minHeight: 44)
                    } else if recorder.cameraReady {
                        Button("Start recording", systemImage: "record.circle") { recorder.startRecording() }
                            .buttonStyle(.borderedProminent).foregroundStyle(BA4LTheme.onTint).disabled(recorder.saving).frame(minHeight: 44)
                        Button("Turn camera off", systemImage: "video.slash") { recorder.stopCamera() }.frame(minHeight: 44)
                    } else {
                        Button(recorder.preparing ? "Preparing camera…" : "Enable camera", systemImage: "video") { Task { await recorder.enableCamera() } }
                            .buttonStyle(.borderedProminent).foregroundStyle(BA4LTheme.onTint).disabled(recorder.preparing || recorder.saving).frame(minHeight: 44)
                    }
                    if recorder.saving { ProgressView("Saving clip…") }
                    if let message = recorder.message { Text(message).font(.callout).accessibilityLabel(message) }
                    Divider()
                    if let latest = recorder.clips.first {
                        NavigationLink { PrivatePracticePlayback(clips: [latest]) } label: {
                            Label("Replay latest recording", systemImage: "gobackward").frame(minHeight: 44)
                        }.disabled(recorder.recording || recorder.saving)
                    }
                    if let latest = recorder.clips.first {
                        Button("Save last 10 seconds", systemImage: "scissors") { Task { await recorder.saveLastTenSeconds(of: latest) } }
                            .disabled(recorder.recording || recorder.saving).frame(minHeight: 44)
                        Text("Creates a short replay from your latest stopped recording. It does not detect when a shot happened.").font(.caption).foregroundStyle(BA4LTheme.secondary)
                    }
                    NavigationLink { PrivatePracticeLibrary(recorder: recorder) } label: {
                        Label("Saved clips (\(recorder.clips.count))", systemImage: "rectangle.stack").frame(minHeight: 44)
                    }.disabled(recorder.recording || recorder.saving)
                    Text("Up to 30 clips, 1 GB total. Export clips you want to keep elsewhere. Deleting the app removes its saved practice videos.")
                        .font(.caption).foregroundStyle(BA4LTheme.secondary)
                }.padding().frame(maxWidth: 720)
            }.frame(maxWidth: .infinity).background(Color("BrandIvory"))
                .navigationTitle("Private practice").navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Close") { recorder.stopCamera(); dismiss() }.frame(minHeight: 44) } }
                .onChange(of: scenePhase) { _, phase in if phase == .background || (phase == .inactive && recorder.cameraReady) { recorder.stopCamera() } }
                .onDisappear { recorder.stopCamera() }
        }.tint(BA4LTheme.tint)
    }
}
private struct PrivatePracticePreview: UIViewRepresentable {
    let capture: PrivatePracticeCapture
    class Surface: UIView {
        override class var layerClass: AnyClass { AVCaptureVideoPreviewLayer.self }
        var preview: AVCaptureVideoPreviewLayer { layer as! AVCaptureVideoPreviewLayer }
        var onRotation: ((CGFloat) -> Void)?
        override func layoutSubviews() {
            super.layoutSubviews()
            let angle: CGFloat
            switch window?.windowScene?.interfaceOrientation {
            case .landscapeLeft: angle = 180
            case .landscapeRight: angle = 0
            case .portraitUpsideDown: angle = 270
            default: angle = 90
            }
            if let connection = preview.connection, connection.isVideoRotationAngleSupported(angle) { connection.videoRotationAngle = angle }
            onRotation?(angle)
        }
    }
    func makeUIView(context: Context) -> Surface {
        let view = Surface(); view.preview.session = capture.session; view.onRotation = { capture.setRotation($0) }; view.preview.videoGravity = .resizeAspect
        return view
    }
    func updateUIView(_ view: Surface, context: Context) {}
}
