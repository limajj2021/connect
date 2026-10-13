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
