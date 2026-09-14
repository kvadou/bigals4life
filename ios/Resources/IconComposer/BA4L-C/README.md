# BA4L Icon Composer source

The repeatable assembly and verification steps live in [`docs/plans/2026-09-14-ba4l-icon-composer-build-plan.md`](../../../../docs/plans/2026-09-14-ba4l-icon-composer-build-plan.md).

This is the approved C direction: a spacious stacked `BA` over `4L` lockup. Each SVG is a separate 1024 by 1024 layer, numbered in back to front order.

1. Open Xcode, then choose **Open Developer Tool > Icon Composer**.
2. Create a new iOS and iPadOS icon and import the four SVG layers in numeric order.
3. Keep the full canvas square. Let Icon Composer provide the system mask, material, translucency, specular highlight, blur, shadow, and light, dark, and tinted variants.
4. If Icon Composer asks for editable text, the supplied letterforms are already vector paths. Do not add a second canvas mask or rounded-corner crop.
5. Preview the icon on iPhone and iPad in light, dark, and tinted appearances before exporting the single multilayer icon file.

The checked-in legacy AppIcon asset remains generated from `web/public/ba4l-mark.svg` so the current Xcode build and TestFlight pipeline stay compatible while the `.icon` file is assembled in Icon Composer.
