import { describe, expect, it } from "vitest";

import { type OcrLine, detectContactList } from "./contact-list";

const line = (text: string, left: number, top: number, height = 30): OcrLine => ({
  text,
  left,
  top,
  height,
  right: left + text.length * 18,
});

describe("detectContactList", () => {
  it("reads every person from a LINE chat list screenshot and skips group chats", () => {
    const lines = [
      line("11:10", 133, 76, 46),
      line("CONNECT", 247, 232, 46),
      line("王大明＠台商會長*", 563, 648, 31),
      line("Yesterday", 1065, 648, 19),
      line("👍", 563, 690, 23),
      line("Kenny 李副@班加羅爾*", 563, 781, 35),
      line("Call time 1:00", 567, 819, 23),
      line("Eric @清奈台商會長*", 563, 911, 34),
      line("Tuesday", 1077, 903, 19),
      line("You sent a sticker.", 563, 949, 23),
      line("Susan, Amy 陳，林，Ja...", 567, 1040, 31),
      line("(4)", 1031, 1044, 27),
      line("10/6", 1111, 1033, 19),
      line("Jack * sent a video.", 563, 1079, 23),
      line("Jack 吳小聰*", 563, 1160, 34),
      line("10/2", 1111, 1162, 19),
      line("Alex 黃天倫*達興實業", 563, 1555, 34),
      line("9/25", 1107, 1547, 19),
      line("祝福你們 中秋佳節愉快闔家平安！", 567, 1587, 37),
    ];
    expect(detectContactList(lines)).toEqual({
      kind: "chats",
      names: ["王大明＠台商會長*", "Kenny 李副@班加羅爾*", "Eric @清奈台商會長*", "Jack 吳小聰*", "Alex 黃天倫*達興實業"],
    });
  });

  it("reads a friend list (no dates, evenly spaced rows)", () => {
    const lines = [
      line("Friends 245", 40, 300, 30),
      ...["王小明", "陳美玲", "Leo Chang", "林志豪", "張雅婷"].flatMap((name, i) => [
        line(name, 200, 400 + i * 150, 34),
        ...(i % 2 === 0 ? [line("今天也要加油", 200, 440 + i * 150, 24)] : []),
      ]),
    ];
    expect(detectContactList(lines)).toEqual({ kind: "friends", names: ["王小明", "陳美玲", "Leo Chang", "林志豪", "張雅婷"] });
  });

  it("does not treat a business card as a list", () => {
    const lines = [
      line("台積電股份有限公司", 100, 100, 40),
      line("王小明", 100, 160, 50),
      line("業務經理", 100, 220, 30),
      line("手機 0912-345-678", 100, 300, 28),
      line("Email ming@example.com", 100, 335, 28),
      line("台北市信義區松仁路 100 號", 100, 370, 28),
    ];
    expect(detectContactList(lines)).toBeNull();
  });

  it("needs at least two people", () => {
    const lines = [line("王小明", 200, 400, 34), line("10/2", 1100, 400, 19), line("好的", 200, 440, 24), line("CONNECT", 247, 100, 46)];
    expect(detectContactList(lines)).toBeNull();
  });
});
