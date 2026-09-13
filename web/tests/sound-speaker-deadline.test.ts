import {expect,test} from "bun:test";
import {speakerDeadline} from "../app/studio/sound-audio";
test("network delay consumes the lane speaker window rather than extending it",()=>{
 const started=100000;
 expect(speakerDeadline(started,started)).toBe(125000);
 expect(speakerDeadline(started,started+20000)-(started+20000)).toBe(5000);
 expect(speakerDeadline(started,started+24999)).toBe(125000);
});
test("expired or invalid confirmations cannot authorize speaker playback",()=>{
 expect(speakerDeadline(100000,125000)).toBe(0);
 expect(speakerDeadline(100000,140000)).toBe(0);
 expect(speakerDeadline(100000,99999)).toBe(0);
 expect(speakerDeadline(Number.NaN,125000)).toBe(0);
});
