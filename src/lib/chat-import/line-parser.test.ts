import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { parseLineChatExport } from "./line-parser";

const fixture = readFileSync(join(__dirname, "__fixtures__/sample-group-chat.txt"), "utf-8");

describe("parseLineChatExport", () => {
  it("extracts the chat name from the [LINE] header line", () => {
    const result = parseLineChatExport(fixture);
    expect(result.chatName).toBe("新創募資小組");
  });

  it("collects unique participants in first-appearance order, excluding system lines", () => {
    const result = parseLineChatExport(fixture);
    expect(result.participants).toEqual(["王小明", "我", "Alice"]);
  });

  it("parses one-line messages with date, time, sender and text", () => {
    const result = parseLineChatExport(fixture);
    const first = result.messages[0];
    expect(first).toMatchObject({
      date: "2024-03-10",
      time: "14:20",
      sender: "王小明",
      text: "嗨，最近好嗎？",
      messageType: "text",
    });
  });

  it("joins multiline messages (no HH:mm prefix) into the previous message's text", () => {
    const result = parseLineChatExport(fixture);
    const multiline = result.messages.find((m) => m.text.startsWith("我也很好"));
    expect(multiline?.text).toBe("我也很好，最近在忙新專案\n下週想約時間討論募資的事\n方便嗎？");
  });

  it("treats a sender-less line as a system message", () => {
    const result = parseLineChatExport(fixture);
    const system = result.messages.find((m) => m.messageType === "system");
    expect(system).toMatchObject({ sender: null, text: "王小明已將 Alice 加入聊天室。" });
  });

  it("classifies stickers, photos, and calls by their bracket/prefix markers", () => {
    const result = parseLineChatExport(fixture);
    expect(result.messages.find((m) => m.text === "[貼圖]")?.messageType).toBe("sticker");
    expect(result.messages.find((m) => m.text === "[照片]")?.messageType).toBe("image");
    expect(result.messages.find((m) => m.text.startsWith("☎"))?.messageType).toBe("call");
  });

  it("preserves an unsent-message line as plain text rather than dropping it", () => {
    const result = parseLineChatExport(fixture);
    const unsent = result.messages.find((m) => m.text === "已收回訊息");
    expect(unsent).toBeDefined();
    expect(unsent?.sender).toBe("王小明");
  });

  it("assigns strictly increasing sequence numbers and keeps raw line references", () => {
    const result = parseLineChatExport(fixture);
    const sequences = result.messages.map((m) => m.sequenceNo);
    expect(sequences).toEqual([...sequences].sort((a, b) => a - b));
    expect(new Set(sequences).size).toBe(sequences.length);
    for (const message of result.messages) {
      expect(message.rawLineRef).toBeGreaterThan(0);
    }
  });

  it("produces a stable dedupe hash for identical content and a different one for different content", () => {
    const result = parseLineChatExport(fixture);
    const again = parseLineChatExport(fixture);
    expect(result.messages[0].dedupeHash).toBe(again.messages[0].dedupeHash);
    expect(result.messages[0].dedupeHash).not.toBe(result.messages[1].dedupeHash);
  });

  it("produces no warnings for a well-formed export", () => {
    const result = parseLineChatExport(fixture);
    expect(result.warnings).toEqual([]);
  });

  it("warns instead of throwing when a message appears before any date header", () => {
    const result = parseLineChatExport("14:00\t王小明\t哈囉");
    expect(result.messages).toEqual([]);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("handles an empty file without throwing", () => {
    const result = parseLineChatExport("");
    expect(result.messages).toEqual([]);
    expect(result.participants).toEqual([]);
  });

  it("supports a one-to-one chat export with a simple header", () => {
    const text = [
      "[LINE] 與王小明的聊天記錄",
      "",
      "2024/01/02（二）",
      "08:00\t王小明\t新年快樂",
      "08:01\t我\t你也是",
    ].join("\n");
    const result = parseLineChatExport(text);
    expect(result.chatName).toBe("王小明");
    expect(result.messages).toHaveLength(2);
  });
});

describe("other LINE UI languages", () => {
  it("parses an English export with AM/PM times and M/D/Y dates", () => {
    const raw = [
      "[LINE] Chat history with Kenny 吳副 @印度班加*",
      "Saved on: 10/15/2026, 12:05 AM",
      "",
      "Tue, 10/13/2026",
      "9:05 AM\tKenny 吳副 @印度班加*\tHi! My number is 0912-345-678",
      "12:30 PM\tJamie\tGreat, talk soon",
      "",
      "Wed, 10/14/2026",
      "12:01 AM\tKenny 吳副 @印度班加*\t[Sticker]",
      "11:59 PM\tJamie\tsee you",
      "next week",
    ].join("\n");
    const result = parseLineChatExport(raw);
    expect(result.chatName).toBe("Kenny 吳副 @印度班加*");
    expect(result.participants).toEqual(["Kenny 吳副 @印度班加*", "Jamie"]);
    expect(result.messages.map((m) => [m.date, m.time, m.messageType])).toEqual([
      ["2026-10-13", "09:05", "text"],
      ["2026-10-13", "12:30", "text"],
      ["2026-10-14", "00:01", "sticker"],
      ["2026-10-14", "23:59", "text"],
    ]);
    expect(result.messages[3].text).toBe("see you\nnext week");
    expect(result.warnings).toEqual([]);
  });

  it("parses Y/M/D English headers, 24h times and the 'Chat with' title", () => {
    const raw = ["[LINE] Chat with Amy", "Saved on: 2026/10/15 00:05", "", "2026/10/14, Wed", "08:15\tAmy\thello"].join("\n");
    const result = parseLineChatExport(raw);
    expect(result.chatName).toBe("Amy");
    expect(result.messages[0]).toMatchObject({ date: "2026-10-14", time: "08:15", sender: "Amy", text: "hello" });
  });

  it("parses a Japanese export", () => {
    const raw = ["[LINE] 田中とのトーク履歴", "保存日時：2026/10/15 00:05", "", "2026/10/14(水)", "午後3:20\t田中\tこんにちは"].join("\n");
    const result = parseLineChatExport(raw);
    expect(result.chatName).toBe("田中");
    expect(result.messages[0]).toMatchObject({ date: "2026-10-14", time: "15:20", sender: "田中" });
  });

  it("parses Traditional-Chinese 上午/下午 times", () => {
    const raw = ["[LINE] 與王小明的聊天記錄", "", "2026/10/14（三）", "下午2:05\t王小明\t好"].join("\n");
    expect(parseLineChatExport(raw).messages[0]).toMatchObject({ time: "14:05", sender: "王小明" });
  });
});
