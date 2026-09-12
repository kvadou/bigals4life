import { afterEach, expect, test } from "bun:test";
import { NextRequest } from "next/server";
import { proxy } from "../proxy";

const original = process.env.NEXT_PUBLIC_SUPABASE_URL;
afterEach(() => {
  if (original === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  else process.env.NEXT_PUBLIC_SUPABASE_URL = original;
});

test("only the three exact brand files are public when signed out", async () => {
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  for (const path of ["/ba4l-icon.svg", "/ba4l-mark.svg", "/apple-touch-icon.png"]) {
    const response = await proxy(new NextRequest(`https://bigals4life.com${path}`));
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  }
  for (const path of ["/", "/night", "/season", "/ba4l-icon.svg/private", "/private.svg", "/apple-touch-icon.png/private"]) {
    const response = await proxy(new NextRequest(`https://bigals4life.com${path}`));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://bigals4life.com/login");
  }
});
