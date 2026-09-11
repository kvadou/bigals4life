import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
const require = createRequire(resolve(import.meta.dir, "../../web/package.json"));
const sharp = require("sharp");
const catalog = resolve(import.meta.dir, "../Resources/Assets.xcassets");
const directory = resolve(catalog, "AppIcon.appiconset");
mkdirSync(directory, { recursive: true });
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
<rect width="1024" height="1024" fill="#203B2F"/>
<circle cx="512" cy="405" r="258" fill="#D5E5A8"/>
<circle cx="512" cy="405" r="220" fill="none" stroke="#203B2F" stroke-width="10"/>
<circle cx="470" cy="330" r="34" fill="#203B2F"/>
<circle cx="565" cy="330" r="34" fill="#203B2F"/>
<circle cx="520" cy="425" r="39" fill="#203B2F"/>
<text x="512" y="853" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-weight="900" font-size="204" letter-spacing="-10" fill="#F6F6EE">BA4L</text>
</svg>`;
writeFileSync(resolve(import.meta.dir, "../Resources/AppIcon.svg"), svg);
await sharp(Buffer.from(svg)).removeAlpha().png().toFile(resolve(directory, "AppIcon.png"));
writeFileSync(resolve(directory, "Contents.json"), JSON.stringify({ images:[{filename:"AppIcon.png",idiom:"universal",platform:"ios",size:"1024x1024"}],info:{author:"xcode",version:1} },null,2)+"\n");
writeFileSync(resolve(catalog, "Contents.json"), JSON.stringify({info:{author:"xcode",version:1}},null,2)+"\n");
console.log("Generated BA4L app icon (1024 x 1024, opaque).");
