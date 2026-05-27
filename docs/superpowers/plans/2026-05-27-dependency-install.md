# 2026-05-27 依賴安裝紀錄

## 摘要

- 使用 `winget` 安裝 Node.js LTS `v24.16.0`。
- 使用 npm lockfile 安裝根目錄與 `dashboard/` 依賴。
- 以 `DIRECT_URL=postgresql://user:pass@localhost:5432/ruralbot` 臨時環境變數執行 `npm run build`，未寫入任何秘密資訊。

## 驗證

- `npm.cmd ci`：根目錄完成。
- `npm.cmd ci`：`dashboard/` 完成。
- `npm.cmd ls --depth=0`：根目錄與 dashboard 依賴樹可解析。
- `npm.cmd run build`：通過 Prisma client 產生、TypeScript 編譯與 dashboard production build。
- `npm.cmd audit --audit-level=moderate`：dashboard 無漏洞；根目錄仍有 7 個 audit issue，部分修復會造成 Prisma 主要版本異動，未在本次安裝任務中自動套用。

## 注意事項

- PowerShell execution policy 會阻擋 `npm.ps1`，本次使用 `npm.cmd` 執行 npm。
- 正式執行 Prisma、migration 或部署時仍需由環境變數提供實際 `DATABASE_URL` 與 `DIRECT_URL`。
