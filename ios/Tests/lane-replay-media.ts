import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const directory = await mkdtemp(join(tmpdir(), "ba4l-replay-media-"));
try {
 const source = `import AVFoundation
import CoreVideo
import Foundation
final class Results: @unchecked Sendable {
 let lock = NSLock()
 var values: [LaneReplayWriter.Clip] = []
 var errors: [String] = []
 func add(_ clip: LaneReplayWriter.Clip) { lock.withLock { values.append(clip) } }
 func fail(_ error: String) { lock.withLock { errors.append(error) } }
 func snapshot() -> ([LaneReplayWriter.Clip], [String]) { lock.withLock { (values, errors) } }
}
@main struct Verify {
 static func main() async throws {
  let root = FileManager.default.temporaryDirectory.appendingPathComponent("replay-media-" + UUID().uuidString)
  let ring = root.appendingPathComponent("ring")
  defer { try? FileManager.default.removeItem(at: root) }
  let results = Results()
  let writer = LaneReplayWriter(directory: ring, source: "Synthetic camera", segmentSeconds: 1)
  writer.onClip = { results.add($0) }; writer.onError = { results.fail($0) }
  var buffer: CVPixelBuffer?
  precondition(CVPixelBufferCreate(nil, 160, 90, kCVPixelFormatType_32BGRA, [kCVPixelBufferIOSurfacePropertiesKey: [:]] as CFDictionary, &buffer) == kCVReturnSuccess)
  let pixel = buffer!
  for frame in 0..<100 {
   CVPixelBufferLockBaseAddress(pixel, [])
   let bytes = CVPixelBufferGetBaseAddress(pixel)!.assumingMemoryBound(to: UInt8.self)
   let count = CVPixelBufferGetBytesPerRow(pixel) * CVPixelBufferGetHeight(pixel)
   for offset in stride(from: 0, to: count, by: 4) { bytes[offset] = UInt8(frame * 2); bytes[offset+1] = 100; bytes[offset+2] = 220; bytes[offset+3] = 255 }
   CVPixelBufferUnlockBaseAddress(pixel, [])
   writer.append(pixel, timestampNs: Int64(frame) * 100_000_000, rotation: 90)
   await writer.drain()
   try await Task.sleep(for: .milliseconds(15))
  }
  writer.finishSegment()
  for _ in 0..<50 { if results.snapshot().0.count >= 5 { break }; try await Task.sleep(for: .milliseconds(20)) }
  let (clips, errors) = results.snapshot()
  precondition(errors.isEmpty, "Writer errors")
  precondition(clips.count >= 5, "Segments must roll automatically")
  let files = try FileManager.default.contentsOfDirectory(at: ring, includingPropertiesForKeys: nil).filter { $0.pathExtension == "mp4" }
  precondition(files.count <= 3, "Disk ring is bounded")
  let clip = clips.last!
  let asset = AVURLAsset(url: clip.url)
  let duration = try await asset.load(.duration).seconds
  precondition(duration > 0.1 && duration <= 1.2)
  let video = try await asset.loadTracks(withMediaType: .video)
  let audio = try await asset.loadTracks(withMediaType: .audio)
  precondition(video.count == 1 && audio.isEmpty, "Silent video only")
  let size = try await video[0].load(.naturalSize)
  precondition(size.width == 90 && size.height == 160, "Rotation must be encoded")
  let generator = AVAssetImageGenerator(asset: asset)
  generator.appliesPreferredTrackTransform = true
  let decoded = try await generator.image(at: CMTime(seconds: min(duration / 2, 0.2), preferredTimescale: 600))
  precondition(decoded.image.width == 90 && decoded.image.height == 160, "Real encoded frame decodes")
  writer.stop(); await writer.drain()
  try await Task.sleep(for: .milliseconds(100))
  precondition(!FileManager.default.fileExists(atPath: ring.path), "Stop removes local ring")
  print("Replay media: rotating H264 segments decode, correct dimensions, no audio, 3-file bound, stop cleanup passed")
 }
}
`;
 const file = join(directory, "Verify.swift"), binary = join(directory, "verify");
 await writeFile(file, source);
 const compile = Bun.spawn(["xcrun", "swiftc", "-parse-as-library", "ios/Sources/LaneReplayWriter.swift", file, "-o", binary], { stdout: "inherit", stderr: "inherit" });
 if (await compile.exited) throw new Error("Replay media compilation failed");
 const run = Bun.spawn([binary], { stdout: "inherit", stderr: "inherit" });
 if (await run.exited) throw new Error("Replay media verification failed");
} finally { await rm(directory, { recursive: true, force: true }); }
