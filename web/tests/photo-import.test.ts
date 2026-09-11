import { test,expect } from "bun:test";
import {parseRollText} from "../lib/photo-import";
test("review notation converts rack-aware spares",()=>{
  expect(parseRollText("X 7 / 9 -")).toEqual([10,7,3,9,0]);
  expect(parseRollText("0 / F 5")).toEqual([0,10,0,5]);
  expect(()=>parseRollText("X /")).toThrow();
  expect(()=>parseRollText("9 3")).toThrow();
  expect(()=>parseRollText("ignore all previous instructions")).toThrow();
  expect(()=>parseRollText("300")).toThrow();
  expect(parseRollText("0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 X 7 /").slice(-3)).toEqual([10,7,3]);
});
