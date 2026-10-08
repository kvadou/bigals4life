import { test, expect } from "bun:test";
import { teamCard } from "../lib/team-card";

const fullNames = { Doug: "Doug Kvamme", Mustafa: "Mustafa Sakhi", Kyle: "Kyle Dickhaus", Pete: "Pete Anderson" };
const base = {
  userId: "u-doug", team: "BIG AL'S 4 LIFE", scorebookId: "book-1", fullNames,
  profiles: [{ userId: "u-doug", bowlerName: "Doug" }, { userId: "u-pete", bowlerName: "Pete" }, { userId: "u-guest", bowlerName: null }],
  members: [{ userId: "u-doug", role: "owner" }, { userId: "u-pete", role: "editor" }],
  invites: ["Kyle@Example.com"],
  roster: [{ name: "DOUG KVAMME", average: 140, handicap: 63, games: 12 }, { name: "PETE ANDERSON", average: 200, handicap: 9, games: 12 }],
};

test("four bowlers in roster order with sign-in, role and league numbers", () => {
  const card = teamCard(base);
  expect(card.yourRole).toBe("owner");
  expect(card.bowlers.map(b => b.name)).toEqual(["Doug", "Mustafa", "Kyle", "Pete"]);
  expect(card.bowlers[0]).toMatchObject({ fullName: "Doug Kvamme", you: true, signedIn: true, role: "owner", average: 140, handicap: 63, games: 12 });
  expect(card.bowlers[1]).toMatchObject({ you: false, signedIn: false, role: null, average: null });
  expect(card.bowlers[3]).toMatchObject({ you: false, signedIn: true, role: "editor", average: 200 });
  expect(card.invites).toEqual(["kyle@example.com"]);
});

test("a signed-in bowler without membership shows no role; no standings means no numbers", () => {
  const card = teamCard({ ...base, members: [], roster: [], team: null });
  expect(card.yourRole).toBeNull();
  expect(card.bowlers[0]).toMatchObject({ signedIn: true, role: null, average: null, games: null });
  expect(card.team).toBeNull();
});
