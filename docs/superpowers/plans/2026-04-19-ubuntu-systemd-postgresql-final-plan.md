# Ubuntu systemd 與本地 PostgreSQL 遷移最終計畫

日期：2026-04-19

## 目標

將 ruralbot 完整轉為「自架 Ubuntu 主機 + systemd + 本地 PostgreSQL + cron 輪詢 GitHub」部署模式，並移除 Railway、Coolify、Supabase 的部署語意與設定。

本文件僅為最終計畫，不包含實作。

---

## 一、刪除舊平台設定

### 需刪除檔案

- `railway.json`
- `Dockerfile`

### 需移除或改寫的程式碼與描述

- `src/index.ts`
  - 移除 `RAILWAY_PUBLIC_URL` self-ping 啟動。
- `src/services/keepalive/keep_alive.ts`
  - 移除 Railway self-ping。
  - 將 Supabase heartbeat 語意改成一般資料庫健康更新，或保留 DB heartbeat 但改名為中性名稱。
- `src/services/payment/repo_payment_config.ts`
  - 移除任何 Railway / Supabase 硬編碼網域或連線字串。
  - 將 callback URL 來源改為讀取 `SMILEPAY_ROTURL` 環境變數，不在程式碼內寫死網址。
- `package.json`
  - 將描述中的 `Supabase` 改為 `PostgreSQL`。
- 全 repo 搜尋並清除 `Railway`、`Coolify`、`Supabase` 殘留語意。
- 舊遷移紀錄若保留，需明確標記為歷史文件，不再作為現行部署依據。

---

## 二、改成本地 PostgreSQL

### 程式碼層面

- `src/core/db.ts`
  - 保留目前透過 `DATABASE_URL` 建立 Prisma PG adapter 的邏輯。
- `prisma.config.ts`
  - 保留目前使用 `DIRECT_URL` 供 Prisma CLI 使用的邏輯。
- 不修改 Prisma schema，因 datasource 已是 `postgresql`。

### 環境變數層面

`.env` 不納入版本控制，但本機與主機環境要更新為：

```env
DATABASE_URL=postgresql://ruralbot:<密碼>@localhost:5432/ruralbot
DIRECT_URL=postgresql://ruralbot:<密碼>@localhost:5432/ruralbot
SMILEPAY_ROTURL=http://211.22.158.125/api/payment/callback
```

### 主機 PostgreSQL 規劃

- 建立 Linux/DB 使用者 `ruralbot`
- 建立資料庫 `ruralbot`
- 賦予 `ruralbot` 對該 DB 的必要權限
- migration / schema sync 採保守方案，文件中明確說明 `npx prisma migrate deploy` 與 `npx prisma generate` 的使用時機

---

## 三、systemd 部署方式

### 預計新增範本檔案

- `ops/ruralbot.service.example`

### service 內容方向

```ini
[Unit]
Description=RuralBot Discord bot and dashboard
After=network-online.target postgresql.service
Wants=network-online.target

[Service]
Type=simple
User=ruralbot
WorkingDirectory=/opt/ruralbot
EnvironmentFile=/etc/ruralbot/ruralbot.env
ExecStart=/usr/bin/npm start
Restart=on-failure
RestartSec=10
KillSignal=SIGTERM
TimeoutStopSec=30

[Install]
WantedBy=multi-user.target
```

### 文件需說明內容

- repo 建議路徑：`/opt/ruralbot`
- env 檔建議路徑：`/etc/ruralbot/ruralbot.env`
- `systemctl daemon-reload`
- `systemctl enable --now ruralbot`
- `journalctl -u ruralbot -f`
- health check 路徑與 dashboard 存取方式

### 回滾方式

文件需說明標準回滾流程：

```bash
git revert HEAD
npm ci
npx prisma migrate deploy
npm run build
systemctl restart ruralbot
```

若 migration 本身無法回滾，需手動還原 schema，文件應提示此風險。

---

## 四、cron 輪詢 GitHub 自動部署

### 採用策略

採用 `git fetch` + `git pull --ff-only`，不做 destructive reset。

### 預計新增範本檔案

- `ops/ruralbot-auto-deploy.sh`
- `ops/ruralbot.cron.example`

### 部署腳本流程

- 使用 lock file 避免重入，路徑固定為 `/tmp/ruralbot-deploy.lock`
- 進入 `/opt/ruralbot`
- 執行 `git fetch origin main`
- 比對 `HEAD` 與 `origin/main`
- 無更新則直接結束
- 有更新則執行 `git pull --ff-only origin main`
- 執行 `npm ci`
- 執行 `npx prisma generate`
- 執行 `npx prisma migrate deploy`
- 執行 `npm run build`
- 執行 `systemctl restart ruralbot`
- 寫入 deploy log

### cron 範例

```cron
*/5 * * * * /opt/ruralbot/ops/ruralbot-auto-deploy.sh >> /var/log/ruralbot-deploy.log 2>&1
```

---

## 五、SmilePay callback 更新

### 需更新內容

- `.env` 的 `SMILEPAY_ROTURL`
- `docs/superpowers/specs/2026-03-21-smilepay-payment-integration-design.md`
- `docs/superpowers/plans/2026-03-21-smilepay-payment.md`
- 對應 Obsidian SmilePay 筆記

### 新值

```env
SMILEPAY_ROTURL=http://211.22.158.125/api/payment/callback
```

### 文件需補充的前提

- SmilePay callback 必須可由公網打到 bot dashboard server
- 若 Express 實際跑在 `3000`，需有防火牆規則或反向代理
- 由於 URL 不含 port，文件將以「80 反代到 3000」作為前提說明

---

## 六、文件更新

### repo 文件

- `AGENTS.md`
  - 以 UTF-8 重新存檔並重寫全部內容，修復編碼異常
  - 改成 Ubuntu、systemd、本地 PostgreSQL、cron 規範
- `CLAUDE.md`
  - 同步部署與資料庫描述
- 新增 `docs/superpowers/specs/2026-04-19-ubuntu-systemd-postgresql-deployment-design.md`
- 新增 `docs/superpowers/plans/2026-04-19-ubuntu-systemd-postgresql-migration.md`
- 舊 Coolify 文件改為歷史文件或由新文件取代
- `docs/superpowers/plans/2026-03-18-accounting-module.md`
  - 將 `PostgreSQL (Supabase)` 改為 `PostgreSQL`

### Obsidian 筆記

- 新增或改寫 `D:\reiko's coding corner\reiko's corner\ruralbot\2026-04-19 Ubuntu systemd 部署遷移.md`
- 更新 `D:\reiko's coding corner\reiko's corner\ruralbot\2026-04-19 Coolify 部署遷移.md`，標記為歷史紀錄
- 更新 `D:\reiko's coding corner\reiko's corner\ruralbot\smilepay-payment-integration.md`

---

## 七、驗證計畫

實作完成後預計執行：

```powershell
npm run db:generate
npm run build
rg -n "Railway|railway|Coolify|coolify|Supabase|supabase|RAILWAY_PUBLIC_URL|railway.app" -S .
git status --short
```

若環境允許，再進行：

```powershell
npm start
```

注意：

- 不長時間連線 production Discord bot
- 避免重複登入或干擾線上服務

---

## 八、提交與推送

實作完成後依專案規則執行：

```powershell
git add -A
git commit -m "chore(deploy): 遷移至 Ubuntu systemd 與本地 PostgreSQL"
git push
```

提交前需再次確認：

- `.env` 未被納入版本控制
- 沒有把資料庫密碼、Discord token、SmilePay 機密寫入 repo

---

## 九、官方文件依據

- Prisma PostgreSQL: https://www.prisma.io/docs/orm/overview/databases/postgresql
- Prisma `directUrl`: https://www.prisma.io/docs/orm/reference/prisma-schema-reference#fields-2
- systemd service: https://man7.org/linux/man-pages/man5/systemd.service.5.html
- crontab: https://man7.org/linux/man-pages/man5/crontab.5.html
- PostgreSQL connection URI: https://www.postgresql.org/docs/current/libpq-connect.html
