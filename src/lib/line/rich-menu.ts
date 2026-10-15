import "server-only";

import { appBaseUrl } from "./links";
import { lineConfig } from "./config";
import { LAYOUT, MENU_H, MENU_W, TABS } from "./rich-menu-layout.mjs";

/**
 * Installs the two-tab rich menu (主選單 / 工具箱) from the server, with the
 * channel token the app already has — so it can be (re)applied from the
 * phone (LIFF 設定 → 更新圖文選單) without anyone handling the token.
 * Mirrors scripts/line/setup-line.mjs; the art is served from public/line/.
 */
const OLD_MENU_NAME = "personal-crm-main";
export const MENU_PREFIX = "personal-crm-tab-";

type CellAction = { cmd?: string; liff?: string; web?: string; fallback?: string; label: string };

async function lineApi(method: string, url: string, body?: unknown, contentType = "application/json") {
  const res = await fetch(url, {
    method,
    headers: { authorization: `Bearer ${lineConfig().channelAccessToken}`, ...(body ? { "content-type": contentType } : {}) },
    body: body === undefined ? undefined : contentType === "application/json" ? JSON.stringify(body) : (body as BodyInit),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${url.replace(/^https:\/\/[^/]+/, "")} → ${res.status} ${text.slice(0, 200)}`);
  return text ? (JSON.parse(text) as Record<string, unknown>) : {};
}

function toAction(a: CellAction, baseUrl: string, liffId: string | undefined) {
  const cmd = (c: string) => ({ type: "postback", label: a.label, data: `a=cmd&c=${c}`, displayText: a.label });
  if (a.cmd) return cmd(a.cmd);
  if (a.web) return { type: "uri", label: a.label, uri: `${baseUrl}${a.web}?openExternalBrowser=1` };
  if (a.liff) return liffId ? { type: "uri", label: a.label, uri: `https://liff.line.me/${liffId}${a.liff}` } : cmd(a.fallback ?? "help");
  throw new Error(`unknown rich menu action ${JSON.stringify(a)}`);
}

export async function installRichMenus(): Promise<{ main: string; tools: string; removed: number }> {
  const { apiBase, dataApiBase } = lineConfig();
  const baseUrl = appBaseUrl();
  const liffId = process.env.NEXT_PUBLIC_LIFF_ID;

  const existing = (await lineApi("GET", `${apiBase}/v2/bot/richmenu/list`)) as { richmenus?: { richMenuId: string; name: string }[] };
  const stale = (existing.richmenus ?? []).filter((m) => m.name === OLD_MENU_NAME || m.name.startsWith(MENU_PREFIX));

  const ids: Record<string, string> = {};
  for (const tab of TABS) {
    const tabAreas = TABS.map((t) => ({
      bounds: LAYOUT.tabs[t.key as "main" | "tools"],
      action: { type: "richmenuswitch", label: t.label, richMenuAliasId: t.alias, data: `a=tab&t=${t.key}` },
    }));
    const { richMenuId } = (await lineApi("POST", `${apiBase}/v2/bot/richmenu`, {
      size: { width: MENU_W, height: MENU_H },
      selected: tab.key === "main",
      name: `${MENU_PREFIX}${tab.key}`,
      chatBarText: "選單",
      areas: [...tabAreas, ...tab.cells.map((cell) => ({ bounds: cell.bounds, action: toAction(cell.action as CellAction, baseUrl, liffId) }))],
    })) as { richMenuId: string };

    const image = await fetch(`${baseUrl}/line/rich-menu-${tab.key}.png`);
    if (!image.ok) throw new Error(`選單圖片讀取失敗（${image.status}）`);
    await lineApi("POST", `${dataApiBase}/v2/bot/richmenu/${richMenuId}/content`, await image.arrayBuffer(), "image/png");
    ids[tab.key] = richMenuId;

    try {
      await lineApi("POST", `${apiBase}/v2/bot/richmenu/alias/${tab.alias}`, { richMenuId });
    } catch {
      await lineApi("POST", `${apiBase}/v2/bot/richmenu/alias`, { richMenuAliasId: tab.alias, richMenuId });
    }
  }
  await lineApi("POST", `${apiBase}/v2/bot/user/all/richmenu/${ids.main}`);
  for (const menu of stale) await lineApi("DELETE", `${apiBase}/v2/bot/richmenu/${menu.richMenuId}`);
  return { main: ids.main, tools: ids.tools, removed: stale.length };
}

/** Name of the menu everyone currently gets by default ("" when none). */
export async function defaultRichMenuName(): Promise<string> {
  const { apiBase } = lineConfig();
  try {
    const { richMenuId } = (await lineApi("GET", `${apiBase}/v2/bot/user/all/richmenu`)) as { richMenuId?: string };
    if (!richMenuId) return "";
    const menu = (await lineApi("GET", `${apiBase}/v2/bot/richmenu/${richMenuId}`)) as { name?: string };
    return menu.name ?? "";
  } catch {
    return "";
  }
}
