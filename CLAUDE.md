@AGENTS.md

# 上線流程（每次改完都要照做，不要只推程式）

這個專案的使用者只在手機上用 LINE（CONNECT 官方帳號）和 LIFF 頁面，看不到程式。
「做完」的定義是：**資料庫、程式、圖文選單三樣都已經在線上生效**，不是只 push。

1. **資料庫 migration**（只要新增了 `supabase/migrations/*.sql` 就一定要做，而且要在程式上線前或同時）
   - 用 Supabase Management API 執行，金鑰從環境變數 `SUPABASE_ACCESS_TOKEN` 讀（不要請使用者把金鑰貼進對話）：
     ```bash
     python3 -c "import json,sys;print(json.dumps({'query':open(sys.argv[1]).read()}))" supabase/migrations/000X_xxx.sql > /tmp/q.json
     curl -sS -X POST "https://api.supabase.com/v1/projects/endjnwujhxdpknfhikwa/database/query" \
       -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "content-type: application/json" --data @/tmp/q.json
     ```
   - 執行後用 `information_schema.columns` 查一次，確認欄位真的在。
   - migration 一律寫成可重複執行（`if not exists`、`drop constraint if exists`）。
   - 沒有 `SUPABASE_ACCESS_TOKEN` 時：直接告訴使用者，並給一段可以貼進 Supabase SQL Editor 的完整 SQL；
     新程式會讀新欄位，**migration 沒跑之前，找人／今日／人脈卡都會出錯**。
2. **程式**：push 到 `claude/personal-crm-prd-v1-1-09rh9m` 後 Vercel 會自動部署到
   https://personal-crm-iota-snowy.vercel.app ，用 curl 打一個新路由確認新版已上線。
3. **圖文選單**：改了 `src/lib/line/rich-menu-layout.mjs` 或選單圖（`public/line/`）時，請使用者到
   LINE「工具箱 → 設定」最下方按「更新圖文選單」（伺服器用自己的 LINE token 套用），或有 token 時跑
   `scripts/line/setup-line.mjs`。同一頁的「系統狀態」會顯示資料庫與選單是否為最新。
4. 部署完提醒使用者實際在手機上試哪幾個指令。

已執行過的 migration：0001～0007（0006、0007 於 2026-10-15 執行）。新增 migration 時更新這一行。

# 其他慣例
- 介面與回覆一律繁體中文（台灣用語）。
- 不要在 commit、程式碼或文件裡寫入任何金鑰。
- 只動測試資料，不要改使用者的真實人脈資料。
