import {test,expect} from "bun:test";
import {analyze,maximum,validRolls,symbol} from "../lib/bowling";
test("known scores and live ceilings",()=>{
  expect(maximum([])).toBe(300);expect(maximum([9])).toBe(290);expect(maximum([9,0])).toBe(279);expect(maximum([10,7])).toBe(280);
  expect(analyze(Array(12).fill(10)).score).toBe(300);
  expect(analyze(Array(20).fill(0)).score).toBe(0);
  expect(analyze(Array(21).fill(5)).score).toBe(150);
  expect(analyze([10,7,3,9,0,10,0,8,8,2,0,6,10,10,10,8,1]).score).toBe(167);
});
test("tenth frame racks and validation",()=>{
  const base=Array(18).fill(0);
  expect(analyze([...base,10,7]).available).toBe(3);
  expect(validRolls([...base,10,7,4])).toBe(false);
  expect(validRolls([...base,10,7,3])).toBe(true);
  expect(analyze([...base,7,3]).available).toBe(10);
  expect(analyze([...base,10,10]).available).toBe(10);
  expect(validRolls([8,3])).toBe(false);expect(validRolls([NaN])).toBe(false);expect(validRolls([-1])).toBe(false);
  expect(validRolls([...Array(12).fill(10),0])).toBe(false);
  expect(symbol([7,3,7],2)).toBe("7");expect(symbol([10,7,3],2)).toBe("/");
});
test("legal games have nonincreasing ceilings and accurate final bounds",()=>{
  let seed=42;const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  for(let n=0;n<1000;n++){
    const rolls:number[]=[];let ceiling=300;
    while(!analyze(rolls).complete){rolls.push(Math.floor(rand()*(analyze(rolls).available+1)));expect(validRolls(rolls)).toBe(true);expect(maximum(rolls)).toBeLessThanOrEqual(ceiling);ceiling=maximum(rolls);expect(ceiling).toBeGreaterThanOrEqual(analyze(rolls).score);}
    expect(ceiling).toBe(analyze(rolls).score);
  }
});
