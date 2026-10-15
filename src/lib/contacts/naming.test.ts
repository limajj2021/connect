import { describe, expect, it } from "vitest";

import { derivedSalutation, salutationFor, salutationOptions, splitName, toneFor } from "./naming";

const person = (over: Partial<Parameters<typeof salutationFor>[0]> = {}) => ({ name: "王小明", title: null, role_type: "non_boss" as const, ...over });

describe("splitName", () => {
  it("splits a mixed-script name into 中文名 and 英文名", () => {
    expect(splitName("Kenny 吳副")).toEqual({ zh: "吳副", en: "Kenny" });
    expect(splitName("王小明 Ming Wang")).toEqual({ zh: "王小明", en: "Ming Wang" });
  });

  it("drops the @note part and keeps an existing English name", () => {
    expect(splitName("Lita 李 @班加羅爾")).toEqual({ zh: "李", en: "Lita" });
    expect(splitName("Kenny 吳副", "Kenny Wu")).toEqual({ zh: "吳副", en: "Kenny Wu" });
  });

  it("returns null when there's nothing to split or it's already split", () => {
    expect(splitName("王小明")).toBeNull();
    expect(splitName("Thribhuvan")).toBeNull();
    expect(splitName("吳副", "Kenny")).toBeNull();
  });
});

describe("salutationFor / toneFor", () => {
  it("uses what you set, else the derived address", () => {
    expect(salutationFor(person({ salutation: "小明哥" }))).toBe("小明哥");
    expect(salutationFor(person({ salutation: "  " }))).toBe("小明");
    expect(derivedSalutation(person({ name: "王大明", title: "董事長", role_type: "boss" }))).toBe("王董");
  });

  it("picks the tone: explicit > 哥/姐 reads casual > by role", () => {
    expect(toneFor(person({ role_type: "boss" }))).toBe("formal");
    expect(toneFor(person({ role_type: "boss", salutation: "Kenny 哥" }))).toBe("casual");
    expect(toneFor(person({ role_type: "boss", salutation: "Kenny 哥", greeting_tone: "formal" }))).toBe("formal");
    expect(toneFor(person({ greeting_tone: "formal" }))).toBe("formal");
  });
});

describe("salutationOptions", () => {
  it("offers title, first name, English name and 哥／姐 forms", () => {
    const options = salutationOptions(person({ name: "陳美玲", name_en: "Meiling Chen", title: "總經理", role_type: "boss" }));
    expect(options).toEqual(expect.arrayContaining(["陳總", "美玲", "Meiling", "Meiling 哥", "Meiling 姐", "美玲姐", "陳姐"]));
    expect(new Set(options).size).toBe(options.length);
  });

  it("works for English-only names", () => {
    expect(salutationOptions(person({ name: "Kenny" }))).toEqual(["Kenny", "Kenny 哥", "Kenny 姐"]);
  });
});
