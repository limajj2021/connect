import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { KEEP_IN_TOUCH_DAYS, type ImportantContact, keepInTouchKey, overdue } from "./keep-in-touch";

const item = (name: string, daysSince: number) => ({ contact: { id: name, name }, daysSince, lastContactOn: "", hasHistory: true }) as unknown as ImportantContact;

describe("overdue", () => {
  it("keeps only people quiet for KEEP_IN_TOUCH_DAYS or more, longest first", () => {
    const list = [item("a", KEEP_IN_TOUCH_DAYS - 1), item("b", 90), item("c", KEEP_IN_TOUCH_DAYS)];
    expect(overdue(list).map((i) => i.contact.name)).toEqual(["b", "c"]);
  });
});

describe("keepInTouchKey", () => {
  it("stays the same for a while, so one person isn't nudged every day", () => {
    const keys = new Set(["2026-10-01", "2026-10-02", "2026-10-03"].map((d) => keepInTouchKey("x", d)));
    expect(keys.size).toBeLessThanOrEqual(2);
  });

  it("changes after the re-nudge interval", () => {
    expect(keepInTouchKey("x", "2026-10-01")).not.toBe(keepInTouchKey("x", "2026-10-29"));
    expect(keepInTouchKey("x", "2026-10-01")).toMatch(/^line:keep:x:\d+$/);
  });
});
