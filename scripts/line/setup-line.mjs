#!/usr/bin/env node
/**
 * One-off setup for the LINE OA bot (idempotent — safe to re-run):
 *   1. points the channel's webhook at <APP_BASE_URL>/api/line/webhook and tests it
 *   2. (re)creates the 6-button rich menu from scripts/line/rich-menu.png and
 *      makes it the default for everyone who adds the account
 *
 * Usage:
 *   LINE_CHANNEL_ACCESS_TOKEN=... APP_BASE_URL=https://your-app.vercel.app [NEXT_PUBLIC_LIFF_ID=...] node scripts/line/setup-line.mjs
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
const baseUrl = process.env.APP_BASE_URL?.replace(/\/$/, "");
if (!token || !baseUrl) {
  console.error("Set LINE_CHANNEL_ACCESS_TOKEN and APP_BASE_URL first.");
  process.exit(1);
}

const API = "https://api.line.me";
const DATA_API = "https://api-data.line.me";
const MENU_NAME = "personal-crm-main";
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

// 2. Rich menu: 2500x843, two rows of three.
const W = 2500;
const H = 843;
const cell = (col, row) => ({ x: Math.round((W / 3) * col), y: Math.round((H / 2) * row), width: Math.round(W / 3), height: Math.round(H / 2) });
const cmd = (c, label) => ({ type: "postback", label, data: `a=cmd&c=${c}`, displayText: label });

const existing = await line("GET", `${API}/v2/bot/richmenu/list`);
for (const menu of existing.richmenus ?? []) {
  if (menu.name === MENU_NAME) await line("DELETE", `${API}/v2/bot/richmenu/${menu.richMenuId}`);
}

const { richMenuId } = await line("POST", `${API}/v2/bot/richmenu`, {
  size: { width: W, height: H },
  selected: true,
  name: MENU_NAME,
  chatBarText: "選單",
  areas: [
    { bounds: cell(0, 0), action: cmd("today", "今日") },
    { bounds: cell(1, 0), action: cmd("add", "新增人脈") },
    // 人脈 opens the LIFF contact list when a LIFF app is configured.
    {
      bounds: cell(2, 0),
      action: liffId ? { type: "uri", label: "人脈", uri: `https://liff.line.me/${liffId}/contacts` } : cmd("search", "找人"),
    },
    { bounds: cell(0, 1), action: cmd("tasks", "待辦") },
    { bounds: cell(1, 1), action: cmd("reminders", "提醒") },
    { bounds: cell(2, 1), action: cmd("help", "說明") },
  ],
});
const image = await readFile(fileURLToPath(new URL("./rich-menu.png", import.meta.url)));
await line("POST", `${DATA_API}/v2/bot/richmenu/${richMenuId}/content`, image, "image/png");
await line("POST", `${API}/v2/bot/user/all/richmenu/${richMenuId}`);
console.log("rich menu:", richMenuId, "set as default");
