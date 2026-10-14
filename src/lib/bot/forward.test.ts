import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { guessNameFromMessages } = await import("./forward");

describe("guessNameFromMessages", () => {
  it("uses explicit self-introductions", () => {
    expect(guessNameFromMessages(["你好", "我是林志豪，宏遠科技業務", "電話 0933222111"])).toBe("林志豪");
    expect(guessNameFromMessages(["Hi, I'm Kenny Wu from ACME"])).toBe("Kenny Wu");
  });

  it("uses a single pasted line with details", () => {
    expect(guessNameFromMessages(["王小明 0912345678"])).toBe("王小明");
  });

  it("does not mistake chit-chat for a name", () => {
    expect(guessNameFromMessages(["好的謝謝", "明天見"])).toBeUndefined();
    expect(guessNameFromMessages(["收到"])).toBeUndefined();
  });
});
