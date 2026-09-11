import {test,expect} from "bun:test";
import {parseVoiceRoll} from "../lib/voice-roll";
const empty=()=>[[],[],[],[]];
test("spoken rolls identify bowler and convert counts",()=>{
  expect(parseVoiceRoll("Doug got a strike.",empty()).added).toEqual([10]);
  expect(parseVoiceRoll("Mustafa knocked down seven pins",empty()).index).toBe(1);
  expect(parseVoiceRoll("Kyle six then zero",empty()).added).toEqual([6,0]);
  expect(parseVoiceRoll("Pete got a spare",[[],[],[],[7]]).added).toEqual([3]);
});
test("voice rejects ambiguity, totals, illegal racks, and negation",()=>{
  for(const t of ["Doug didn't get a strike","Doug 191","Doug seven or eight","strike","Pete spare","Doug 8 and 7"])
    expect(()=>parseVoiceRoll(t,empty())).toThrow();
  expect(()=>parseVoiceRoll("Doug strike",[[0],[],[],[]])).toThrow();
  expect(parseVoiceRoll("Doug spare",[[0],[],[],[]]).added).toEqual([10]);
});
