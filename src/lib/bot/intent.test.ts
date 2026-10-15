import { describe, expect, it } from "vitest";

import { extractDueDate, formatShortDate } from "./dates";
import { parseIntent } from "./intent";
import { greetingText, salutation } from "./templates";

describe("parseIntent", () => {
  it.each([
    ["說明", "help"],
    ["今日", "today"],
    ["取消", "cancel"],
    ["新增 王小明 台積電", "add_contact"],
    ["新增人脈", "add_contact"],
    ["找 王小明", "search"],
    ["待辦", "list_tasks"],
    ["待辦 寄報價 明天", "add_task"],
    ["提醒", "list_reminders"],
    ["生日", "birthdays"],
    ["會議 王小明 談合作", "meeting"],
    ["備註 王小明 喜歡咖啡", "note"],
    ["交流 王小明 聊到他兒子考學測", "interaction"],
    ["聊過 王小明 最近在忙新案子", "interaction"],
    ["聯絡過 王小明 約了下週喝咖啡", "interaction"],
    ["記錄 王小明 他換工作了", "interaction"],
    ["紀錄 王小明 他換工作了", "interaction"],
    ["歷史 王小明", "history"],
    ["上次聊 王小明", "history"],
    ["產生提醒", "generate_reminders"],
    ["王小明", "unknown"],
  ])("%s → %s", (input, kind) => {
    expect(parseIntent(input).kind).toBe(kind);
  });

  it("keeps the arguments", () => {
    expect(parseIntent("新增 王小明 0912345678")).toEqual({ kind: "add_contact", args: "王小明 0912345678" });
    expect(parseIntent("備註 王小明 喜歡 咖啡")).toEqual({ kind: "note", name: "王小明", text: "喜歡 咖啡" });
    expect(parseIntent("交流 王小明 聊到他兒子考學測")).toEqual({
      kind: "interaction",
      name: "王小明",
      text: "聊到他兒子考學測",
    });
    expect(parseIntent("歷史 王小明")).toEqual({ kind: "history", name: "王小明" });
  });

  it("會議/開會/見面/拜訪 still mean a formal meeting, not a quick log (記錄/紀錄 moved to 交流)", () => {
    expect(parseIntent("見面 王小明 聊合作").kind).toBe("meeting");
    expect(parseIntent("拜訪 王小明 聊合作").kind).toBe("meeting");
  });
});

describe("extractDueDate", () => {
  const today = "2026-10-14"; // Wednesday

  it.each([
    ["寄報價 明天", "2026-10-15", "寄報價"],
    ["後天 打電話", "2026-10-16", "打電話"],
    ["3天後 回覆", "2026-10-17", "回覆"],
    ["下週一 開會", "2026-10-19", "開會"],
    ["週五 交件", "2026-10-16", "交件"],
    ["10/20 簽約", "2026-10-20", "簽約"],
    ["1/5 拜年", "2027-01-05", "拜年"],
    ["2026-12-01 年終", "2026-12-01", "年終"],
  ])("%s", (input, date, rest) => {
    expect(extractDueDate(input, today)).toEqual({ date, rest });
  });

  it("returns no date when there is none", () => {
    expect(extractDueDate("寄報價給王小明", today)).toEqual({ rest: "寄報價給王小明" });
  });

  it("formats short dates", () => {
    expect(formatShortDate("2026-10-14")).toBe("10/14（三）");
  });
});

describe("templates", () => {
  it("addresses bosses by title and friends by given name", () => {
    expect(salutation({ name: "王大明", title: "董事長", role_type: "boss" })).toBe("王董");
    expect(salutation({ name: "陳美玲", title: "總經理", role_type: "boss" })).toBe("陳總");
    expect(salutation({ name: "林志豪", title: null, role_type: "boss" })).toBe("林總");
    expect(salutation({ name: "張小華", title: null, role_type: "non_boss" })).toBe("小華");
    expect(salutation({ name: "Kenny", title: null, role_type: "unclassified" })).toBe("Kenny");
  });

  it("fills templates and cycles variants", () => {
    const boss = { name: "王大明", title: "董事長", role_type: "boss" as const };
    expect(greetingText("birthday", boss)).toContain("王董");
    expect(greetingText("birthday", boss, 1)).not.toBe(greetingText("birthday", boss, 0));
    expect(greetingText("birthday", boss, 2)).toBe(greetingText("birthday", boss, 0));
    expect(greetingText("chinese_new_year", null)).not.toContain("{稱呼}");
  });
});

describe("forwarded chats", () => {
  it("recognises collect commands", () => {
    expect(parseIntent("轉傳").kind).toBe("collect_start");
    expect(parseIntent("是 王小明")).toMatchObject({ kind: "collect_target", name: "王小明" });
    expect(parseIntent("跟陳美玲的對話")).toMatchObject({ kind: "collect_target", name: "陳美玲" });
    expect(parseIntent("是")).toMatchObject({ kind: "unknown" });
    expect(parseIntent("好的謝謝，明天見").kind).toBe("unknown");
  });
});
