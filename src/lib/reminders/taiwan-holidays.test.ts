import { describe, expect, it } from "vitest";

import { occasionReminderDueDate, occasionSolarDate } from "./taiwan-holidays";

const lunarCny = { calendar: "lunar" as const, month: 1, day: 1 };
const lunarDragonBoat = { calendar: "lunar" as const, month: 5, day: 5 };
const lunarMidAutumn = { calendar: "lunar" as const, month: 8, day: 15 };
const solarChristmas = { calendar: "solar" as const, month: 12, day: 25 };

describe("occasionSolarDate", () => {
  it("computes known lunar-calendar dates correctly", () => {
    expect(occasionSolarDate(lunarCny, 2025)).toBe("2025-01-29");
    expect(occasionSolarDate(lunarCny, 2026)).toBe("2026-02-17");
    expect(occasionSolarDate(lunarDragonBoat, 2025)).toBe("2025-05-31");
    expect(occasionSolarDate(lunarMidAutumn, 2025)).toBe("2025-10-06");
  });

  it("a solar-calendar occasion falls on the same date every year", () => {
    expect(occasionSolarDate(solarChristmas, 2025)).toBe("2025-12-25");
    expect(occasionSolarDate(solarChristmas, 2030)).toBe("2030-12-25");
  });
});

describe("occasionReminderDueDate", () => {
  it("subtracts the occasion's own lead days", () => {
    const cny = occasionReminderDueDate({ ...lunarCny, id: "1", name: "春節", lead_days: 14, enabled: true }, 2025);
    expect(cny.festivalDate).toBe("2025-01-29");
    expect(cny.dueDate).toBe("2025-01-15"); // 14 days before

    const dragonBoat = occasionReminderDueDate({ ...lunarDragonBoat, id: "2", name: "端午節", lead_days: 7, enabled: true }, 2025);
    expect(dragonBoat.festivalDate).toBe("2025-05-31");
    expect(dragonBoat.dueDate).toBe("2025-05-24"); // 7 days before
  });

  it("supports a custom lead time", () => {
    const result = occasionReminderDueDate({ ...lunarMidAutumn, id: "3", name: "中秋節", lead_days: 3, enabled: true }, 2025);
    expect(result.dueDate).toBe("2025-10-03");
  });

  it("correctly rolls the due date across a month boundary", () => {
    // 2026 Chinese New Year is 2026-02-17; 14 days before crosses into January.
    const result = occasionReminderDueDate({ ...lunarCny, id: "1", name: "春節", lead_days: 14, enabled: true }, 2026);
    expect(result.dueDate).toBe("2026-02-03");
  });

  it("works for a custom solar occasion (e.g. 聖誕節 or 跨年)", () => {
    const christmas = occasionReminderDueDate({ ...solarChristmas, id: "4", name: "聖誕節", lead_days: 7, enabled: true }, 2026);
    expect(christmas.festivalDate).toBe("2026-12-25");
    expect(christmas.dueDate).toBe("2026-12-18");
  });
});
