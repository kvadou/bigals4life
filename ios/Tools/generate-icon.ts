import { createRequire } from "node:module";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
const require = createRequire(resolve(import.meta.dir, "../../web/package.json"));
const sharp = require("sharp");
const catalog = resolve(import.meta.dir, "../Resources/Assets.xcassets");
const directory = resolve(catalog, "AppIcon.appiconset");
mkdirSync(directory, { recursive: true });
const mark = readFileSync(resolve(import.meta.dir, "../../web/public/ba4l-icon.svg"), "utf8");
const svg = mark;
writeFileSync(resolve(import.meta.dir, "../Resources/AppIcon.svg"), svg);
await sharp(Buffer.from(svg)).resize(1024, 1024).removeAlpha().png().toFile(resolve(directory, "AppIcon.png"));
writeFileSync(resolve(directory, "Contents.json"), JSON.stringify({ images:[{filename:"AppIcon.png",idiom:"universal",platform:"ios",size:"1024x1024"}],info:{author:"xcode",version:1} },null,2)+"\n");
writeFileSync(resolve(catalog, "Contents.json"), JSON.stringify({info:{author:"xcode",version:1}},null,2)+"\n");
console.log("Generated BA4L app icon and in-app mark from the web lockup (1024 x 1024, opaque).");

const markDirectory = resolve(catalog, "BA4LMark.imageset");
mkdirSync(markDirectory, {recursive:true});
await sharp(Buffer.from(mark)).resize(512,512).png().toFile(resolve(markDirectory,"mark.png"));
writeFileSync(resolve(markDirectory,"Contents.json"),JSON.stringify({images:[{filename:"mark.png",idiom:"universal"}],info:{author:"xcode",version:1}},null,2)+"\n");

await sharp(Buffer.from(svg)).resize(180,180).png().toFile(resolve(import.meta.dir,"../../web/public/apple-touch-icon.png"));
