import { describe, expect, it } from "vitest";

import { MAX_MILESTONES, buildTranscript, milestonePrompt, parseMilestoneReply } from "./milestones";

const noSimplified = () => false;

describe("buildTranscript", () => {
  it("renders date + speaker per line and reports the chat's date range", () => {
    const out = buildTranscript([
      { date: "2026-10-01", speaker: "王小明", text: "下個月要搬去新竹" },
      { date: "2026-10-02", speaker: "我", text: "好，我幫你問問工程師" },
    ]);
    expect(out.transcript).toBe("10-01 王小明：下個月要搬去新竹\n10-02 我：好，我幫你問問工程師");
    expect(out.firstDate).toBe("2026-10-01");
    expect(out.lastDate).toBe("2026-10-02");
    expect(out.truncated).toBe(false);
  });

  it("keeps the newest messages when the chat is too long", () => {
    const lines = Array.from({ length: 50 }, (_, i) => ({ date: "2026-10-01", speaker: "A", text: `訊息${i}`.padEnd(20, "x") }));
    const out = buildTranscript(lines, 200);
    expect(out.truncated).toBe(true);
    expect(out.transcript).toContain("訊息49");
    expect(out.transcript).not.toContain("訊息0x");
  });

  it("handles forwarded messages without date or speaker", () => {
    const out = buildTranscript([{ date: null, speaker: null, text: "週五一起吃飯？" }]);
    expect(out.transcript).toBe("週五一起吃飯？");
    expect(out.lastDate).toBeNull();
  });
});

describe("milestonePrompt", () => {
  it("asks for JSON only, and null dates when the chat has none", () => {
    const prompt = milestonePrompt({ transcript: "…", contactNames: ["王小明"], isGroup: false, year: "2026", datesKnown: false });
    expect(prompt).toContain("王小明");
    expect(prompt).toContain("只輸出 JSON");
    expect(prompt).toContain("date 一律填 null");
  });
});

describe("parseMilestoneReply", () => {
  const range = { fallbackDate: "2026-10-15", minDate: "2026-09-01", maxDate: "2026-10-10", isSimplified: noSimplified };

  it("keeps valid points in date order and clamps invented dates to the chat's range", () => {
    const result = parseMilestoneReply(
      {
        milestones: [
          { date: "2026-10-05", who: "我", point: "我答應幫他介紹工程師" },
          { date: "2025-01-01", who: "王小明", point: "他說下個月要搬去新竹" },
          { date: "2030-01-01", who: "王小明", point: "他兒子要考學測" },
          { date: "2026-10-06", who: "王小明", point: "" },
        ],
        promises: [{ text: "介紹工程師給他", due: "2026-10-20" }],
      },
      range,
    );
    expect(result.milestones.map((m) => [m.date, m.point])).toEqual([
      ["2026-09-01", "他說下個月要搬去新竹"],
      ["2026-10-05", "我答應幫他介紹工程師"],
      ["2026-10-10", "他兒子要考學測"],
    ]);
    expect(result.promises).toEqual([{ text: "介紹工程師給他", due: "2026-10-20" }]);
  });

  it("drops Simplified-Chinese points, duplicates and past due dates; caps the count", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ date: "2026-10-01", who: "A", point: `重點 ${i}` }));
    const result = parseMilestoneReply(
      {
        milestones: [{ date: "2026-10-01", who: "A", point: "这是简体" }, { date: "2026-10-01", who: "A", point: "重點 0" }, ...many],
        promises: [{ text: "回覆報價", due: "2026-01-01" }],
      },
      { ...range, isSimplified: (t) => t.includes("这") },
    );
    expect(result.milestones).toHaveLength(MAX_MILESTONES);
    expect(result.milestones.some((m) => m.point.includes("这"))).toBe(false);
    expect(new Set(result.milestones.map((m) => m.point)).size).toBe(MAX_MILESTONES);
    expect(result.promises[0].due).toBeNull();
  });

  it("uses today for undated (forwarded) chats and survives garbage", () => {
    const result = parseMilestoneReply({ milestones: [{ date: null, who: "", point: "週五吃飯" }] }, {
      fallbackDate: "2026-10-15",
      minDate: null,
      maxDate: null,
      isSimplified: noSimplified,
    });
    expect(result.milestones[0].date).toBe("2026-10-15");
    expect(parseMilestoneReply(null, range)).toEqual({ milestones: [], promises: [] });
    expect(parseMilestoneReply({ milestones: "nope" }, range)).toEqual({ milestones: [], promises: [] });
  });
});
