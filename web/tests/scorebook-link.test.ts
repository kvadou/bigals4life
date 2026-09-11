import { expect, test } from "bun:test";
import { resolveScorebookLink } from "../lib/scorebook-link";
const first = "6f71e01f-9681-4d19-8649-909d2ad03593";
const second = "d71a8015-f6b4-42bd-81c9-18f6c16eea6a";
test("homepage remembers team without exposing a default team", () => {
  expect(resolveScorebookLink(null, first)).toBe(first);
  expect(resolveScorebookLink(second, first)).toBe(second);
  expect(resolveScorebookLink(null, null)).toBeNull();
  expect(resolveScorebookLink(null, "bad")).toBeNull();
  expect(() => resolveScorebookLink("bad", first)).toThrow();
  expect(() => resolveScorebookLink("", first)).toThrow();
});
