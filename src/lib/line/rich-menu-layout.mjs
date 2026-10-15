/**
 * The two rich-menu tabs, shared by scripts/line/render-rich-menu.mjs (the
 * art), scripts/line/setup-line.mjs and src/lib/line/rich-menu.ts (the tap
 * areas) so they can never drift apart.
 *
 * 2500×1686 (LINE's full-height size). Top: a tab bar to switch between
 * 主選單 (what you do daily) and 工具箱 (settings & occasional tools).
 * Below: one big hero tile, two tiles beside it, and a row of small tiles.
 */
export const MENU_W = 2500;
export const MENU_H = 1686;

const tabH = 230;
const heroW = 1640;
const rowA = { y: tabH + 10, h: 830 };
const rowB = { y: rowA.y + rowA.h, h: MENU_H - (rowA.y + rowA.h) - 10 };
const sideX = 20 + heroW;
const sideW = MENU_W - sideX - 20;

const hero = { x: 20, y: rowA.y, width: heroW, height: rowA.h };
const sideTop = { x: sideX, y: rowA.y, width: sideW, height: Math.round(rowA.h / 2) };
const sideBottom = { x: sideX, y: rowA.y + Math.round(rowA.h / 2), width: sideW, height: rowA.h - Math.round(rowA.h / 2) };
const bottomRow = (count) => {
  const w = (MENU_W - 40) / count;
  return Array.from({ length: count }, (_, i) => ({ x: Math.round(20 + w * i), y: rowB.y, width: Math.round(w), height: rowB.h }));
};

export const LAYOUT = {
  tabH,
  tabs: {
    main: { x: 0, y: 0, width: MENU_W / 2, height: tabH },
    tools: { x: MENU_W / 2, y: 0, width: MENU_W / 2, height: tabH },
  },
};

// `action` describes what a tap does; setup-line.mjs turns it into a LINE action:
//   { cmd: "today" }      → postback a=cmd&c=today (the bot replies)
//   { liff: "/contacts" } → opens that LIFF page (falls back to a command without a LIFF app)
//   { web: "/" }          → the web app
const main4 = bottomRow(4);
const tools3 = bottomRow(3);

export const TABS = [
  {
    key: "main",
    alias: "crm-main",
    label: "主選單",
    cells: [
      { bounds: hero, hero: true, label: "今日", desc: "今天要聯絡誰\n生日・節日・久沒聯絡・待辦", badge: "點我看今天 →", icon: "sun", action: { cmd: "today", label: "今日" } },
      { bounds: sideTop, label: "人脈", desc: "依標籤找人", icon: "users", accent: true, action: { liff: "/contacts", fallback: "search", label: "人脈" } },
      { bounds: sideBottom, label: "提醒", desc: "生日與節日", icon: "bell", action: { cmd: "reminders", label: "提醒" } },
      { bounds: main4[0], label: "久沒聯絡", icon: "hourglass", action: { cmd: "keep", label: "久沒聯絡" } },
      { bounds: main4[1], label: "找人", icon: "search", action: { cmd: "search", label: "找人" } },
      { bounds: main4[2], label: "轉傳紀錄", icon: "messages-square", action: { cmd: "collect", label: "轉傳紀錄" } },
      { bounds: main4[3], label: "記動態", icon: "megaphone", action: { cmd: "post", label: "記動態" } },
    ],
  },
  {
    key: "tools",
    alias: "crm-tools",
    label: "工具箱",
    cells: [
      { bounds: hero, hero: true, label: "節日", desc: "自己加節日、改日期\n提前幾天提醒", badge: "編輯節日 →", icon: "party-popper", action: { liff: "/occasions", fallback: "reminders", label: "節日" } },
      { bounds: sideTop, label: "設定", desc: "所有設定", icon: "settings", accent: true, action: { liff: "/settings", fallback: "help", label: "設定" } },
      { bounds: sideBottom, label: "節慶開關", desc: "誰要收問候", icon: "calendar-heart", action: { liff: "/festival-settings", fallback: "reminders", label: "節慶開關" } },
      { bounds: tools3[0], label: "標籤管理", icon: "tag", action: { liff: "/tags", fallback: "help", label: "標籤" } },
      { bounds: tools3[1], label: "重要人脈", icon: "star", action: { liff: "/contacts?view=important", fallback: "keep", label: "重要人脈" } },
      { bounds: tools3[2], label: "網頁後台", icon: "monitor", action: { web: "/", label: "網頁後台" } },
    ],
  },
];
