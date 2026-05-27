# 2026-05-27 依賴與設定問題修復紀錄

## 修復範圍

- 移除 `dashboard/tsconfig.json` 的 `baseUrl`，保留 `@/*` paths alias，消除 TypeScript 6.0 deprecation problem。
- 將 `@prisma/client`、`@prisma/adapter-pg`、`prisma` 對齊到 `7.8.0`。
- 使用 npm `overrides` 將 Prisma CLI 的 transitive `@hono/node-server` 覆寫到 `1.19.13`，避免 `npm audit fix --force` 將 Prisma 7 破壞性降版到 Prisma 6。
- 新增 `.env.example`，列出 Discord、PostgreSQL/Prisma、dashboard HTTP 與 SmilePay 必要環境變數。
- 拆分根目錄 scripts：
  - `install:dashboard`
  - `install:all`
  - `build:server`
  - `build:dashboard`
  - `build`
- 更新 `ops/` 範本，預設部署路徑統一為 `/var/www/ruralbot`，並保留 `RURALBOT_APP_DIR` 覆蓋。
- 允許 `.env.example` 進入版本控制，仍忽略實際 `.env` 與 `.env.*`。

## 驗證

- `npm.cmd ci`：根目錄通過。
- `npm.cmd run install:dashboard`：dashboard 依賴安裝通過。
- `npm.cmd audit --audit-level=moderate`：根目錄 0 vulnerabilities。
- `cd dashboard; npm.cmd audit --audit-level=moderate`：0 vulnerabilities。
- `npm.cmd exec tsc -- --noEmit --pretty false`：根目錄通過。
- `cd dashboard; npm.cmd exec tsc -- --noEmit --pretty false`：通過。
- `node --check deploy-commands.mjs`：通過。
- `DIRECT_URL=postgresql://user:pass@localhost:5432/ruralbot npm.cmd run build`：通過 Prisma generate、server TypeScript build 與 dashboard production build。

## 注意事項

- 本次沒有執行 `npm audit fix --force`，因為 npm 建議的 force 修復會將 Prisma 7 降到 Prisma 6，屬破壞性變更。
- PowerShell 既有 session 可能尚未繼承 Node.js PATH；重開 VS Code 或 terminal 後應可直接使用 `node` / `npm`。本次驗證期間使用刷新後的 machine/user PATH。
- `.env.example` 僅提供結構與 placeholder，不含任何秘密資訊。
