import { describe, expect, it } from "vitest";

import { findSocialLinks, linkedinHandle, parseSocialUrl, readOpenGraph, textWithoutUrls } from "./social";

describe("parseSocialUrl", () => {
  it("recognises a LinkedIn profile and strips tracking params", () => {
    expect(parseSocialUrl("https://www.linkedin.com/in/wang-xiaoming-123/?utm_source=share")).toEqual({
      platform: "linkedin",
      kind: "profile",
      url: "https://www.linkedin.com/in/wang-xiaoming-123",
      handle: "wang-xiaoming-123",
    });
  });

  it("recognises a LinkedIn post and the author's handle in it", () => {
    const link = parseSocialUrl("https://www.linkedin.com/posts/wang-xiaoming-123_ai-taiwan-activity-7380000000000000000-AbCd?utm_source=share&utm_medium=member_ios");
    expect(link).toMatchObject({ platform: "linkedin", kind: "post", handle: "wang-xiaoming-123" });
    expect(link?.url).not.toContain("utm_");
    expect(parseSocialUrl("https://www.linkedin.com/feed/update/urn:li:activity:7380000000000000000/")).toMatchObject({ kind: "post" });
    expect(parseSocialUrl("https://lnkd.in/gAbCdEf")).toMatchObject({ platform: "linkedin", kind: "post" });
  });

  it("tells Facebook profiles from posts", () => {
    expect(parseSocialUrl("https://www.facebook.com/kenny.wu.88")).toMatchObject({ platform: "facebook", kind: "profile" });
    expect(parseSocialUrl("https://m.facebook.com/profile.php?id=1000123&ref=xx")).toEqual({
      platform: "facebook",
      kind: "profile",
      url: "https://facebook.com/profile.php?id=1000123".replace("https://", "https://m."),
    });
    expect(parseSocialUrl("https://www.facebook.com/share/p/1AbCdEf/")).toMatchObject({ platform: "facebook", kind: "post" });
    expect(parseSocialUrl("https://www.facebook.com/kenny.wu.88/posts/pfbid0abc")).toMatchObject({ kind: "post" });
    expect(parseSocialUrl("https://www.facebook.com/groups/123")).toMatchObject({ kind: "post" });
    expect(parseSocialUrl("https://www.facebook.com/marketplace")).toBeNull();
  });

  it("ignores everything else", () => {
    expect(parseSocialUrl("https://example.com/in/foo")).toBeNull();
    expect(parseSocialUrl("not a url")).toBeNull();
  });
});

describe("findSocialLinks / textWithoutUrls", () => {
  it("finds links inside a shared message and keeps what was typed", () => {
    const message = "他升任副總了！ https://www.linkedin.com/posts/kenny-wu_news-activity-1-x。";
    expect(findSocialLinks(message)).toHaveLength(1);
    expect(textWithoutUrls(message)).toBe("他升任副總了！");
  });
});

describe("linkedinHandle", () => {
  it("reads the handle of a saved profile URL", () => {
    expect(linkedinHandle("https://www.linkedin.com/in/Kenny-Wu/")).toBe("kenny-wu");
    expect(linkedinHandle("https://www.facebook.com/kenny")).toBeNull();
    expect(linkedinHandle(null)).toBeNull();
  });
});

describe("readOpenGraph", () => {
  it("reads og tags in either attribute order and decodes entities", () => {
    const html = `<meta property="og:title" content="Kenny Wu on LinkedIn: 很高興加入 &amp; 新團隊">
      <meta content="分享在印度的第一年" property="og:description">`;
    expect(readOpenGraph(html)).toEqual({ title: "Kenny Wu on LinkedIn: 很高興加入 & 新團隊", description: "分享在印度的第一年" });
  });
});
