/**
 * Rule-based extraction of contact details from free text — a typed LINE
 * message ("新增 王小明 台積電 經理 0912345678 生日3/4") or OCR output from a
 * business card / profile screenshot. No AI: just Taiwan-centric patterns.
 * Anything it can't find is left undefined so the bot can ask for it.
 */

export interface ContactDraft {
  name?: string;
  company?: string;
  title?: string;
  role_type?: "boss" | "non_boss";
  phone?: string;
  email?: string;
  line_id?: string;
  whatsapp_phone?: string;
  wechat_id?: string;
  line_display_name?: string;
  birthday_month?: number;
  birthday_day?: number;
  birthday_year?: number;
  notes?: string;
}

const FULLWIDTH_RE = /[！-～]/g;

/** Full-width ASCII (０-９, Ａ-Ｚ, ：, ＠ …) → half-width, and unify whitespace. */
export function normalizeText(text: string): string {
  return text
    .replace(FULLWIDTH_RE, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/　/g, " ")
    .replace(/\r\n?/g, "\n");
}

const COMPANY_SUFFIX_RE =
  /(股份有限公司|有限公司|公司|集團|企業社|企業|銀行|證券|保險|事務所|工作室|協會|基金會|學會|大學|學院|醫院|診所|研究院|科技|實業|國際|控股|商行|Inc\.?|Co\.?,?\s*Ltd\.?|Ltd\.?|Corp\.?|Corporation|LLC|GmbH|Group|Studio)/i;

// Longest first so "副總經理" wins over "總經理" and "經理".
const TITLE_KEYWORDS = [
  "董事長", "副董事長", "總經理", "副總經理", "執行長", "營運長", "財務長", "技術長", "行銷長",
  "總裁", "副總裁", "創辦人", "共同創辦人", "負責人", "合夥人", "董事", "監察人", "總監", "副總",
  "協理", "經理", "副理", "襄理", "主任", "組長", "課長", "處長", "部長", "院長", "店長", "廠長",
  "專員", "工程師", "設計師", "顧問", "律師", "會計師", "醫師", "教授", "老師", "秘書", "特助",
  "業務", "主管", "老闆",
  "CEO", "CTO", "CFO", "COO", "CMO", "Founder", "Co-Founder", "President", "Vice President", "VP",
  "Director", "Manager", "Engineer", "Designer", "Consultant", "Partner", "Owner",
].sort((a, b) => b.length - a.length);

const BOSS_TITLE_RE = /(董事長|總經理|執行長|總裁|創辦人|負責人|老闆|合夥人|CEO|Founder|President|Owner)/i;

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
// TW mobile (09xx-xxx-xxx / +886 9xx…), TW landline (02-2345-6789), or international (+…).
const PHONE_RE = /(?:\+?886[\s-]?9\d{2}|09\d{2})[\s-]?\d{3}[\s-]?\d{3}|\(?0\d{1,2}\)?[\s-]?\d{3,4}[\s-]?\d{4}(?:\s*(?:#|ext\.?|分機)\s*\d{1,5})?|\+\d{1,3}(?:[\s-]?\d{2,5}){2,4}/;
const LINE_ID_RE = /(?:LINE\s*(?:ID)?|賴)\s*(?:[:：]|是|為|is)?\s*(@?[A-Za-z0-9._-]{3,30})/i;
const LINE_URL_RE = /line\.me\/(?:R\/)?ti\/p\/~?(@?[A-Za-z0-9._%-]{3,60})/i;
const WECHAT_RE = /(?:WeChat|微信)\s*(?:ID|號|号)?\s*(?:[:：]|是|為|is)?\s*([A-Za-z][A-Za-z0-9_-]{4,40})/i;
const WHATSAPP_RE = /WhatsApp\s*(?:[:：]|是|為|is)?\s*(\+?[\d\s-]{8,20}\d)/i;
const BIRTHDAY_RE = /(?:生日|birthday|bday)\s*[:：]?\s*(?:(\d{4})\s*[/\-.年]\s*)?(\d{1,2})\s*[/\-.月]\s*(\d{1,2})\s*日?/i;
const LABEL_PREFIX_RE = /^(?:姓名|名字|Name|公司|Company|職稱|Title|電話|手機|Tel|Mobile|Phone|Email|E-mail|地址|Address|傳真|Fax)\s*[:：]\s*/i;
const ADDRESS_RE = /(市|縣|區|鄉|鎮|路|街|巷|弄|號|樓|Rd\.?|St\.?|Ave\.?|Floor|F\.)/;
const CJK_NAME_RE = /^[一-鿿]{2,4}$/;
const EN_NAME_RE = /^[A-Z][a-zA-Z'-]+(?:\s+[A-Z][a-zA-Z'-]+){1,2}$/;

export function normalizePhone(raw: string): string {
  const trimmed = raw.trim();
  const plus = trimmed.startsWith("+");
  const digits = trimmed.replace(/[^\d#]/g, "");
  return plus ? `+${digits}` : digits;
}

export function findTitle(text: string): string | undefined {
  for (const keyword of TITLE_KEYWORDS) {
    const re = new RegExp(`[\\u4e00-\\u9fffA-Za-z]{0,4}${keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i");
    const match = text.match(re);
    if (match) return match[0].trim();
  }
  return undefined;
}

export function guessRole(title: string | undefined): "boss" | "non_boss" | undefined {
  if (!title) return undefined;
  return BOSS_TITLE_RE.test(title) ? "boss" : undefined;
}

export function parseBirthday(text: string): { year?: number; month: number; day: number } | undefined {
  const normalized = normalizeText(text).trim();
  const match =
    normalized.match(BIRTHDAY_RE) ??
    normalized.match(/^(?:(\d{4})\s*[/\-.年]\s*)?(\d{1,2})\s*[/\-.月]\s*(\d{1,2})\s*日?$/);
  if (!match) return undefined;
  const year = match[1] ? Number(match[1]) : undefined;
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return undefined;
  if (year !== undefined && (year < 1900 || year > 2100)) return undefined;
  return { year, month, day };
}

/** Pulls structured fields out of free text; returns what it found plus leftover text. */
export function extractContactFields(input: string): { draft: ContactDraft; leftover: string[] } {
  let text = normalizeText(input);
  const draft: ContactDraft = {};

  const take = (re: RegExp, group = 0): string | undefined => {
    const match = text.match(re);
    if (!match) return undefined;
    text = text.replace(match[0], " ");
    return (match[group] ?? match[0]).trim();
  };

  const birthday = text.match(BIRTHDAY_RE);
  if (birthday) {
    const parsed = parseBirthday(birthday[0]);
    if (parsed) {
      draft.birthday_month = parsed.month;
      draft.birthday_day = parsed.day;
      if (parsed.year) draft.birthday_year = parsed.year;
      text = text.replace(birthday[0], " ");
    }
  }

  const whatsapp = take(WHATSAPP_RE, 1);
  if (whatsapp) draft.whatsapp_phone = normalizePhone(whatsapp);
  const wechat = take(WECHAT_RE, 1);
  if (wechat) draft.wechat_id = wechat;
  const lineUrl = take(LINE_URL_RE, 1);
  const email = take(EMAIL_RE);
  if (email) draft.email = email.toLowerCase();
  const lineId = take(LINE_ID_RE, 1);
  if (lineId ?? lineUrl) draft.line_id = decodeURIComponent((lineId ?? lineUrl)!);
  const phone = take(PHONE_RE);
  if (phone) draft.phone = normalizePhone(phone);

  const leftover: string[] = [];
  const segments = text
    .split(/\n|[,，、;；|｜]|\s{2,}/)
    .flatMap((line) => line.split(/\s+(?=[一-鿿])|(?<=[一-鿿])\s+/))
    .map((s) => s.replace(LABEL_PREFIX_RE, "").trim())
    .filter(Boolean);

  for (const segment of segments) {
    if (!draft.company && COMPANY_SUFFIX_RE.test(segment) && !ADDRESS_RE.test(segment.replace(COMPANY_SUFFIX_RE, ""))) {
      draft.company = segment;
      continue;
    }
    const title = findTitle(segment);
    if (title && !draft.title) {
      // "王小明 經理" written without a space → split the name back out.
      const rest = segment.replace(title, "").trim();
      draft.title = title;
      if (rest && !draft.name && (CJK_NAME_RE.test(rest) || EN_NAME_RE.test(rest))) draft.name = rest;
      else if (rest) leftover.push(rest);
      continue;
    }
    if (!draft.name && (CJK_NAME_RE.test(segment) || EN_NAME_RE.test(segment))) {
      draft.name = segment;
      continue;
    }
    leftover.push(segment);
  }

  draft.role_type = guessRole(draft.title);
  if (!draft.role_type) delete draft.role_type;
  return { draft, leftover };
}

/**
 * For typed commands ("新增 王小明 台積電 0912…") the first word is the name by
 * convention, even when it doesn't look like a typical 2–4 character name.
 */
export function extractFromCommand(args: string): ContactDraft {
  const normalized = normalizeText(args).trim();
  if (!normalized) return {};
  const [first, ...rest] = normalized.split(/\s+/);
  const { draft, leftover } = extractContactFields(rest.join(" "));
  const firstIsField =
    EMAIL_RE.test(first) || PHONE_RE.test(first) || COMPANY_SUFFIX_RE.test(first) || BIRTHDAY_RE.test(first);
  if (firstIsField) {
    const all = extractContactFields(normalized);
    return withNotes(all.draft, all.leftover);
  }
  if (draft.name) {
    // The rest of the line had its own name-looking word (e.g. "台積電" is 3
    // CJK characters) — the name slot is taken by `first`, so treat it as text.
    leftover.unshift(draft.name);
    delete draft.name;
  }
  // "林總經理" → name 林, title 總經理.
  const gluedTitle = TITLE_KEYWORDS.find((keyword) => first.length > keyword.length && first.endsWith(keyword));
  if (gluedTitle && !draft.title) {
    draft.title = gluedTitle;
    draft.role_type = guessRole(gluedTitle) ?? draft.role_type;
    draft.name = first.slice(0, -gluedTitle.length);
  } else {
    draft.name = first;
  }
  if (draft.name && leftover.length > 0 && !draft.company) {
    // A bare word after the name with no other signal is most often the company.
    draft.company = leftover.shift();
  }
  return withNotes(draft, leftover);
}

function withNotes(draft: ContactDraft, leftover: string[]): ContactDraft {
  if (leftover.length > 0) draft.notes = leftover.join(" ");
  if (!draft.role_type) delete draft.role_type;
  return draft;
}

// Words from LINE's own UI that show up in screenshots of a shared contact
// card or a profile page — never part of the person's details.
const SCREEN_NOISE_RE =
  /^(?:view profile|查看個人檔案|個人檔案|加入好友|add friend|add|chat|聊天|語音通話|視訊通話|免費通話|免費視訊|voice call|video call|keep|主頁|home|投稿|posts?|封鎖|block|分享|share|已讀|read|通話|追蹤|follow|相簿|筆記|編輯|edit|設定|settings|\d{1,2}:\d{2}\s*(?:am|pm)?|(?:上午|下午)\s*\d{1,2}:\d{2})$/i;
const PROFILE_MARKER_RE = /^(?:view profile|查看個人檔案|加入好友|add friend|語音通話|視訊通話|voice call|video call|免費通話)$/i;
// WhatsApp's contact page ("Contact info"): rows under the name and number.
const WHATSAPP_MARKER_RE =
  /^(?:media,? links,? and docs|disappearing messages|lock chat|chat theme|save to photos|advanced chat privacy|encryption|媒體、連結(?:和|與)文件|訊息自動銷毀|限時訊息|鎖定聊天|聊天主題|進階聊天隱私|加密)/i;
const CONTACT_PAGE_RE = /^(?:contact info|聯絡人資訊|聯絡資訊|聯絡人資料|business info|商業帳號資訊)$/i;
// Buttons and setting rows on app profile pages.
const APP_UI_RE =
  /^(?:<|>|contact info|聯絡人資訊|聯絡資訊|voice|video|search|語音|視訊|搜尋|audio|pay|付款|manage storage|管理儲存空間|starred|已加星號|notifications|通知|.*[>›»]\s*)$/i;
const DECORATION_RE = /^[\s*★☆♡♥✨🌟~～|｜·•]+|[\s*★☆♡♥✨🌟~～|｜·•]+$/gu;

/**
 * Rejects OCR junk read from status-bar icons and the like ("ıııl·", "٠١١١١٠"):
 * a name needs at least two Chinese/Latin letters, and mostly letters.
 */
export function isPlausibleName(value: string): boolean {
  const compact = value.replace(/\s+/g, "");
  if (compact.length < 2 || compact.length > 60) return false;
  const letters = (compact.match(/[\p{Script=Han}A-Za-z]/gu) ?? []).length;
  return letters >= 2 && letters >= compact.length * 0.5;
}

/** A line that is nothing but a phone number ("+91 6364 933 033"). */
function wholePhone(line: string): string | undefined {
  const match = line.match(PHONE_RE);
  if (!match || match[0].replace(/\D/g, "").length < 8) return undefined;
  return line.replace(match[0], "").trim().length <= 2 ? normalizePhone(match[0]) : undefined;
}

/** A single person's page (LINE profile, WhatsApp "Contact info"…), not a list. */
export function looksLikeProfilePage(ocrText: string): boolean {
  return normalizeText(ocrText)
    .split("\n")
    .some((line) => {
      const l = line.trim();
      return PROFILE_MARKER_RE.test(l) || WHATSAPP_MARKER_RE.test(l) || CONTACT_PAGE_RE.test(l);
    });
}

/** True when OCR text came from a LINE contact card / profile page screenshot. */
export function looksLikeLineProfile(ocrText: string): boolean {
  return normalizeText(ocrText)
    .split("\n")
    .some((line) => PROFILE_MARKER_RE.test(line.trim()));
}

/**
 * Splits a LINE display name the way people actually write them in Taiwan:
 * "Kenny吳副 @印度班加*" → name "Kenny 吳副", tag "印度班加";
 * "Alex黃天倫*達興實業" → name "Alex 黃天倫", tag "達興實業";
 * "王小明-台積電" → name "王小明", company "台積電".
 */
export function parseLineDisplayName(raw: string, app: "LINE" | "WhatsApp" = "LINE"): ContactDraft {
  const displayName = normalizeText(raw).replace(DECORATION_RE, "").trim();
  if (!displayName) return {};
  const draft: ContactDraft = app === "LINE" ? { line_display_name: displayName } : {};

  // "@" or an inner "*" separates the name from a group/title note.
  const [beforeAt, ...afterAt] = displayName.split(/[@*]/);
  let namePart = beforeAt.trim();
  const tags: string[] = [];
  const tag = afterAt.join(" ").replace(DECORATION_RE, "").trim();
  if (tag) tags.push(tag);

  // "王小明-台積電" / "王小明｜業務" / "王小明 (台積電)"
  const split = namePart.match(/^(.+?)\s*[-–—|/_(（]\s*(.+?)[)）]?$/);
  if (split) {
    namePart = split[1].trim();
    tags.push(split[2].trim());
  }
  if (!namePart) namePart = tag;

  for (const t of tags) {
    if (!draft.company && COMPANY_SUFFIX_RE.test(t)) draft.company = t;
    else if (!draft.title && findTitle(t)) draft.title = findTitle(t);
  }
  const otherTags = tags.filter((t) => t !== draft.company && !(draft.title && t.includes(draft.title)));
  if (app !== "LINE" && displayName !== namePart) draft.notes = `${app} 名稱：${displayName}`;
  else if (otherTags.length > 0) draft.notes = `LINE 名稱標註：${otherTags.join("、")}`;

  // "Kenny吳副" → "Kenny 吳副": readable spacing between Latin and CJK.
  draft.name = namePart
    .replace(/([A-Za-z])(?=[\u4e00-\u9fff])/g, "$1 ")
    .replace(/([\u4e00-\u9fff])(?=[A-Za-z])/g, "$1 ")
    .slice(0, 100);
  if (/[董總](?:\s|$)/.test(draft.name) || BOSS_TITLE_RE.test(draft.name)) draft.role_type = "boss";
  return draft;
}

export interface ScreenshotDraft {
  draft: ContactDraft;
  /** False when the name is a guess — the bot then asks before creating. */
  sure: boolean;
}

/** OCR output from a business card, a LINE / WhatsApp profile, or a contact card. */
export function extractFromScreenshot(ocrText: string): ScreenshotDraft {
  const all = normalizeText(ocrText)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const lines = all.filter((line) => !SCREEN_NOISE_RE.test(line) && !APP_UI_RE.test(line));

  // WhatsApp-style contact page: the name sits right above the phone number.
  const isWhatsApp = all.some((line) => WHATSAPP_MARKER_RE.test(line));
  if (isWhatsApp || all.some((line) => CONTACT_PAGE_RE.test(line))) {
    const phoneAt = lines.findIndex((line) => wholePhone(line));
    const nameLine =
      phoneAt > 0 ? lines.slice(0, phoneAt).reverse().find(isPlausibleName) : lines.find(isPlausibleName);
    if (nameLine) {
      const draft = parseLineDisplayName(nameLine, isWhatsApp ? "WhatsApp" : "LINE");
      if (!isWhatsApp) delete draft.line_display_name;
      if (phoneAt >= 0) {
        draft.phone = wholePhone(lines[phoneAt]);
        if (isWhatsApp) draft.whatsapp_phone = draft.phone;
      }
      return { draft, sure: phoneAt > 0 };
    }
  }

  const named = lines.filter(isPlausibleName);
  if (looksLikeLineProfile(ocrText) && named.length > 0) {
    // LINE profile / shared contact card: the display name comes first, then
    // (on a profile page) the status message, which often has company/title.
    const draft = parseLineDisplayName(named[0]);
    const rest = lines.slice(lines.indexOf(named[0]) + 1).join("\n");
    if (rest) {
      const { draft: more, leftover } = extractContactFields(rest);
      for (const [key, value] of Object.entries(more)) {
        if (value !== undefined && key !== "name" && !(key in draft)) (draft as Record<string, unknown>)[key] = value;
      }
      const status = [more.name, ...leftover].filter(Boolean).join(" ");
      if (status) draft.notes = [draft.notes, `狀態消息：${status}`].filter(Boolean).join("\n").slice(0, 500);
    }
    return { draft, sure: true };
  }

  const { draft, leftover } = extractContactFields(lines.join("\n"));
  // A card-like name pattern is trusted only next to real contact details.
  const sure = Boolean(draft.name && (draft.phone || draft.email || draft.company || draft.title || draft.line_id));
  // On a card the name is usually the shortest CJK line near the top; if the
  // strict pattern didn't hit, fall back to the first short line (a guess).
  if (!draft.name) {
    const candidate = leftover.find(
      (s) => s.length >= 2 && s.length <= 12 && !/\d/.test(s) && !ADDRESS_RE.test(s) && isPlausibleName(s),
    );
    if (candidate) {
      draft.name = candidate;
      leftover.splice(leftover.indexOf(candidate), 1);
    }
  }
  const noise = leftover.filter((s) => s.length > 1);
  if (noise.length > 0) draft.notes = `名片/截圖其他文字：${noise.join(" / ")}`.slice(0, 500);
  return { draft, sure };
}

export function extractFromOcr(ocrText: string): ContactDraft {
  return extractFromScreenshot(ocrText).draft;
}
