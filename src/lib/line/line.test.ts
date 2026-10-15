import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { contactBubble, missingFields, sendMessageBubble } from "./flex";
import { lineProfileUrl, lineShareUrl, toWhatsappNumber, whatsappUrl } from "./links";
import { signLineBody, verifyLineSignature } from "./signature";

describe("signature", () => {
  it("accepts LINE's signature and rejects tampering", () => {
    const body = JSON.stringify({ events: [] });
    const sig = signLineBody(body, "secret");
    expect(verifyLineSignature(body, sig, "secret")).toBe(true);
    expect(verifyLineSignature(body + " ", sig, "secret")).toBe(false);
    expect(verifyLineSignature(body, sig, "other")).toBe(false);
    expect(verifyLineSignature(body, null, "secret")).toBe(false);
    expect(verifyLineSignature(body, "not base64!!", "secret")).toBe(false);
  });
});

describe("links", () => {
  it("builds share / WhatsApp / profile links", () => {
    expect(lineShareUrl("生日快樂")).toBe("https://line.me/R/share?text=%E7%94%9F%E6%97%A5%E5%BF%AB%E6%A8%82");
    expect(toWhatsappNumber("0912-345-678")).toBe("886912345678");
    expect(toWhatsappNumber("+1 415 555 0100")).toBe("14155550100");
    expect(toWhatsappNumber("123")).toBeNull();
    expect(whatsappUrl("0912345678", "hi")).toBe("https://wa.me/886912345678?text=hi");
    expect(lineProfileUrl("kenny_88")).toBe("https://line.me/R/ti/p/~kenny_88");
    expect(lineProfileUrl("@shop")).toBe("https://line.me/R/ti/p/%40shop");
  });
});

const contact = {
  id: "00000000-0000-0000-0000-000000000001",
  name: "王小明",
  company: "台積電",
  title: null,
  role_type: "unclassified" as const,
  phone: "0912345678",
  email: null,
  line_display_name: null,
  line_id: null,
  whatsapp_phone: "0912345678",
  wechat_id: null,
  linkedin_url: null,
  name_en: null,
  salutation: null,
  greeting_tone: null,
  facebook_url: null,
  birthday_month: null,
  birthday_day: null,
  notes: null,
  is_important: false,
};

describe("flex", () => {
  it("lists missing fields", () => {
    expect(missingFields(contact)).toEqual(["title", "role_type", "birthday", "line_id", "wechat_id", "email"]);
  });

  it("keeps postback data and labels within LINE limits", () => {
    const json = JSON.stringify([
      contactBubble(contact),
      sendMessageBubble({ title: "t", messageText: "生日快樂".repeat(20), contact, kind: "birthday", variant: 3, reminderId: contact.id }),
    ]);
    for (const match of json.matchAll(/"data":"([^"]*)"/g)) expect(match[1].length).toBeLessThanOrEqual(300);
    for (const match of json.matchAll(/"label":"([^"]*)"/g)) expect(match[1].length).toBeLessThanOrEqual(40);
    for (const match of json.matchAll(/"uri":"([^"]*)"/g)) expect(match[1].length).toBeLessThanOrEqual(1000);
    expect(json).toContain("wa.me/886912345678");
  });
});
