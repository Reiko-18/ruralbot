# Supabase 與 Render 遷移紀錄

## 目標

將 RuralBot 的 PostgreSQL 從 Ubuntu 本機遷移至 Supabase，並準備 Render 單實例 Web Service。Bot、Dashboard 與 SmilePay callback 維持在同一程序，避免 Discord token 被多實例重複登入。

## 已完成

- 依 Supabase 官方文件選用東京區 Supavisor Session Pooler `5432`。
- 在 Supabase 套用 5 個既有 Prisma migrations。
- 停止 Ubuntu bot 後執行最終 data-only dump，排除 `_prisma_migrations` 與 Supabase 管理 schema。
- 匯入 20 張業務表，來源與目標逐表 `COUNT(*)` 全部一致。
- 撤銷 `anon` 與 `authenticated` 對業務表的權限，避免 Data API 意外暴露付款與個資。
- Ubuntu `ruralbot.service` 已改連 Supabase 並重新啟動；`/healthz`、guild API、訂單 API 與啟動 cache 載入均通過。
- 每日 02:00 關機 timer 已停用，RTC wake alarm 已清除。
- 新增 `render.yaml`，使用付費 Starter、單實例、`/healthz`、pre-deploy migration 與 secret placeholders。
- 將 production `start` 改為 `tsx dist/index.js`，相容 Prisma 7 產生的 ESM extensionless imports；原生 Node 入口會在載入 Prisma client 時失敗。

## TLS 決策

目前 `pg-connection-string` 會把單獨的 `sslmode=require` 視為 `verify-full`，Supabase pooler 的 CA 未加入 Node trust store 時會出現 `self-signed certificate in certificate chain`。Runtime URL 因此使用：

```text
?uselibpqcompat=true&sslmode=require
```

此設定採 libpq `require` 語意，連線有 TLS 加密但不驗證 CA。Prisma CLI 的 `DIRECT_URL` 保持 `sslmode=require`。後續若從 Supabase Dashboard 取得 CA，應改為 `verify-full` 並顯式配置 CA。

## Render 待完成

Render API 無法抓取私人 repo `Reiko-18/ruralbot`。需先在 Render Dashboard 連結 GitHub 並授權該 repo，之後才能建立服務與注入 runtime secrets。Render workspace 目前也未設定付款方式；若要確保 bot 不休眠，必須使用 `starter` 或更高的付費 instance，不能把 Free Web Service 的外部 ping 當成正式保證。

建立後使用：

- Build：`npm ci && npm run install:dashboard && npm run build`
- Pre-deploy：`npx prisma migrate deploy`
- Start：`npm start`
- Health check：`/healthz`
- Region：`singapore`
- Instances：`1`

`SUPABASE_ACCESS_TOKEN`、`SUPABASE_DB_PASSWORD` 與 publishable key 不需要注入 Render runtime。Render 只取得程式實際使用的 Discord、PostgreSQL、Dashboard 與 SmilePay 變數。

## 切換與回滾

在 Render 完成健康檢查、Discord Ready、Dashboard 與 SmilePay callback 驗證前，保留 Ubuntu 服務與原 PostgreSQL 資料。Render 正式啟動前先停止 Ubuntu `ruralbot.service`，避免同一 Discord token 雙實例登入。若 Render 啟動失敗，停止 Render instance 並重新啟動 Ubuntu service；資料庫持續使用 Supabase，不需回復本機 PostgreSQL。

## 安全提醒

本次對話曾傳輸 Render token、Supabase management token、資料庫密碼與 SSH 密碼。遷移完成後必須輪替這些憑證；任何 secret 都不得提交至 Git、repo 文件或 Obsidian。
