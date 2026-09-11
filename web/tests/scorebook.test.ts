import {test,expect} from "bun:test";
import {nightSchema} from "../lib/scorebook";
test("shared scorebook accepts final-only history without inventing rolls",()=>{
  const n=nightSchema.parse({game:2,rolls:[[],[],[],[]],history:[{game:1,rolls:[[],[],[],[]],finals:[168,90,138,156]}]});
  expect(n.history[0].finals?.reduce((a,b)=>(a??0)+(b??0),0)).toBe(552);
});
test("reject invalid and oversized remote edits",()=>{
  for(const rolls of [[[9,3],[],[],[]],[[],[]]])expect(nightSchema.safeParse({game:1,rolls,history:[]}).success).toBe(false);
  expect(nightSchema.safeParse({game:1,rolls:[[],[],[],[]],history:[],finals:[301,0,0,0]}).success).toBe(false);
});
