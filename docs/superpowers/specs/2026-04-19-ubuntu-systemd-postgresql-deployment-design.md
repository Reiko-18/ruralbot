# Ubuntu systemd 與本地 PostgreSQL 部署設計

## 目標

RuralBot 正式部署於自架 Ubuntu 主機，使用 systemd 管理單一 bot/dashboard 服務，PostgreSQL 於同一台主機本地執行，並以 cron 定期輪詢 GitHub 進行自動部署。

## 現行架構

- 主機：Ubuntu，自架公網主機
- 公網 IP：`211.22.158.125`
- 程式目錄：建議 `/opt/ruralbot`
- 服務管理：systemd `ruralbot.service`
- 資料庫：本地 PostgreSQL，建議 DB 名稱 `ruralbot`
- 自動部署：cron 每 5 分鐘執行 GitHub fast-forward 更新腳本
- API / dashboard：Express server，預設 listen `0.0.0.0:3000`
- SmilePay callback：`http://211.22.158.125/api/payment/callback`

## 環境變數

正式主機建議使用 `/etc/ruralbot/ruralbot.env`，不得提交到 Git。

```env
DATABASE_URL=postgresql://ruralbot:<密碼>@localhost:5432/ruralbot
DIRECT_URL=postgresql://ruralbot:<密碼>@localhost:5432/ruralbot
SMILEPAY_ROTURL=http://211.22.158.125/api/payment/callback
```

`DATABASE_URL` 供 runtime Prisma adapter 使用。`DIRECT_URL` 供 Prisma CLI 與 migration 使用。兩者在本地 PostgreSQL 部署中可相同。

## systemd 設計

範本位於 `ops/ruralbot.service.example`。

服務以 `Restart=on-failure` 管理，避免暫時性錯誤造成永久停機。Discord bot 應維持單實例，避免多副本重複登入 Discord gateway。

常用指令：

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now ruralbot
sudo systemctl restart ruralbot
sudo journalctl -u ruralbot -f
```

## 自動部署設計

範本位於：

- `ops/ruralbot-auto-deploy.sh`
- `ops/ruralbot.cron.example`

部署腳本使用 `/tmp/ruralbot-deploy.lock` 避免重入。更新策略為 `git fetch` 後比對 `HEAD` 與 `origin/main`，只有遠端有新 commit 時才執行 `git pull --ff-only origin main`。

部署步驟：

```bash
npm ci
npx prisma generate
npx prisma migrate deploy
npm run build
systemctl restart ruralbot
```

## PostgreSQL 設計

主機需建立本地 DB 與使用者：

```bash
sudo -u postgres createuser ruralbot
sudo -u postgres createdb ruralbot -O ruralbot
```

實際密碼與認證方式由主機 PostgreSQL 設定管理。若使用密碼登入，需同步更新 `/etc/ruralbot/ruralbot.env`。

## SmilePay callback 與反向代理

`SMILEPAY_ROTURL` 指定為：

```env
SMILEPAY_ROTURL=http://211.22.158.125/api/payment/callback
```

由於 URL 不含 port，主機需將 80 port 反向代理至 Express dashboard 實際監聽 port，例如 `3000`。若未配置反向代理，callback URL 必須改為包含 port 的形式，否則 SmilePay 無法送達。

## 回滾策略

標準程式碼回滾：

```bash
git revert HEAD
npm ci
npx prisma migrate deploy
npm run build
systemctl restart ruralbot
```

注意：Prisma migration 不保證可自動反向回滾。若 migration 本身造成 schema 變更，需另行設計手動還原 SQL 或資料備份還原流程。

## 健康檢查

Express 提供 `/healthz`，用於驗證 HTTP 程序存活與 dashboard/API 可對外回應。Discord gateway 暫時 reconnect 不應直接視為主機服務失敗。

## 安全要求

- `.env`、`/etc/ruralbot/ruralbot.env` 不得提交。
- Discord token、資料庫密碼、SmilePay key 不得寫入 repo。
- callback URL、反向代理與 env 設定需保持一致。
