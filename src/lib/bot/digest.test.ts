import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { FOLLOWUP_INTERVAL_DAYS, reminderStage } from "./digest";

describe("reminderStage", () => {
  const today = "2026-10-15";

  it("is 'early' before the due date (birthdays surfaced a few days ahead)", () => {
    expect(reminderStage(today, "2026-10-18")).toBe("early");
  });

  it("is 'due' on the day it's due, and stays 'due' until a full interval has passed", () => {
    expect(reminderStage(today, "2026-10-15")).toBe("due"); // due today
    expect(reminderStage(today, "2026-10-09")).toBe("due"); // 6 days overdue — still inside the first interval
  });

  it("advances to a new 'followup' stage once it's been overdue a full interval — pushed once more, not daily", () => {
    const dueDate = "2026-10-01"; // 14 days before `today`
    const stage = reminderStage(today, dueDate);
    expect(stage).toBe(`followup${Math.floor(14 / FOLLOWUP_INTERVAL_DAYS)}`);
    // The stage (and so the dedupe key) doesn't change again until the *next* interval.
    expect(reminderStage("2026-10-16", dueDate)).toBe(stage);
  });

  it("moves to the next followup stage a week later — a second, distinct nudge, not a repeat of the first", () => {
    const dueDate = "2026-10-01";
    const firstFollowup = reminderStage("2026-10-15", dueDate); // 14 days overdue
    const nextFollowup = reminderStage("2026-10-22", dueDate); // 21 days overdue
    expect(nextFollowup).not.toBe(firstFollowup);
  });
});
