import { describe, expect, test } from "bun:test";
import { decide, type Role } from "@/lib/auth-server";

const contract = await Bun.file(new URL("./fixtures/auth-contract.json", import.meta.url)).json();

describe("scorebook access decisions", () => {
  test("legacy scorebooks stay link-accessible for anyone", () => {
    expect(decide("read", "legacy", false).status).toBe(200); expect(decide("write", "legacy", false).status).toBe(200); expect(decide("write", "legacy", true).status).toBe(200);
  });
  test("claimed scorebooks: anonymous gets 401, non-member gets 404 (existence hidden)", () => {
    expect(decide("read", "none", false)).toMatchObject({ status: 401 }); expect(decide("write", "none", false)).toMatchObject({ status: 401 });
    expect(decide("read", "none", true)).toMatchObject({ status: 404 }); expect(decide("write", "none", true)).toMatchObject({ status: 404 });
  });
  test("roles", () => {
    for (const role of ["owner", "editor"] as Role[]) { expect(decide("read", role, true).status).toBe(200); expect(decide("write", role, true).status).toBe(200); }
    expect(decide("read", "viewer", true).status).toBe(200); expect(decide("write", "viewer", true).status).toBe(403);
    expect(decide("read", "missing", true).status).toBe(404); expect(decide("read", "missing", false).status).toBe(404);
  });
  test("fixture matrix matches the implementation", () => {
    for (const c of contract.decisions as { kind: "read" | "write"; role: Role; identified: boolean; status: number }[]) expect({ ...c, status: decide(c.kind, c.role, c.identified).status }).toEqual(c);
  });
});
