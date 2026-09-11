# Strike Ceiling

Native SwiftUI iOS 17+ bowling companion. Enter pins after each roll to see the maximum possible final score, assuming all remaining pins are knocked down. Includes multiple bowlers, automatic local saving, undo, legal-roll validation, and tenth-frame bonus handling.

Manual entry is implemented. Photo recognition and league series history are not implemented.

Open `StrikeCeiling.xcodeproj` in Xcode. For a physical phone, select your signing team and enable code signing in the target build settings. No Apple signing identity is included.

Regenerate the project with `xcodegen generate`. Test the score engine with `swiftc Sources/BowlingGame.swift Tests/main.swift -o /tmp/strike-ceiling-tests` then `/tmp/strike-ceiling-tests`.
