#!/usr/bin/env node
/**
 * Renders the two rich-menu tabs (主選單 / 工具箱) to PNG with headless
 * Chromium into public/line/, so the menu art always matches the tap areas
 * (both come from src/lib/line/rich-menu-layout.mjs).
 *
 *   node scripts/line/render-rich-menu.mjs
 *
 * Needs Playwright (not a project dependency): either installed in the
 * project, or point PLAYWRIGHT_MODULE at an installed copy, e.g.
 *   PLAYWRIGHT_MODULE=/opt/node-tools/node_modules/playwright/index.mjs
 */
import { writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

import { LAYOUT, MENU_H, MENU_W, TABS } from "../../src/lib/line/rich-menu-layout.mjs";

async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch {
    if (!process.env.PLAYWRIGHT_MODULE) throw new Error("Playwright not found — set PLAYWRIGHT_MODULE");
    return import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
  }
}

async function icon(name, size, color) {
  const url = new URL(`../../node_modules/lucide-react/dist/esm/icons/${name}.mjs`, import.meta.url);
  const { __iconData } = await import(url.href);
  const children = __iconData.node
    .map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).filter(([k]) => k !== "key").map(([k, v]) => `${k}="${v}"`).join(" ")}/>`)
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${children}</svg>`;
}

const css = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { width: ${MENU_W}px; height: ${MENU_H}px; background: #ececec; font-family: "Noto Sans TC", "WenQuanYi Zen Hei", sans-serif; color: #2b2b2b; position: relative; overflow: hidden; }
  .tabbar { position: absolute; left: 0; top: 0; width: ${MENU_W}px; height: ${LAYOUT.tabH}px; background: #ffffff; }
  .tab { position: absolute; top: 0; height: ${LAYOUT.tabH}px; display: flex; align-items: center; justify-content: center; font-size: 84px; font-weight: 900; letter-spacing: 18px; color: #2b2b2b; }
  .tab.active { background: #f7c948; color: #3b2f00; }
  .tab.left.active { clip-path: polygon(0 0, 100% 0, calc(100% - 110px) 100%, 0 100%); }
  .tab.right.active { clip-path: polygon(110px 0, 100% 0, 100% 100%, 0 100%); }
  .tile { position: absolute; border-radius: 44px; background: #ffffff; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 34px; box-shadow: 0 6px 0 rgba(0,0,0,0.06); }
  .tile .label { font-size: 76px; font-weight: 800; letter-spacing: 8px; }
  .tile.accent { background: #f7c948; }
  .tile.accent .label { color: #3b2f00; }
  .tile.wide { flex-direction: row; gap: 48px; }
  .tile .sub { font-size: 46px; color: #6e5a12; font-weight: 600; letter-spacing: 2px; margin-top: 18px; }
  .hero { position: absolute; border-radius: 52px; overflow: hidden; background: linear-gradient(135deg, #ffd96a 0%, #f7c948 45%, #f0a91c 100%); display: flex; align-items: center; padding: 0 110px; }
  .hero .text { flex: 1; color: #3b2f00; }
  .hero .title { font-size: 190px; font-weight: 900; letter-spacing: 20px; line-height: 1; }
  .hero .desc { font-size: 64px; font-weight: 700; margin-top: 46px; line-height: 1.35; color: #5a4700; }
  .hero .badge { display: inline-block; margin-top: 54px; padding: 16px 46px; border-radius: 999px; background: #3b2f00; color: #f7c948; font-size: 52px; font-weight: 800; letter-spacing: 4px; }
  .hero .art { width: 520px; height: 520px; border-radius: 50%; background: rgba(255,255,255,0.35); display: flex; align-items: center; justify-content: center; }
`;

async function tabHtml(tab) {
  const parts = [`<div class="tabbar"></div>`];
  for (const t of TABS) {
    const b = LAYOUT.tabs[t.key];
    parts.push(`<div class="tab ${t.key === "main" ? "left" : "right"} ${t.key === tab.key ? "active" : ""}" style="left:${b.x}px;width:${b.width}px">${t.label}</div>`);
  }
  for (const cell of tab.cells) {
    const b = cell.bounds;
    const pos = `left:${b.x + 16}px;top:${b.y + 16}px;width:${b.width - 32}px;height:${b.height - 32}px`;
    if (cell.hero) {
      parts.push(`<div class="hero" style="${pos}">
        <div class="text"><div class="title">${cell.label}</div><div class="desc">${cell.desc.replace(/\n/g, "<br>")}</div><div class="badge">${cell.badge}</div></div>
        <div class="art">${await icon(cell.icon, 330, "#3b2f00")}</div>
      </div>`);
    } else {
      const wide = b.width > b.height * 1.4;
      parts.push(`<div class="tile ${cell.accent ? "accent" : ""} ${wide ? "wide" : ""}" style="${pos}">
        ${await icon(cell.icon, wide ? 150 : 170, cell.accent ? "#3b2f00" : "#2b2b2b")}
        <div>${`<div class="label">${cell.label}</div>`}${cell.desc && wide ? `<div class="sub">${cell.desc}</div>` : ""}</div>
      </div>`);
    }
  }
  return `<!doctype html><html><head><meta charset="utf-8">
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@600;700;800;900&display=block">
    <style>${css}</style></head><body>${parts.join("\n")}</body></html>`;
}

const { chromium } = await loadPlaywright();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: MENU_W, height: MENU_H } });
for (const tab of TABS) {
  const html = await tabHtml(tab);
  // Web font when reachable; otherwise the local CJK font in the stack.
  await page.setContent(html, { waitUntil: "networkidle", timeout: 15_000 }).catch(() => page.setContent(html));
  await page.evaluate(() => document.fonts.ready);
  const out = fileURLToPath(new URL(`../../public/line/rich-menu-${tab.key}.png`, import.meta.url));
  await writeFile(out, await page.screenshot({ type: "png" }));
  console.log("wrote", out);
}
await browser.close();
