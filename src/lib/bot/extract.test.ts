import { describe, expect, it } from "vitest";

import { extractFromCommand, extractFromOcr, normalizePhone, parseBirthday, parseLineDisplayName } from "./extract";

describe("extractFromCommand", () => {
  it("parses a typical quick-add line", () => {
    const d = extractFromCommand("王小明 台積電 經理 0912-345-678 生日3/4");
    expect(d.name).toBe("王小明");
    expect(d.company).toBe("台積電");
    expect(d.title).toBe("經理");
    expect(d.phone).toBe("0912345678");
    expect(d.birthday_month).toBe(3);
    expect(d.birthday_day).toBe(4);
  });

  it("recognises company suffixes, emails and boss titles", () => {
    const d = extractFromCommand("陳美玲 美玲國際股份有限公司 董事長 mei@example.com");
    expect(d.name).toBe("陳美玲");
    expect(d.company).toBe("美玲國際股份有限公司");
    expect(d.title).toBe("董事長");
    expect(d.role_type).toBe("boss");
    expect(d.email).toBe("mei@example.com");
  });

  it("handles messenger ids and full-width characters", () => {
    const d = extractFromCommand("Kenny ＬＩＮＥ：kenny_88 微信: kenny-wx WhatsApp +886 912 345 678");
    expect(d.name).toBe("Kenny");
    expect(d.line_id).toBe("kenny_88");
    expect(d.wechat_id).toBe("kenny-wx");
    expect(d.whatsapp_phone).toBe("+886912345678");
  });

  it("splits a name glued to a title", () => {
    const d = extractFromCommand("林總經理 宏達國際");
    expect(d.name).toBe("林");
    expect(d.title).toBe("總經理");
    expect(d.company).toBe("宏達國際");
  });

  it("returns just the name for a single word", () => {
    expect(extractFromCommand("Alice")).toEqual({ name: "Alice" });
  });
});

describe("extractFromOcr", () => {
  it("reads a business card", () => {
    const d = extractFromOcr(
      ["宏遠科技股份有限公司", "張志豪", "業務經理", "Mobile: 0933 222 111", "Tel: (02) 2712-3456 #123", "E-mail: zh.chang@hy-tech.com.tw", "台北市松山區民生東路三段100號5樓"].join("\n"),
    );
    expect(d.company).toBe("宏遠科技股份有限公司");
    expect(d.name).toBe("張志豪");
    expect(d.title).toBe("業務經理");
    expect(d.phone).toBe("0933222111");
    expect(d.email).toBe("zh.chang@hy-tech.com.tw");
  });
});

describe("helpers", () => {
  it("normalizes phones", () => {
    expect(normalizePhone("+886 912-345-678")).toBe("+886912345678");
    expect(normalizePhone("02-2712-3456")).toBe("0227123456");
  });

  it("parses birthdays", () => {
    expect(parseBirthday("3/4")).toEqual({ year: undefined, month: 3, day: 4 });
    expect(parseBirthday("1990年3月4日")).toEqual({ year: 1990, month: 3, day: 4 });
    expect(parseBirthday("生日 12-25")).toEqual({ year: undefined, month: 12, day: 25 });
    expect(parseBirthday("13/40")).toBeUndefined();
  });
});

describe("LINE contact card / profile screenshots", () => {
  it("reads a shared contact card", () => {
    const d = extractFromOcr("Kenny吳副 ＠印度班加*\nView profile");
    expect(d.name).toBe("Kenny 吳副");
    expect(d.line_display_name).toBe("Kenny吳副 @印度班加");
    expect(d.notes).toBe("LINE 名稱標註：印度班加");
  });

  it("reads a profile page with a status message", () => {
    const d = extractFromOcr("下午 11:31\n王大明-宏遠科技股份有限公司\n專注半導體設備 0912-111-222\n聊天\n語音通話\n視訊通話\nKeep");
    expect(d.name).toBe("王大明");
    expect(d.company).toBe("宏遠科技股份有限公司");
    expect(d.phone).toBe("0912111222");
    expect(d.notes).toContain("專注半導體設備");
  });

  it("splits display-name conventions", () => {
    expect(parseLineDisplayName("陳總 | 業務總監")).toMatchObject({ name: "陳總", title: "業務總監", role_type: "boss" });
    expect(parseLineDisplayName("★Amy林★")).toMatchObject({ name: "Amy 林", line_display_name: "Amy林" });
  });
});

describe("chat-style phrasing", () => {
  it("reads IDs written as sentences", () => {
    expect(extractFromCommand("X 我的 LINE ID 是 ke_test88").line_id).toBe("ke_test88");
    expect(extractFromCommand("X 微信號是 kenny-wx1").wechat_id).toBe("kenny-wx1");
    expect(extractFromCommand("X WhatsApp 是 +886 955 111 222").whatsapp_phone).toBe("+886955111222");
  });
});
