import {readFileSync,readdirSync} from "node:fs";
import {resolve} from "node:path";
import assert from "node:assert/strict";

const assets=resolve(import.meta.dir,"../Resources/Assets.xcassets");
type AssetColor={appearances?:{appearance:string;value:string}[];color:{components:Record<string,string>}};
function color(name:string,dark:boolean,high:boolean){
 const entries=(JSON.parse(readFileSync(resolve(assets,`${name}.colorset/Contents.json`),"utf8")) as {colors:AssetColor[]}).colors;
 const applicable=entries.filter(entry=>(entry.appearances??[]).every(a=>a.appearance==="luminosity"?a.value===(dark?"dark":"light"):a.appearance==="contrast"?a.value===(high?"high":"normal"):false));
 const selected=applicable.sort((a,b)=>(b.appearances?.length??0)-(a.appearances?.length??0))[0];
 assert(selected,`${name} has no matching appearance`);
 assert.equal(Number(selected.color.components.alpha),1,`${name} must be opaque for this contrast calculation`);
 return ["red","green","blue"].map(channel=>Number(selected.color.components[channel]));
}
function luminance(rgb:number[]){return rgb.reduce((sum,value,i)=>sum+[.2126,.7152,.0722][i]*(value<=.04045?value/12.92:((value+.055)/1.055)**2.4),0);}
const pairs=[
 ["OnGoldSurface","BrandGoldSurface"],
 ["OnForest","BrandForest"],
 ["OnForest","HomeBackground"],
 ["BrandGold","HomeBackground"],
 ["BrandGreen","BrandIvory"],
 ["SecondaryText","BrandIvory"],
 ["OnBrandGreen","BrandGreen"],
];
let checked=0;
for(const dark of [false,true])for(const high of [false,true])for(const [foreground,background] of pairs){
 const [low,bright]=[luminance(color(foreground,dark,high)),luminance(color(background,dark,high))].sort((a,b)=>a-b);
 const ratio=(bright+.05)/(low+.05);
 assert(ratio>=4.5,`${foreground}/${background} ${dark?"dark":"light"} ${high?"high":"normal"}: ${ratio.toFixed(2)}:1, needs4.5:1`);
 checked++;
}
console.log(`Native theme: ${checked} normal/high-contrast light/dark text pairs passed`);

// SwiftUI does not choose contrasting text for an arbitrary custom tint.
// Require the explicit paired foreground on each prominent button modifier chain.
const sources=resolve(import.meta.dir,"../Sources");
let buttons=0;
for(const name of readdirSync(sources).filter(name=>name.endsWith(".swift"))){
 const source=readFileSync(resolve(sources,name),"utf8");
 for(const match of source.matchAll(/\.buttonStyle\(\.borderedProminent\)/g)){
  const chain=source.slice(match.index!+match[0].length,match.index!+match[0].length+500).split(".buttonStyle(")[0].split(/\n\s*}/)[0];
  assert(/\.foregroundStyle\([^\n]*(?:BA4LTheme\.onTint|Color\("OnBrandGreen"\))/.test(chain),`${name} prominent button at offset${match.index} needs explicit paired foreground after buttonStyle`);
  buttons++;
 }
}
console.log(`Native theme: ${buttons} prominent buttons explicitly pair their foreground`);

// Secondary copy also appears on native List/Form surfaces, not only branded cards.
let secondaryChecks=0;
for(const dark of [false,true])for(const high of [false,true]){
 const foreground=luminance(color("SecondaryText",dark,high));
 for(const background of dark?[[28,28,30],[0,0,0]]:[[255,255,255],[242,242,247]]){
  const [low,bright]=[foreground,luminance(background.map(v=>v/255))].sort((a,b)=>a-b);
  assert((bright+.05)/(low+.05)>=4.5,`SecondaryText fails native surface ${background} dark=${dark} high=${high}`);
  secondaryChecks++;
 }
}
console.log(`Native theme: ${secondaryChecks} secondary/native system surface pairs passed`);
