import { describe, expect, it } from "vitest";

import { getFestivalReminderDueDate, getFestivalSolarDate } from "./taiwan-holidays";

describe("getFestivalSolarDate", () => {
  it("computes known Chinese New Year dates correctly", () => {
    expect(getFestivalSolarDate("chinese_new_year", 2025)).toBe("2025-01-29");
    expect(getFestivalSolarDate("chinese_new_year", 2026)).toBe("2026-02-17");
  });

  it("computes known Dragon Boat Festival dates correctly", () => {
    expect(getFestivalSolarDate("dragon_boat", 2025)).toBe("2025-05-31");
  });

  it("computes known Mid-Autumn Festival dates correctly", () => {
    expect(getFestivalSolarDate("mid_autumn", 2025)).toBe("2025-10-06");
  });
});

describe("getFestivalReminderDueDate", () => {
  it("subtracts the default lead days for each festival", () => {
    const cny = getFestivalReminderDueDate("chinese_new_year", 2025);
    expect(cny.festivalDate).toBe("2025-01-29");
    expect(cny.dueDate).toBe("2025-01-15"); // 14 days before

    const dragonBoat = getFestivalReminderDueDate("dragon_boat", 2025);
    expect(dragonBoat.festivalDate).toBe("2025-05-31");
    expect(dragonBoat.dueDate).toBe("2025-05-24"); // 7 days before
  });

  it("supports a custom lead time", () => {
    const result = getFestivalReminderDueDate("mid_autumn", 2025, 3);
    expect(result.dueDate).toBe("2025-10-03");
  });

  it("correctly rolls the due date across a month boundary", () => {
    // 2026 Chinese New Year is 2026-02-17; 14 days before crosses into January.
    const result = getFestivalReminderDueDate("chinese_new_year", 2026);
    expect(result.dueDate).toBe("2026-02-03");
  });
});
