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
npx prisma generate
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
