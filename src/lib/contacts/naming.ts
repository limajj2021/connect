import type { GreetingTone, RoleType } from "@/types/database";

/**
 * Names and forms of address. Pure — shared by the greeting templates, the
 * contact form's suggestion chips and the LIFF 稱呼與名字 page.
 */
export interface NamedPerson {
  name: string;
  name_en?: string | null;
  title: string | null;
  role_type: RoleType;
  salutation?: string | null;
  greeting_tone?: GreetingTone | null;
}

const CJK = /[㐀-鿿豈-﫿]+/g;
const LATIN = /[A-Za-z][A-Za-z.'’-]*/g;
const isCjkName = (s: string) => /^[㐀-鿿]{2,4}$/.test(s);

/**
 * "Kenny 吳副" / "王小明 Ming" → { zh: "吳副", en: "Kenny" }: a name typed (or
 * imported from LINE) with both scripts, split into 中文名 and 英文名. Null
 * when there's nothing to split, or it's already split that way.
 */
export function splitName(name: string, nameEn?: string | null): { zh: string; en: string } | null {
  const base = name.split(/[@＠(（]/)[0].trim(); // "Lita @班加羅爾" — the rest is a note, not the name
  const zh = (base.match(CJK) ?? []).join("");
  const en = (base.match(LATIN) ?? []).join(" ");
  if (!zh || !en) return null;
  if (zh === name.trim() && (nameEn ?? "").trim() === en) return null;
  return { zh, en: nameEn?.trim() || en };
}

const HONORIFIC_RULES: [RegExp, string][] = [
  [/董事長|董事/, "董"],
  [/總經理|總裁|執行長|CEO|總監|副總/i, "總"],
  [/經理/, "經理"],
  [/協理/, "協理"],
  [/律師/, "律師"],
  [/會計師/, "會計師"],
  [/醫師/, "醫師"],
  [/教授/, "教授"],
  [/老師/, "老師"],
];

/** 王董 / 陳總 / 林經理 from the title, when the title says so. */
function titleForm(person: NamedPerson): string | null {
  const name = person.name.trim();
  if (!person.title || !isCjkName(name)) return null;
  for (const [re, suffix] of HONORIFIC_RULES) if (re.test(person.title)) return `${name[0]}${suffix}`;
  return null;
}

function englishName(person: NamedPerson): string | null {
  if (person.name_en?.trim()) return person.name_en.trim().split(/\s+/)[0];
  return person.name.match(LATIN)?.[0] ?? null;
}

/** The address used when none was set: the old automatic rule. */
export function derivedSalutation(person: NamedPerson): string {
  const name = person.name.trim();
  const fromTitle = person.role_type === "boss" || person.title ? titleForm(person) : null;
  if (fromTitle) return fromTitle;
  // A boss with no recognisable title: 王總 is the common, safe address in Taiwan.
  if (person.role_type === "boss") return isCjkName(name) ? `${name[0]}總` : name;
  // Casual: 王小明 → 小明; English or 2-char names stay as-is.
  if (isCjkName(name) && name.length === 3) return name.slice(1);
  return name;
}

/** How to address someone in a greeting: what you set, else derived. */
export function salutationFor(person: NamedPerson): string {
  return person.salutation?.trim() || derivedSalutation(person);
}

/** Formal (您) or casual — what you set; else 哥/姐 reads casual, 老闆 formal. */
export function toneFor(person: NamedPerson): GreetingTone {
  if (person.greeting_tone) return person.greeting_tone;
  if (person.salutation && /[哥姐]$/.test(person.salutation.trim())) return "casual";
  return person.role_type === "boss" ? "formal" : "casual";
}

/**
 * One-tap choices for 稱呼: the title form (王董), first name (小明), English
 * name (Kenny), and 哥／姐 forms (Kenny 哥, 小明哥, 王姐) — gender isn't
 * stored, so both are offered.
 */
export function salutationOptions(person: NamedPerson): string[] {
  const name = person.name.trim();
  const zh = (name.match(CJK) ?? []).join("");
  const en = englishName(person);
  const given = isCjkName(zh) && zh.length === 3 ? zh.slice(1) : null;
  const surname = isCjkName(zh) ? zh[0] : null;
  const options = [
    titleForm({ ...person, name: zh || name }),
    given,
    zh || null,
    en,
    en ? `${en} 哥` : null,
    en ? `${en} 姐` : null,
    given ? `${given}哥` : null,
    given ? `${given}姐` : null,
    surname ? `${surname}哥` : null,
    surname ? `${surname}姐` : null,
    surname && !titleForm(person) ? `${surname}總` : null,
  ];
  return [...new Set(options.filter((o): o is string => Boolean(o)))].slice(0, 10);
}
