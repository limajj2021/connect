import JSZip from "jszip";
import { describe, expect, it } from "vitest";

import { extractChatTexts } from "./archive";
import { parseChatExport } from "./parse";
import { chatNameFromWhatsAppFileName, parseWhatsAppChatExport } from "./whatsapp-parser";

describe("parseWhatsAppChatExport", () => {
  it("parses the iOS format with 上午/下午 and Y/M/D dates", () => {
    const raw = [
      "‎[2026/10/13 上午9:05:12] Kenny Wu: ‎Messages and calls are end-to-end encrypted.",
      "[2026/10/13 上午9:06:00] Kenny Wu: 你好，我的電話 +91 98765 43210",
      "第二行",
      "[2026/10/13 下午2:30:45] Jamie: 收到",
      "[2026/10/14 下午12:01:02] Kenny Wu: ‎image omitted",
    ].join("\n");
    const result = parseWhatsAppChatExport(raw, "Kenny Wu");
    expect(result.chatName).toBe("Kenny Wu");
    expect(result.participants).toEqual(["Kenny Wu", "Jamie"]);
    expect(result.messages.map((m) => [m.date, m.time, m.messageType])).toEqual([
      ["2026-10-13", "09:05", "system"],
      ["2026-10-13", "09:06", "text"],
      ["2026-10-13", "14:30", "text"],
      ["2026-10-14", "12:01", "image"],
    ]);
    expect(result.messages[1].text).toBe("你好，我的電話 +91 98765 43210\n第二行");
  });

  it("parses the Android format with M/D/YY and AM/PM", () => {
    const raw = ["10/13/26, 9:05 AM - Messages to this chat are now secured.", "10/13/26, 9:06 PM - +886 912 345 678: hi"].join("\n");
    const result = parseWhatsAppChatExport(raw);
    expect(result.messages[0]).toMatchObject({ sender: null, messageType: "system", date: "2026-10-13" });
    expect(result.messages[1]).toMatchObject({ sender: "+886 912 345 678", time: "21:06", text: "hi" });
  });

  it("detects D/M/Y when a day is above 12", () => {
    const raw = ["[13/10/2026, 09:05:12] A: one", "[14/10/2026, 10:00:00] B: two"].join("\n");
    expect(parseWhatsAppChatExport(raw).messages.map((m) => m.date)).toEqual(["2026-10-13", "2026-10-14"]);
  });

  it("names the chat from the export file name", () => {
    expect(chatNameFromWhatsAppFileName("WhatsApp Chat - Kenny Wu.zip")).toBe("Kenny Wu");
    expect(chatNameFromWhatsAppFileName("WhatsApp Chat with Amy.txt")).toBe("Amy");
  });
});

describe("parseChatExport", () => {
  it("routes LINE and WhatsApp exports to the right parser", () => {
    expect(parseChatExport("[LINE] 與王小明的聊天記錄\n\n2026/10/14（三）\n10:00\t王小明\t嗨", "a.txt").source).toBe("line");
    expect(parseChatExport("[2026/10/13 上午9:06:00] A: x\n[2026/10/13 上午9:07:00] B: y", "WhatsApp Chat - A.txt")).toMatchObject({
      source: "whatsapp",
      parsed: { chatName: "A" },
    });
  });
});

describe("extractChatTexts", () => {
  it("pulls chat .txt files out of a zip and ignores media / macOS junk", async () => {
    const zip = new JSZip();
    zip.file("_chat.txt", "[2026/10/13 上午9:06:00] A: x");
    zip.file("IMG-0001.jpg", new Uint8Array([1, 2, 3]));
    zip.file("__MACOSX/._chat.txt", "junk");
    zip.file("line/[LINE] 與王小明的聊天記錄.txt", "[LINE] 與王小明的聊天記錄");
    const data = await zip.generateAsync({ type: "arraybuffer" });
    const { entries } = await extractChatTexts(data, "WhatsApp Chat - A.zip");
    expect(entries.map((e) => e.fileName).sort()).toEqual(["WhatsApp Chat - A.txt", "[LINE] 與王小明的聊天記錄.txt"]);
  });
});
