/**
 * LinkedIn / Facebook links pasted or shared into the chat: is it someone's
 * profile (save it on their contact) or one of their posts (archive it on
 * their timeline as 動態)? Neither platform lets anyone read other people's
 * posts through an API, so posts get here because you shared them.
 */

export type SocialPlatform = "linkedin" | "facebook";

export interface SocialLink {
  platform: SocialPlatform;
  kind: "profile" | "post";
  url: string;
  /** LinkedIn's vanity name ("wang-xiaoming-123") when the URL carries one — matches a saved profile. */
  handle?: string;
}

export const PLATFORM_LABEL: Record<SocialPlatform, string> = { linkedin: "LinkedIn", facebook: "Facebook" };

const URL_RE = /https?:\/\/[^\s<>"'，。、）)]+/gi;

// facebook.com/<this> is never a person's profile.
const FB_RESERVED = new Set([
  "share", "sharer", "sharer.php", "groups", "events", "pages", "watch", "reel", "reels", "stories", "story.php",
  "permalink.php", "photo", "photo.php", "photos", "videos", "video.php", "marketplace", "gaming", "login", "help",
  "hashtag", "notes", "media", "l.php", "dialog", "plugins", "business", "ads", "home.php", "search",
]);

export function parseSocialUrl(raw: string): SocialLink | null {
  let url: URL;
  try {
    url = new URL(raw.replace(/[.,!?]+$/, ""));
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase().replace(/^(www|m|mobile|tw|zh-tw)\./, "");
  const parts = url.pathname.split("/").filter(Boolean);
  // Tracking parameters make the same post look like a new link every time.
  const clean = (keep: string[] = []) => {
    const copy = new URL(url.toString());
    for (const key of [...copy.searchParams.keys()]) if (!keep.includes(key)) copy.searchParams.delete(key);
    copy.hash = "";
    return copy.toString().replace(/\/$/, "");
  };

  if (host === "linkedin.com" || host.endsWith(".linkedin.com")) {
    if (parts[0] === "in" && parts[1]) return { platform: "linkedin", kind: "profile", url: clean(), handle: decodeURIComponent(parts[1]).toLowerCase() };
    if (parts[0] === "posts" && parts[1]) {
      // /posts/<vanity>_<slug>-activity-123…
      const handle = decodeURIComponent(parts[1]).split("_")[0]?.toLowerCase();
      return { platform: "linkedin", kind: "post", url: clean(), ...(handle ? { handle } : {}) };
    }
    if (parts[0] === "feed" || parts[0] === "pulse") return { platform: "linkedin", kind: "post", url: clean() };
    return null;
  }
  if (host === "lnkd.in") return { platform: "linkedin", kind: "post", url: clean() };

  if (host === "facebook.com" || host === "fb.com" || host === "fb.me" || host === "fb.watch") {
    if (host === "fb.me" || host === "fb.watch") return { platform: "facebook", kind: "post", url: clean() };
    if (parts[0] === "profile.php") return url.searchParams.get("id") ? { platform: "facebook", kind: "profile", url: clean(["id"]) } : null;
    if (parts[0] === "people" && parts[2]) return { platform: "facebook", kind: "profile", url: clean() };
    if (parts.length === 0) return null;
    const first = parts[0].toLowerCase();
    if (FB_RESERVED.has(first)) {
      if (["share", "permalink.php", "story.php", "photo", "photo.php", "reel", "watch", "videos", "groups"].includes(first)) {
        return { platform: "facebook", kind: "post", url: clean(["story_fbid", "id", "fbid", "v"]) };
      }
      return null;
    }
    // facebook.com/<user>/posts/… , /<user>/videos/…  vs  facebook.com/<user>
    if (parts.length >= 2) return { platform: "facebook", kind: "post", url: clean() };
    return { platform: "facebook", kind: "profile", url: clean() };
  }
  return null;
}

/** Every LinkedIn / Facebook link in a message, in order. */
export function findSocialLinks(text: string): SocialLink[] {
  return [...text.matchAll(URL_RE)].map((m) => parseSocialUrl(m[0])).filter((l): l is SocialLink => Boolean(l));
}

/** The message minus its URLs — what you typed alongside the link ("升任副總了！"). */
export function textWithoutUrls(text: string): string {
  return text
    .replace(URL_RE, " ")
    .replace(/(^|\s)[。，、,.!！?？]+(?=\s|$)/g, " ") // punctuation left dangling after the link
    .replace(/\s+/g, " ")
    .trim();
}

/** The vanity handle of a saved LinkedIn profile URL. */
export function linkedinHandle(profileUrl: string | null | undefined): string | null {
  if (!profileUrl) return null;
  const parsed = parseSocialUrl(profileUrl);
  return parsed?.platform === "linkedin" && parsed.kind === "profile" ? (parsed.handle ?? null) : null;
}

/** og:title / og:description from a public post page (a LinkedIn public post usually has them; Facebook rarely). */
export function readOpenGraph(html: string): { title?: string; description?: string } {
  const meta = (prop: string) => {
    const re = new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']*)["']|<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${prop}["']`, "i");
    const m = html.match(re);
    const value = m?.[1] ?? m?.[2];
    return value ? decodeEntities(value).trim() : undefined;
  };
  return { title: meta("og:title"), description: meta("og:description") ?? meta("description") };
}

function decodeEntities(value: string) {
  return value
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}
