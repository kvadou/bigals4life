# BA4L Icon Composer build plan

## Outcome

Create one native multilayer `BA4L.icon` document for iOS, iPadOS, macOS, watchOS, and the App Store. The mark uses the approved stacked lockup: `BA` on the first row and `4L` on the second row, with generous tracking and a dark forest field.

The existing generated `AppIcon.appiconset` remains the compatibility fallback until the Icon Composer document is opened in Xcode and the app target is switched to it.

## Source layers

The checked-in source is in [`ios/Resources/IconComposer/BA4L-C`](../../ios/Resources/IconComposer/BA4L-C):

1. `01-background.svg` and `.png`: full-bleed deep forest background.
2. `02-panel.svg` and `.png`: subtle translucent panel and edge treatment.
3. `03-BA.svg` and `.png`: the upper `BA` vector paths.
4. `04-4L.svg` and `.png`: the lower `4L` vector paths.

The SVG files are the design source of truth. The PNG copies are supplied for the current Icon Composer file picker, which accepts raster image layers reliably on this machine.

## Icon Composer assembly

1. Open Xcode, then choose **Open Developer Tool > Icon Composer**.
2. Create a new icon document and save it as `ios/Resources/BA4L.icon`.
3. Keep one group named `BA4L` and add the four layers in this order, from back to front: background, panel, `BA`, `4L`.
4. Import each PNG as an image layer. Keep every layer at the full square canvas, with x and y at `0` and scale at `100%`.
5. Leave the system mask and Liquid Glass effects enabled. Do not add a second rounded rectangle or crop the artwork to a device-specific shape.
6. Set the document name to `BA4L` and verify that the composition reads at 60 pt and at the 1024 px App Store preview size.
7. Preview these combinations before saving:
   - iOS, Default
   - iOS, Dark
   - iOS, Tinted Dark
   - iPadOS, Default
   - macOS, Default
   - watchOS, Default
8. Export one 1024 px preview for each appearance and inspect the mark at 20%, 50%, and 100% zoom. The stacked letters must remain distinct, and no layer may clip at the system mask.

## Xcode handoff

After the `.icon` file is saved:

1. Add `ios/Resources/BA4L.icon` to the Xcode project resources.
2. In the app target General settings, set **App Icons** to `BA4L`.
3. Keep `ASSETCATALOG_COMPILER_APPICON_NAME = AppIcon` in the project until the new document is verified in a simulator build. This preserves the current generated fallback for older Xcode tooling and CI.
4. Once the Icon Composer build is verified on the current Xcode toolchain, update the target setting and remove the fallback only in a separate, reviewable commit.
5. Do not change the bundle identifier or display name as part of the icon migration.

## Verification gate

Run these checks from the repository root:

```bash
bun ios/Tests/run.ts
xcodebuild -project ios/BA4L.xcodeproj -scheme BA4L -sdk iphonesimulator -configuration Debug -derivedDataPath /tmp/BA4L-icon-composer-build build CODE_SIGNING_ALLOWED=NO
```

Install the resulting app on one iPhone simulator and one iPad simulator. Confirm:

- the icon is the stacked BA4L mark on the Home Screen;
- Light, Dark, and Tinted appearances all render without a clipped edge;
- the launch screen and sign-in flow are unchanged;
- the existing `AppIcon.appiconset` fallback still builds if the `.icon` document is removed.

Only after those checks pass should the Icon Composer document replace the fallback in the TestFlight archive.

## Apple reference

The workflow follows [Apple's Icon Composer documentation](https://developer.apple.com/documentation/Xcode/creating-your-app-icon-using-icon-composer).
