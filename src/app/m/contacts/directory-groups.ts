/** Grouping for the LIFF contact list (pure, unit-tested). */

export interface DirectoryContact {
  id: string;
  name: string;
  company: string | null;
  title: string | null;
  role_type: string;
  is_important: boolean;
  tags: string[];
  missing: number;
  editUrl: string;
  /** What you last talked about ("上次聊到"), if anything was logged. */
  lastTouch?: { occurred_on: string; content: string } | null;
  /** Last day you talked to or greeted them. */
  lastContactOn?: string | null;
}

export type GroupBy = "tag" | "role" | "important";

export const IMPORTANT_GROUP = "★ 重要人脈（最久沒聯絡的在前）";

export const UNTAGGED = "未加標籤";
const ROLE_LABEL: Record<string, string> = { boss: "老闆", non_boss: "非老闆", unclassified: "未分類" };
const ROLE_ORDER = ["boss", "non_boss", "unclassified"];

export function groupContacts(contacts: DirectoryContact[], by: GroupBy): [string, DirectoryContact[]][] {
  if (by === "important") {
    // Never-contacted first, then the longest-silent.
    const important = contacts
      .filter((c) => c.is_important)
      .sort((a, b) => (a.lastContactOn ?? "").localeCompare(b.lastContactOn ?? "") || a.name.localeCompare(b.name, "zh-Hant"));
    return important.length > 0 ? [[IMPORTANT_GROUP, important]] : [];
  }
  const groups = new Map<string, DirectoryContact[]>();
  const push = (key: string, c: DirectoryContact) => groups.set(key, [...(groups.get(key) ?? []), c]);
  for (const c of contacts) {
    if (by === "role") push(ROLE_LABEL[c.role_type] ?? "未分類", c);
    else if (c.tags.length === 0) push(UNTAGGED, c);
    else for (const tag of c.tags) push(tag, c); // someone with two tags shows under both
  }
  const entries = [...groups.entries()];
  if (by === "role") {
    return entries.sort(
      (a, b) =>
        ROLE_ORDER.indexOf(Object.keys(ROLE_LABEL).find((k) => ROLE_LABEL[k] === a[0]) ?? "") -
        ROLE_ORDER.indexOf(Object.keys(ROLE_LABEL).find((k) => ROLE_LABEL[k] === b[0]) ?? ""),
    );
  }
  // Biggest tags first, untagged last.
  return entries.sort((a, b) => {
    if (a[0] === UNTAGGED) return 1;
    if (b[0] === UNTAGGED) return -1;
    return b[1].length - a[1].length || a[0].localeCompare(b[0], "zh-Hant");
  });
}
