# Personal CRM

私人人脈管理系統 — Next.js + Supabase，單一使用者。集中管理商業與私人聯絡人、LINE
聯繫資訊、會議紀錄，並能匯入 LINE 聊天記錄、以 AI 擷取人物／議題／待辦，再加上三節與
生日提醒。

## 功能現況

- [x] 登入與權限（Supabase Auth，單一 Email 帳號，禁止公開註冊）
- [x] 共用 UI Design System（shadcn/ui + Tailwind，支援 Light / Dark，桌面側邊欄 + 手機底部導覽）
- [x] 人脈資料庫（F01）：新增、編輯、刪除、搜尋、篩選、產業標籤、疑似重複提示
- [x] LINE 搜尋輔助（F02）：複製 LINE 顯示名稱、嘗試開啟 LINE App、開啟 LINE 連結
- [x] 會議紀錄（F03）：建立、編輯、多人脈關聯、可直接產生後續待辦
- [x] 待辦事項：建立、完成／略過、與人脈或會議關聯
- [x] 三節／生日／自訂提醒（F04/F11）：依農曆換算春節、端午、中秋日期，可產生本年度提醒、
      批次查看、Email 通知（需設定 Resend）
- [x] LINE TXT 聊天記錄匯入（F05/F08）：上傳、本機即時預覽解析結果、參與者對應人脈、
      檔案雜湊與跨批次訊息去重、原始檔存放於私有 Storage bucket
- [x] AI 聊天內容分析（F06/F09）：可替換的 AI 供應商介面、結構化 JSON 擷取（人物／公司／
      討論議題／重要資訊／日期／待辦）、分段處理長對話、逐筆核准／編輯／拒絕、核准後寫入
      人脈或建立待辦
- [x] 聊天紀錄搜尋與檢視（F07/F10）：關鍵字、日期範圍篩選，由 AI 擷取結果可直接跳轉到原始訊息
- [x] 首頁儀表板：待聯繫提醒、待辦事項、近期人脈、最近會議、快速新增/匯入
- [x] 命令選單（⌘K / Ctrl+K）：跳轉頁面、搜尋人脈、快速操作
- [x] 資料匯入匯出（F13）：聯絡人 CSV／XLSX 匯入、聯絡人 CSV 匯出、含原始聊天檔的完整 ZIP 匯出
- [x] 全部 14 張資料表的 SQL schema 與 Row Level Security（`supabase/migrations`）
- [x] **LINE 官方帳號助理**：所有日常操作直接在 LINE 對話框完成（見下方「LINE 助理」）
- [x] 多通訊軟體：人脈可存 LINE ID、WhatsApp 電話、WeChat ID
- [x] 自動化測試：LINE 聊天記錄解析器、農曆節日換算、AI 擷取結構化 schema、CSV 匯出工具、
      LINE 助理的規則式解析（指令、日期、名片欄位）、祝福範本、LINE 簽章與訊息格式

## 技術選型：為什麼不直接採用參考專案

開發前依指示檢視了六個開源專案；結論是沿用既有的 Next.js + Supabase 架構繼續開發，不以任何一個作為基底：

| 專案 | 授權 | 技術棧 | 不採用原因 |
| --- | --- | --- | --- |
| `michellzappa/core-oss` | MIT | Next.js + Supabase + shadcn（與本專案相同） | 僅 4 次 commit，資料模型是 Organizations／Offers／Projects 的 B2B 銷售 CRM，與聯絡人／聊天知識庫的需求不符，可沿用的成熟程式碼有限 |
| `twentyhq/twenty` | 見專案 LICENSE | NestJS + BullMQ + Redis + GraphQL + Nx monorepo | 多租戶 SaaS 等級架構，與「單一開發者可維護」「不引入不必要的基礎設施」要求相反 |
| `moritzWa/orbit` | MIT | Deno + SQLite + React | 產品概念（個人 CRM、去重、許久未聯繫提醒）值得參考，但技術棧（Deno/SQLite）與本專案不相容，且僅 5 次 commit |
| `naiba/bonds` | Business Source License 1.1 | Go + React | BSL 限制商業使用與代管服務、4 年後轉 AGPL，且後端為 Go，與本專案堆疊不相容 |
| `monicahq/monica` | AGPL-3.0 | PHP (Laravel) | 成熟的個人 CRM 資料模型可作為驗證參考，但 AGPL 與 PHP 均與本專案不相容，不適合複製程式碼 |
| `meyfa/line-chat-parser` | MIT | Node.js（無型別） | 專案已於 2024/7 封存（archived），無 TypeScript 型別，且格式假設非針對台灣繁體中文 LINE 匯出（多行訊息、上午/下午時間格式、日期分隔行等），改為自行實作並撰寫單元測試 |

## 技術棧

- **前端**：Next.js 16（App Router）、TypeScript、Tailwind CSS v4、shadcn/ui（Base UI primitives）、cmdk
- **後端／資料**：Supabase（PostgreSQL、Auth、Storage），Row Level Security
- **農曆換算**：lunar-javascript
- **Email**：Resend
- **AI**：可替換供應商介面，預設實作呼叫 Anthropic Messages API
- **匯入匯出**：papaparse（CSV）、SheetJS/xlsx（經由 cdn.sheetjs.com 安裝，見下方安全性說明）、JSZip
- **測試**：Vitest

## 開始使用

1. 建立 Supabase 專案。
2. 在 SQL Editor 依序執行 `supabase/migrations/0001_init.sql`、`0002_storage.sql`。
3. 在 Authentication → Users 手動建立唯一的擁有者帳號（Email + 密碼）。
4. 複製 `.env.example` 為 `.env.local` 並至少填入：
   - `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`（Project Settings → API）
   - `OWNER_EMAIL`（必須與步驟 3 建立的帳號一致）
   - 其餘變數（Email、AI）為選填，缺少時相關功能會顯示明確的「尚未設定」訊息而非報錯
5. 安裝依賴並啟動開發伺服器：

   ```bash
   npm install
   npm run dev
   ```

6. 開啟 http://localhost:3000，以步驟 3 的帳號登入。

## 指令

- `npm run dev` — 開發伺服器
- `npm run build` — production build
- `npm run lint` — ESLint
- `npm test` — Vitest 單元測試

## LINE 助理

免 AI、免費：規則式解析＋按鈕引導，只有圖片辨識用免費的 OCR.space。

**在 LINE 對話框可以做的事**

| 你傳 | 助理做 |
|---|---|
| `新增 王小明 台積電 經理 0912345678 生日3/4` | 自動辨識電話、Email、公司、職稱、生日、LINE/WhatsApp/WeChat 後建檔，缺的欄位一項項問（可略過） |
| 從好友聊天室「轉傳」訊息（可多選） | 先暫存，問「這是跟誰的對話？」（推薦內容裡提到的人、最近的人脈、自我介紹裡的名字），存成他的聊天紀錄，並從內容補上電話／Email／LINE ID／WhatsApp／WeChat／生日（只補空欄位） |
| 名片／好友個人頁／好友名片截圖 | OCR 辨識後直接建檔（附「名字不對」「認錯了刪除」按鈕）；疑似既有人脈時先問是否合併 |
| LINE 匯出的聊天 `.txt` | 匯入聊天紀錄、自動對應或新建人脈，並從對方自己打的訊息補上電話／Email／WhatsApp |
| `找 王小明`、或直接打名字 | 人脈卡（傳訊息、補資料、加待辦、改欄位、刪除） |
| `待辦 寄報價給王小明 明天` | 建立待辦（認得今天/明天/後天/N天後/下週X/10/20），自動關聯提到的人 |
| `會議 王小明 今天談合作…` | 建立會議紀錄並關聯人脈 |
| `備註 王小明 喜歡喝咖啡` | 加到人脈備註（附日期） |
| `今日`／`生日`／`提醒`／`待辦` | 今天要處理的事、30 天內生日、三節問候、待辦清單 |

**每天 09:00（台北）主動推播**：3 天內生日（每人一張祝福卡）、到期的三節問候（一張群發卡＋
可逐一個人化）、其他到期提醒、今天到期的待辦。同一則提醒只推一次；沒事就不推。

**傳訊息按鈕**（祝福文字依老闆／非老闆自動用敬語或輕鬆版，可「換一句」）：
- LINE：開啟好友選擇器並帶入文字，選一位或多位（＝群發）就送出。LINE 沒有提供直接開啟某位
  個人好友聊天室的連結，這是最接近的做法；有 LINE ID 時另可開他的個人頁。
- WhatsApp：`wa.me` 直接開啟與他的聊天並帶入文字。
- WeChat：沒有可直接開聊天的連結，助理會另外傳一則純文字讓你長按複製。

**設定步驟**
1. 在 LINE Developers 建立 Messaging API channel，取得 Channel secret 與長期 Channel access token。
2. 在 LINE Official Account Manager 關閉「自動回應訊息」與「加入好友的歡迎訊息」。
3. 在 Vercel 設定 `LINE_CHANNEL_SECRET`、`LINE_CHANNEL_ACCESS_TOKEN`、`SUPABASE_SERVICE_ROLE_KEY`、
   `CRON_SECRET`、（選用）`OCR_SPACE_API_KEY`，重新部署。
4. 執行 `LINE_CHANNEL_ACCESS_TOKEN=… APP_BASE_URL=https://你的網址 node scripts/line/setup-line.mjs`
   ——設定 webhook 網址並建立圖文選單（今日／新增人脈／找人／待辦／提醒／說明）。
5. 加官方帳號好友並傳任意訊息，助理會回覆你的 userId；設為 `LINE_OWNER_USER_ID` 後重新部署，
   之後只回應你一人，其他人只會收到「私人帳號」的回覆。

**限制**：LINE API 讀不到你的個人聊天與好友資料，助理只看得到你傳給它的內容。「分享好友」
（聯絡人名片）實測 LINE 完全不會送到 webhook，所以改用截圖：傳好友名片或個人頁的截圖，助理會
辨識 LINE 名稱（例如「Kenny吳副 @印度班加」→ 姓名 Kenny 吳副、標註 印度班加）、狀態消息裡的公司／
電話，直接建檔；若名稱裡含有既有人脈的名字，會先問「是這位嗎？」並可合併資料（只補空欄位）。
語音訊息不支援。推播（含每日通知）會計入 LINE 官方帳號的每月免費則數，回覆訊息則不計。

## 部署

本專案設計為部署在 Vercel：

1. 將此 repository 連接至 Vercel 專案。
2. 在 Vercel 專案設定中填入 `.env.example` 所列的環境變數（Production 與 Preview 皆需要）。
3. `vercel.json` 設定了每日 01:00 UTC（台北 09:00）的 Vercel Cron 呼叫 `/api/cron/line-daily`：
   自動補齊本年／明年的三節與生日提醒，並推播到 LINE（需設定 `CRON_SECRET`，Vercel 會自動帶上）。
   Email 通知仍由「提醒」頁面的按鈕手動觸發。
4. Supabase 專案本身的每日備份請在 Supabase Dashboard → Database → Backups 開啟（依方案而定）。

## 資料庫

所有資料表皆以 `owner_id` 搭配 Row Level Security 限制為單一擁有者存取（見
`supabase/migrations/0001_init.sql`）。原始 LINE 聊天檔儲存在私有的 `chat-imports` Storage
bucket（`0002_storage.sql`），依使用者 UID 分資料夾並以 RLS 限制存取，僅能由擁有者的已驗證
工作階段讀取、上傳、刪除。

## 安全性考量

- 僅限單一已知帳號登入（無公開註冊），所有資料表與 Storage bucket 皆有 RLS。
- 網頁的伺服器端 Supabase 用戶端一律帶入當前使用者的 JWT／cookie。`SUPABASE_SERVICE_ROLE_KEY`
  只用在沒有瀏覽器登入狀態的兩個入口：LINE webhook（先驗 `X-Line-Signature`，且只處理
  `LINE_OWNER_USER_ID` 的訊息）與每日推播 cron（驗 `CRON_SECRET`）；這兩處的每個查詢都明確
  加上 `owner_id` 條件（`src/lib/bot/data.ts`、`src/lib/supabase/admin.ts`）。
- AI 與 Email 的 API 金鑰只存在於伺服器環境變數，從未傳遞到瀏覽器。
- 聊天內容一律視為不可信輸入：AI 擷取結果需使用者逐筆核准才會寫入人脈資料／建立待辦，
  絕不自動覆蓋既有欄位值（只會補齊原本是空值的欄位）。
- 上傳檔案有副檔名與檔案大小限制（聊天匯入 .txt ≤ 15MB，聯絡人匯入 .csv/.xlsx ≤ 10MB）。
- `xlsx` 套件改以 SheetJS 官方 CDN（`cdn.sheetjs.com`）安裝，而非 npm registry 上版本較舊、
  已知有 Prototype Pollution／ReDoS 漏洞的版本（npm 上的 `xlsx` 套件長期未修補，SheetJS
  官方建議直接從其 CDN 安裝）；`package.json` 中 `xlsx` 的版本來源即反映此作法。

## 已知限制

- **本機未連接真實 Supabase／AI／Email 服務**：所有功能皆已完整實作並通過 `next build` /
  `tsc` / `eslint` / `vitest`，但由於此開發環境沒有可用的 Supabase 專案、Anthropic API 金鑰
  或 Resend 帳號，無法實際跑過「登入 → 建立人脈 → 匯入聊天 → AI 擷取 → 核准 → 提醒 → Email」
  的完整端對端流程。請依「開始使用」設定好服務後驗證。
- **AI 分析為同步處理、無背景佇列**：長對話會在單次請求內分段（chunk）呼叫 AI 並即時寫入
  資料庫，每個分段處理完成即標記為已分析，因此中途失敗可安全重試（只會處理尚未分析的訊息），
  但沒有真正的背景工作佇列；非常大量的訊息可能受限於單次請求的執行時間。
- **AI 月費用上限尚未強制執行**：`app_settings.ai_monthly_budget_cents` 僅為儲存欄位，目前
  沒有在呼叫 AI 前檢查實際花費並擋下超額呼叫。
- **Email 通知仍為手動觸發**：LINE 推播已每日自動執行；Email 需在「提醒」頁面手動點擊「寄送到期通知」。
- **未進行完整無障礙（a11y）審查**：元件多半繼承 shadcn/ui 既有的鍵盤與 ARIA 支援，但未逐頁
  以螢幕閱讀器驗證。
- **未撰寫端對端（E2E）測試**：自動化測試涵蓋可獨立驗證的業務邏輯（解析器、節日換算、AI
  擷取 schema、CSV 匯出），但沒有 Playwright/Cypress 之類需要真正資料庫與瀏覽器的測試。
