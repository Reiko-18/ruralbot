# Ubuntu systemd 與本地 PostgreSQL 遷移紀錄

## 背景

RuralBot 部署平台已從 Railway / Coolify / Supabase 相關設定，遷移為自架 Ubuntu 主機、systemd、本地 PostgreSQL 與 cron 輪詢 GitHub。

## 本次調整

- 刪除 `railway.json`
- 刪除 `Dockerfile`
- 移除 `RAILWAY_PUBLIC_URL` self-ping
- 將資料庫 heartbeat 語意改為一般本地 PostgreSQL 健康更新
- 將專案描述從 Supabase 改為 PostgreSQL
- 新增 systemd service 範本
- 新增 cron 自動部署腳本與 crontab 範例
- 更新 `AGENTS.md` 與 `CLAUDE.md` 部署規則
- 更新 SmilePay callback 文件與 env 範例
- 將舊平台部署文件標記為歷史紀錄

## 主機部署設定

建議 repo 路徑：

```bash
/opt/ruralbot
```

建議 systemd env 檔：

```bash
/etc/ruralbot/ruralbot.env
```

建議 env：

```env
DATABASE_URL=postgresql://ruralbot:<密碼>@localhost:5432/ruralbot
DIRECT_URL=postgresql://ruralbot:<密碼>@localhost:5432/ruralbot
SMILEPAY_ROTURL=http://211.22.158.125/api/payment/callback
```

## 自動部署流程

cron 每 5 分鐘執行：

```cron
*/5 * * * * /opt/ruralbot/ops/ruralbot-auto-deploy.sh >> /var/log/ruralbot-deploy.log 2>&1
```

腳本流程：

```bash
git fetch origin main
git pull --ff-only origin main
npm ci
npx prisma migrate deploy
npm run build
systemctl restart ruralbot
```

## 驗證紀錄

遷移實作後需執行：

```powershell
npm run db:generate
npm run build
rg -n "Railway|railway|Coolify|coolify|Supabase|supabase|RAILWAY_PUBLIC_URL|railway.app" -S .
git status --short
```

## 回滾方式

標準回滾流程：

```bash
git revert HEAD
npm ci
npx prisma migrate deploy
npm run build
systemctl restart ruralbot
```

若 migration 本身無法回滾，需手動還原 schema 或從備份還原資料庫。

## 已知風險

- 目前 repo 若尚未建立正式 migration 歷史，正式啟用 `npx prisma migrate deploy` 前需先確認 migration baseline。
- `SMILEPAY_ROTURL` 不含 port，因此主機 80 port 必須反向代理至 dashboard 實際監聽 port。
- systemd 服務應維持單實例，避免 Discord bot 重複登入。

## 更新紀錄（2026-04-19 補充）

### 已補充完成項目

- 新增 `src/prisma/migrations/20260419000000_init/migration.sql` — 完整 schema baseline。
- 新增 `ops/nginx-ruralbot.conf.example` — 80 → 3000 反向代理範本。
- `npm run build` 加入 `npx tsc`，`npm start` 改為 `node dist/index.js`。
- `ops/ruralbot.service.example` ExecStart 改為 `node /opt/ruralbot/dist/index.js`。

### 首次主機部署程序

**前提：DB 已存在且以 db push 或手動建表初始化。**

若主機 DB 已有資料表（曾用 `prisma db push`），執行以下指令將現有狀態標記為 migration baseline 已套用，避免 `migrate deploy` 嘗試重建資料表：

```bash
cd /opt/ruralbot
npx prisma migrate resolve --applied 20260419000000_init
```

之後正常 deploy 流程即可：

```bash
npx prisma migrate deploy   # 後續增量 migration
npm run build               # 包含 tsc + dashboard build
systemctl restart ruralbot
```

**若是全新空白 DB（從未建表）：**

直接執行 `npx prisma migrate deploy`，baseline migration 會自動建立所有資料表。

## 更新紀錄（2026-04-19 Phase 3）

### PostgreSQL 資料目錄已遷移至 HDD1

- 主機實際環境的 HDD1 `/mnt/data` 與 HDD2 `/mnt/backup` 皆為 NTFS（`ntfs-3g` / `fuseblk`）掛載，無法直接作為 PostgreSQL `data_directory` 使用。
- 為保留 POSIX 權限與 PostgreSQL 所需的檔案系統語意，改採安全方案：
  - 在 HDD1 建立 `ext4` loop image：`/mnt/data/postgresql/postgresql16-data.img`
  - 掛載點：`/srv/postgresql-hdd1`
  - PostgreSQL 新資料目錄：`/srv/postgresql-hdd1/data`
- `/etc/fstab` 已加入：

```fstab
/mnt/data/postgresql/postgresql16-data.img /srv/postgresql-hdd1 ext4 loop,defaults,nofail 0 2
```

- PostgreSQL 16 已切換至新資料目錄並驗證成功：

```bash
sudo -u postgres psql -Atqc "SHOW data_directory;"
# /srv/postgresql-hdd1/data
```

### 備份與回滾保護

- 遷移前完整 SQL 備份：
  - `/mnt/backup/postgresql-backups/pre-migration-20260419-181813.sql.gz`
- 舊資料目錄 `/var/lib/postgresql/16/main` 保留不刪，作為短期回滾依據。
- 驗證到 PostgreSQL cluster 與 ruralbot service 均已恢復正常後才完成切換。

### HDD2 自動備份

- 備份腳本：
  - `/opt/deploy-framework/scripts/pg-backup.sh`
- 備份目錄：
  - `/mnt/backup/postgresql-backups`
- cron：

```cron
0 3 * * * root /opt/deploy-framework/scripts/pg-backup.sh >> /opt/deploy-framework/logs/pg-backup.log 2>&1
```

- 備份策略：
  - 每日凌晨 3 點執行 `pg_dumpall | gzip`
  - 保留 14 天，刪除更舊的 `pg-backup-*.sql.gz`

### 驗證結果

- `postgresql@16-main.service`：`active`
- `ruralbot.service`：`active`
- `ruralbot` 資料庫 `public` schema 資料表數：`21`
- 首次手動備份已成功產生：
  - `/mnt/backup/postgresql-backups/pg-backup-20260419-182107.sql.gz`

## 更新紀錄（2026-04-19 剩餘修補）

- `src/events/price/price-menu.event.ts`
  - ephemeral select menu 路徑改為先 `deferUpdate()`，後續統一 `editReply()`，避免 Discord interaction `10062`
- `ops/ruralbot-auto-deploy.sh`
  - repo 內 `APP_DIR` 改為 `/var/www/ruralbot`
- Ubuntu 主機
  - `/etc/systemd/system/postgresql@16-main.service.d/mount-after.conf`
    - 補上 `After=` / `Requires=` 對 `srv-postgresql\x2dhdd1.mount` 的依賴
  - `/etc/sudoers.d/ruralbot-deploy`
    - 補上 `reiko` 對 `systemctl restart/status ruralbot` 的免密 sudo
  - 清除 `/var/www/ruralbot/ops/ruralbot-auto-deploy.sh` 的主機端未提交修改，恢復由 git pull 正常更新
