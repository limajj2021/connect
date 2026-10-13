# Personal CRM

私人人脈管理系統（PRD V1.1）— Next.js + Supabase，單一使用者。

## 目前進度：Phase 1（基礎系統）

- [x] 登入與權限（Supabase Auth，單一 Email 帳號，禁止公開註冊）
- [x] 共用 UI Design System（shadcn/ui + Tailwind，支援 Light / Dark）
- [x] 人脈資料庫（F01）：新增、編輯、刪除、搜尋、篩選、疑似重複提示
- [x] LINE 搜尋輔助（F02）：複製 LINE 顯示名稱、嘗試開啟 LINE App
- [x] 手機／桌面響應式版面（側邊欄 + 底部導覽）
- [x] 全部 14 張資料表的 SQL schema 與 RLS（`supabase/migrations`），含 Phase 2–4 尚未建 UI 的表格

尚未實作（依 PRD 第 8 節開發優先順序）：

- Phase 2：會議紀錄、待辦事項、三節／生日／自訂提醒、Email 通知
- Phase 3：LINE TXT 聊天匯入、AI 擷取與審核、聊天紀錄搜尋
- Phase 4：資料匯入匯出、備份驗證、大量資料效能測試

`首頁`、`紀錄`、`提醒`、`設定` 頁面目前以空狀態呈現尚未建置的功能，`人脈` 頁面與詳情頁已可完整使用。

## 技術棧

Next.js 16 (App Router) · TypeScript · Tailwind CSS v4 · shadcn/ui (Base UI primitives) · Supabase (Postgres + Auth + Storage)

## 開始使用

1. 建立 Supabase 專案。
2. 在 SQL Editor 依序執行 `supabase/migrations/0001_init.sql`、`0002_storage.sql`。
3. 在 Authentication → Users 手動建立唯一的擁有者帳號（Email + 密碼）。
4. 複製 `.env.example` 為 `.env.local` 並填入：
   - `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`（Project Settings → API）
   - `OWNER_EMAIL`（必須與步驟 3 建立的帳號一致）
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

## 資料庫

所有資料表皆以 `owner_id` 搭配 Row Level Security 限制為單一擁有者存取（見 `supabase/migrations/0001_init.sql`）。原始 LINE 聊天檔規劃儲存在私有的 `chat-imports` Storage bucket（`0002_storage.sql`），依使用者 UID 分資料夾並以 RLS 限制存取。
