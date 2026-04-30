# 2026-04-30 Dashboard 部署路徑修復

## 問題

使用者回報網頁管理面板打不開。重新檢查部署設定後發現：

- `ops/ruralbot.service.example` 使用 `/opt/ruralbot` 作為 `WorkingDirectory` 與 `ExecStart` 路徑。
- `ops/ruralbot.cron.example` 也從 `/opt/ruralbot/ops/ruralbot-auto-deploy.sh` 執行部署腳本。
- 但 `ops/ruralbot-auto-deploy.sh` 內部原本固定 `APP_DIR="/var/www/ruralbot"`。

這會造成 production 自動部署在錯誤目錄執行 `git pull`、`npm ci`、`prisma migrate deploy`、`npm run build` 與 `systemctl restart ruralbot`，進而讓 dashboard build、migration 與實際 systemd 服務目錄不同步。

## 修正

- 將 `APP_DIR` 改為 `APP_DIR="${RURALBOT_APP_DIR:-/opt/ruralbot}"`。
- 預設對齊 systemd / cron 的 `/opt/ruralbot`。
- 若未來主機路徑不同，可在環境中設定 `RURALBOT_APP_DIR` 覆蓋，不需要改 repo。

## 官方文件查證

- Prisma production migration 官方流程使用 `prisma migrate deploy` 套用已提交 migration。
- Express static middleware 可服務已建置的 dashboard `dist` 目錄；本專案仍由 `npm run build` 產生 dashboard/dist，再由 Express 提供 SPA fallback。

## 驗證

- `npm run build` 通過。
- `bash -n ops/ruralbot-auto-deploy.sh` 未能在本地 Windows 環境執行，原因是 `/bin/bash` 不存在；腳本變更僅為 POSIX shell 變數預設值語法，需在 Ubuntu 主機上再次確認。

## 維運建議

正式主機若目前已卡住，請在主機上確認：

```bash
cd /opt/ruralbot
git pull --ff-only origin main
npm ci
npx prisma migrate deploy
npm run build
sudo systemctl restart ruralbot
sudo systemctl status ruralbot --no-pager
```
