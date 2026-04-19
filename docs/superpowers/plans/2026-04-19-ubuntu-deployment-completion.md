# Ubuntu 部署完成計畫 — 2026-04-19

> **For agentic workers:** 使用 superpowers:executing-plans 或 superpowers:subagent-driven-development 執行本計畫。

**Goal:** 完成 ruralbot 遷移至 Ubuntu systemd + 本地 PostgreSQL 的最後剩餘項目，並確保首次主機部署不阻塞。

**Architecture:** 已完成平台遷移（Railway/Coolify/Supabase 語意移除），本計畫處理剩餘的程式碼清理、文件更新與主機部署程序。

**Tech Stack:** TypeScript, Node.js, Prisma 7, PostgreSQL, systemd, Nginx, cron

---

## 完成狀態（截至 2026-04-19）

| 項目 | 狀態 |
|------|------|
| railway.json / Dockerfile 刪除 | ✅ 已完成 |
| RAILWAY_PUBLIC_URL self-ping 移除 | ✅ 已完成 |
| SMILEPAY_ROTURL 改從 env 讀取 | ✅ 已完成 |
| systemd service 範本 | ✅ 已完成 |
| cron + auto-deploy 腳本 | ✅ 已完成 |
| CLAUDE.md 同步 AGENTS.md 規則 | ✅ 已完成 |
| Prisma migration baseline | ✅ 已完成（20260419000000_init） |
| Nginx 反向代理範本 | ✅ 已完成（ops/nginx-ruralbot.conf.example）|
| `npm start` 改為 `node dist/index.js` | ✅ 已完成 |
| `npm run build` 加入 `npx tsc` | ✅ 已完成 |
| auto-deploy.sh 冗餘 prisma generate 清理 | 本計畫 Task 1 |
| 文件更新（migration、deploy 計畫） | 本計畫 Task 2 |
| Obsidian 筆記更新 | 本計畫 Task 3 |

---

## Task 1：清理 auto-deploy.sh 冗餘步驟

**Files:**
- Modify: `ops/ruralbot-auto-deploy.sh`

`npm run build` 已包含 `npx prisma generate`，腳本中獨立呼叫一次造成重複。

- [ ] **Step 1: 移除冗餘的 `npx prisma generate`**

將 `ops/ruralbot-auto-deploy.sh` 中的以下區段：

```bash
npm ci
npx prisma generate
npx prisma migrate deploy
npm run build
```

改為：

```bash
npm ci
npx prisma migrate deploy
npm run build
```

- [ ] **Step 2: 驗證腳本語法**

```bash
bash -n ops/ruralbot-auto-deploy.sh
echo "語法正確"
```

預期輸出：`語法正確`

- [ ] **Step 3: Commit**

```bash
git add ops/ruralbot-auto-deploy.sh
git commit -m "fix(deploy): 移除 auto-deploy.sh 中冗餘的 prisma generate"
```

---

## Task 2：更新 migration 計畫文件

**Files:**
- Modify: `docs/superpowers/plans/2026-04-19-ubuntu-systemd-postgresql-migration.md`

在「已知風險」區塊補充 migration baseline 已建立的說明，以及首次主機部署的正確執行步驟。

- [ ] **Step 1: 更新遷移紀錄文件**

在 `docs/superpowers/plans/2026-04-19-ubuntu-systemd-postgresql-migration.md` 末尾追加：

```markdown
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
```

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/plans/2026-04-19-ubuntu-systemd-postgresql-migration.md
git commit -m "docs(deploy): 補充 migration baseline 建立說明與首次主機部署程序"
```

---

## Task 3：Obsidian 筆記更新

**Files（外部，不在 repo）：**
- `D:\reiko's coding corner\reiko's corner\ruralbot\2026-04-19 Ubuntu systemd 部署遷移.md`

- [ ] **Step 1: 更新或建立 Obsidian 筆記**

在上述路徑建立或更新筆記，內容涵蓋：

```markdown
# Ubuntu systemd 部署遷移 — 2026-04-19

## 狀態：已完成（程式碼層面）

## 主要變更
- Prisma migration baseline: 20260419000000_init
- Nginx 反向代理: ops/nginx-ruralbot.conf.example (80 → 3000)
- npm start 改為 node dist/index.js
- npm run build 加入 npx tsc
- CLAUDE.md 同步 AGENTS.md 所有規則

## 主機上線前人工步驟
1. 在 /etc/ruralbot/ruralbot.env 填入真實 DB 密碼
2. 複製 nginx 範本並啟用：
   sudo cp ops/nginx-ruralbot.conf.example /etc/nginx/sites-available/ruralbot
   sudo ln -s /etc/nginx/sites-available/ruralbot /etc/nginx/sites-enabled/ruralbot
   sudo nginx -t && sudo systemctl reload nginx
3. 若 DB 已有資料（曾用 db push）：
   npx prisma migrate resolve --applied 20260419000000_init
4. systemctl enable --now ruralbot

## Git
commit: a05c9db
```

---

## 主機上線清單（人工執行，不可自動化）

以下步驟在 Ubuntu 主機上執行，無法從本機 Windows 自動化：

| # | 步驟 | 指令 |
|---|------|------|
| 1 | 建立 DB 使用者與資料庫 | `sudo -u postgres psql -c "CREATE USER ruralbot WITH PASSWORD '...'; CREATE DATABASE ruralbot OWNER ruralbot;"` |
| 2 | 建立 env 檔 | `sudo mkdir -p /etc/ruralbot && sudo nano /etc/ruralbot/ruralbot.env` |
| 3 | 部署 Nginx 反代 | `sudo cp ops/nginx-ruralbot.conf.example /etc/nginx/sites-available/ruralbot && sudo ln -s /etc/nginx/sites-available/ruralbot /etc/nginx/sites-enabled/ruralbot && sudo nginx -t && sudo systemctl reload nginx` |
| 4 | 安裝 systemd service | `sudo cp ops/ruralbot.service.example /etc/systemd/system/ruralbot.service && sudo systemctl daemon-reload && sudo systemctl enable --now ruralbot` |
| 5 | 標記 migration baseline（DB 有資料時）| `npx prisma migrate resolve --applied 20260419000000_init` |
| 6 | 驗證服務 | `systemctl status ruralbot && journalctl -u ruralbot -n 50` |
