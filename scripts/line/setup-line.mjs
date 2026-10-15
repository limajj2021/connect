#!/usr/bin/env node
/**
 * One-off setup for the LINE OA bot (idempotent — safe to re-run):
 *   1. points the channel's webhook at <APP_BASE_URL>/api/line/webhook and tests it
 *   2. (re)creates the two-tab rich menu (主選單 / 工具箱) from
 *      public/line/rich-menu-{main,tools}.png, links the tabs with rich menu
 *      aliases, and makes 主選單 the default for everyone
 *
 * Re-render the art after changing rich-menu-layout.mjs:
 *   node scripts/line/render-rich-menu.mjs
 *
 * Usage:
 *   LINE_CHANNEL_ACCESS_TOKEN=... APP_BASE_URL=https://your-app.vercel.app [NEXT_PUBLIC_LIFF_ID=...] node scripts/line/setup-line.mjs
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { LAYOUT, MENU_H, MENU_W, TABS } from "../../src/lib/line/rich-menu-layout.mjs";

const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
const baseUrl = process.env.APP_BASE_URL?.replace(/\/$/, "");
if (!token || !baseUrl) {
  console.error("Set LINE_CHANNEL_ACCESS_TOKEN and APP_BASE_URL first.");
  process.exit(1);
}

const API = "https://api.line.me";
const DATA_API = "https://api-data.line.me";
const OLD_MENU_NAME = "personal-crm-main";
const MENU_PREFIX = "personal-crm-tab-";
const liffId = process.env.NEXT_PUBLIC_LIFF_ID;

async function line(method, url, body, contentType = "application/json") {
  const res = await fetch(url, {
    method,
    headers: { authorization: `Bearer ${token}`, ...(body ? { "content-type": contentType } : {}) },
    body: body && contentType === "application/json" ? JSON.stringify(body) : body,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${url} → ${res.status} ${text}`);
  return text ? JSON.parse(text) : {};
}

// 1. Webhook
const endpoint = `${baseUrl}/api/line/webhook`;
await line("PUT", `${API}/v2/bot/channel/webhook/endpoint`, { endpoint });
const test = await line("POST", `${API}/v2/bot/channel/webhook/test`, { endpoint });
console.log("webhook:", endpoint, "test:", test.success ? "OK" : test);

// 2. Rich menu: two tabs (主選單 / 工具箱), switched by tapping the tab bar
// (a "richmenuswitch" action between two rich menu aliases). Layout and art
// come from src/lib/line/rich-menu-layout.mjs / render-rich-menu.mjs. The app
// can do the same from the phone (LIFF 設定 → 更新圖文選單, src/lib/line/rich-menu.ts).
const cmd = (c, label) => ({ type: "postback", label, data: `a=cmd&c=${c}`, displayText: label });

function toAction(a) {
  if (a.cmd) return cmd(a.cmd, a.label);
  if (a.web) return { type: "uri", label: a.label, uri: `${baseUrl}${a.web}?openExternalBrowser=1` };
  if (a.liff) return liffId ? { type: "uri", label: a.label, uri: `https://liff.line.me/${liffId}${a.liff}` } : cmd(a.fallback, a.label);
  throw new Error(`unknown action ${JSON.stringify(a)}`);
}

// Earlier runs (and the old single-tab menu) — removed only after the new
// menus are live and the aliases point at them.
const existing = await line("GET", `${API}/v2/bot/richmenu/list`);
const stale = (existing.richmenus ?? []).filter((m) => m.name === OLD_MENU_NAME || m.name.startsWith(MENU_PREFIX));

const ids = {};
for (const tab of TABS) {
  const tabAreas = TABS.map((t) => ({
    bounds: LAYOUT.tabs[t.key],
    action: { type: "richmenuswitch", label: t.label, richMenuAliasId: t.alias, data: `a=tab&t=${t.key}` },
  }));
  const { richMenuId } = await line("POST", `${API}/v2/bot/richmenu`, {
    size: { width: MENU_W, height: MENU_H },
    selected: tab.key === "main",
    name: `${MENU_PREFIX}${tab.key}`,
    chatBarText: "選單",
    areas: [...tabAreas, ...tab.cells.map((cell) => ({ bounds: cell.bounds, action: toAction(cell.action) }))],
  });
  const image = await readFile(fileURLToPath(new URL(`../../public/line/rich-menu-${tab.key}.png`, import.meta.url)));
  await line("POST", `${DATA_API}/v2/bot/richmenu/${richMenuId}/content`, image, "image/png");
  ids[tab.key] = richMenuId;

  // Point the alias at the new menu (create it the first time).
  try {
    await line("POST", `${API}/v2/bot/richmenu/alias/${tab.alias}`, { richMenuId });
  } catch {
    await line("POST", `${API}/v2/bot/richmenu/alias`, { richMenuAliasId: tab.alias, richMenuId });
  }
  console.log(`rich menu ${tab.key}:`, richMenuId, "alias", tab.alias);
}
await line("POST", `${API}/v2/bot/user/all/richmenu/${ids.main}`);
console.log("default rich menu:", ids.main);
for (const menu of stale) await line("DELETE", `${API}/v2/bot/richmenu/${menu.richMenuId}`);
console.log("removed old menus:", stale.length);
