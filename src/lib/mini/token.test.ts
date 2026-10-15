import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

beforeAll(() => {
  process.env.LINK_SIGNING_SECRET = "x".repeat(40);
});

const { signScope, verifyScope } = await import("./token");

describe("mini-form link tokens", () => {
  it("accepts only the scope they were signed for", () => {
    const token = signScope("contact:abc");
    expect(verifyScope(token, "contact:abc")).toBe(true);
    expect(verifyScope(token, "contact:other")).toBe(false);
    expect(verifyScope(token, "contact:new")).toBe(false);
  });

  it("rejects tampered, malformed and expired tokens", () => {
    const token = signScope("contact:abc");
    const [payload, mac] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ s: "contact:other", e: 9999999999 })).toString("base64url");
    expect(verifyScope(`${forged}.${mac}`, "contact:other")).toBe(false);
    expect(verifyScope(`${payload}.AAAA`, "contact:abc")).toBe(false);
    expect(verifyScope("garbage", "contact:abc")).toBe(false);
    expect(verifyScope(null, "contact:abc")).toBe(false);
    expect(verifyScope(signScope("contact:abc", -10), "contact:abc")).toBe(false);
  });
});
