import { describe, expect, it } from "vitest";

import { type ContactForCard, contactBubble } from "./flex";

const baseContact: ContactForCard = {
  id: "c1",
  name: "王小明",
  company: null,
  title: null,
  role_type: "unclassified",
  phone: null,
  email: null,
  line_display_name: null,
  line_id: null,
  whatsapp_phone: null,
  wechat_id: null,
  birthday_month: null,
  birthday_day: null,
  notes: null,
  is_important: false,
};

describe("contactBubble", () => {
  it("shows '上次聊到' when a last touch is given", () => {
    const bubble = contactBubble(baseContact, undefined, { occurred_on: "2026-10-15", content: "他兒子下個月要考學測" });
    const texts = JSON.stringify(bubble).match(/"text":"([^"]*)"/g) ?? [];
    expect(texts.some((t) => t.includes("上次聊到") && t.includes("10/15") && t.includes("他兒子下個月要考學測"))).toBe(true);
  });

  it("omits the line when there's no history yet", () => {
    const bubble = contactBubble(baseContact);
    const texts = JSON.stringify(bubble).match(/"text":"([^"]*)"/g) ?? [];
    expect(texts.some((t) => t.includes("上次聊到"))).toBe(false);
  });
});
