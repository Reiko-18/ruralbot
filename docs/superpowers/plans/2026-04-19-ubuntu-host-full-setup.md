# Ubuntu 主機完整建置計畫 — 2026-04-19

> **For Codex：本計畫所有指令在 Ubuntu 主機上透過 SSH 執行。**
>
> **執行前提醒：**
> - 操作涉及 systemd 重啟，服務會短暫中斷（約 30 秒）
> - PostgreSQL 資料遷移（Phase 3）風險最高，必須先備份再執行
> - 每個 Phase 完成後回報結果，不要一次跑完
> - 遇到任何 `FAILED`、`error`、`Permission denied` 立即停止並回報

**Goal：**
1. 修補目前主機與 repo 規格的 6 項落差，讓 ruralbot 跑在最新 commit 且支援自動部署
2. 建立可擴充的多專案自動部署框架（未來其他專案直接套用）
3. 將 PostgreSQL 資料目錄遷移至 HDD，並建立另一顆 HDD 的自動備份

**Tech Stack：** Ubuntu, systemd, PostgreSQL, bash, cron, git, Node.js

---

## Phase 1：修補 ruralbot 部署落差

### Task 1-1：更新程式碼到最新 commit

目前主機停在 `97877ba`，需拉取 6 個落後的 commit（含 migration baseline、Nginx 範本、tsc build 等）。

```bash
cd /var/www/ruralbot

# 確認目前狀態
git status
git log --oneline -3

# 拉取最新 commit（ff-only 確保不產生 merge commit）
git pull --ff-only origin main

# 確認已更新到最新
git log --oneline -3
# 預期最新一筆為：9b90863 docs(claude): ...
```

**預期：** 最新 commit 為 `9b90863`。若 `git pull` 失敗（有本地修改），執行：
```bash
git stash
git pull --ff-only origin main
```

---

### Task 1-2：安裝依賴、執行 migration、編譯

```bash
cd /var/www/ruralbot

# 安裝依賴（npm ci 比 npm install 更確定性）
npm ci

# 執行 migration
# 重要：因為目前 DB 是以 db push 初始化，需先標記 baseline 已套用
# 若不確定，先查 DB 是否有 _prisma_migrations 資料表：
#   sudo -u postgres psql -d ruralbot -c "\dt _prisma_migrations"
# 若沒有此資料表，執行下方 resolve 指令；若已有，跳到 migrate deploy
npx prisma migrate resolve --applied 20260419000000_init
npx prisma migrate deploy

# 編譯（含 prisma generate + tsc + dashboard build）
npm run build

# 確認 dist/index.js 已產生
ls -la dist/index.js
# 預期：dist/index.js 存在，mtime 為剛才的時間
```

---

### Task 1-3：更新 systemd service 檔

目前 service 使用 `npm run start → tsx src/index.ts`，需改為 `node dist/index.js`。

```bash
# 備份舊版 service 檔
sudo cp /etc/systemd/system/ruralbot.service \
        /etc/systemd/system/ruralbot.service.bak-$(date +%Y%m%d)

# 寫入新版 service 檔
sudo tee /etc/systemd/system/ruralbot.service > /dev/null << 'EOF'
[Unit]
Description=RuralBot Discord bot and dashboard
After=network-online.target postgresql.service
Wants=network-online.target

[Service]
Type=simple
User=reiko
WorkingDirectory=/var/www/ruralbot
EnvironmentFile=/var/www/ruralbot/.env
ExecStart=/usr/bin/node /var/www/ruralbot/dist/index.js
Restart=on-failure
RestartSec=10
KillSignal=SIGTERM
TimeoutStopSec=30

[Install]
WantedBy=multi-user.target
EOF

# 重新載入並重啟
sudo systemctl daemon-reload
sudo systemctl restart ruralbot

# 確認正常啟動
sleep 5
systemctl status ruralbot --no-pager
journalctl -u ruralbot -n 20 --no-pager
```

**預期：** status 為 `active (running)`，ExecStart 顯示 `node /var/www/ruralbot/dist/index.js`，journalctl 出現 `Dashboard server started`。

---

### Task 1-4：建立自動部署腳本

```bash
# 確認 ops/ 目錄存在（git pull 後應已存在）
ls /var/www/ruralbot/ops/

# 設定腳本可執行
chmod +x /var/www/ruralbot/ops/ruralbot-auto-deploy.sh

# 手動執行一次確認流程正確（應顯示 no changes，因為剛才已 pull）
bash /var/www/ruralbot/ops/ruralbot-auto-deploy.sh
# 預期輸出：... no changes
```

> **注意：** `ops/ruralbot-auto-deploy.sh` 內的 `APP_DIR` 預設為 `/opt/ruralbot`，需確認或修改為 `/var/www/ruralbot`：
>
> ```bash
> head -5 /var/www/ruralbot/ops/ruralbot-auto-deploy.sh
> # 若 APP_DIR="/opt/ruralbot"，執行：
> sed -i 's|APP_DIR="/opt/ruralbot"|APP_DIR="/var/www/ruralbot"|g' \
>   /var/www/ruralbot/ops/ruralbot-auto-deploy.sh
> ```

---

### Task 1-5：建立 deploy log 目錄並設定 cron

```bash
# 建立 log 檔
sudo touch /var/log/ruralbot-deploy.log
sudo chown reiko:reiko /var/log/ruralbot-deploy.log

# 設定 cron（以 reiko 使用者執行）
crontab -e
```

在 crontab 編輯器中加入：

```
* * * * * /var/www/ruralbot/ops/ruralbot-auto-deploy.sh >> /var/log/ruralbot-deploy.log 2>&1
```

儲存後確認：

```bash
crontab -l
# 等待 1 分鐘後確認 log 有輸出
sleep 65 && tail -5 /var/log/ruralbot-deploy.log
# 預期：出現 "checking origin/main" 與 "no changes"
```

---

### Task 1-6：驗證 Phase 1 完成

```bash
echo "=== git commit ===" && git -C /var/www/ruralbot log --oneline -1
echo "=== dist ===" && ls -la /var/www/ruralbot/dist/index.js
echo "=== service ===" && systemctl is-active ruralbot
echo "=== cron ===" && crontab -l
echo "=== deploy log ===" && tail -3 /var/log/ruralbot-deploy.log
```

全部正常後回報，再進入 Phase 2。

---

## Phase 2：多專案自動部署框架

> 此 Phase 建立一套可重複使用的部署模式，未來任何 Node.js 專案只需套用此框架。

### Task 2-1：建立共用部署框架目錄

```bash
# 建立框架根目錄
sudo mkdir -p /opt/deploy-framework/{scripts,logs,services}
sudo chown -R reiko:reiko /opt/deploy-framework

# 目錄說明：
# /opt/deploy-framework/scripts/   — 各專案的部署腳本
# /opt/deploy-framework/logs/      — 各專案的 deploy log
# /opt/deploy-framework/services/  — 各專案的 systemd service 範本備份
```

---

### Task 2-2：建立通用部署腳本範本

```bash
cat > /opt/deploy-framework/scripts/deploy-template.sh << 'TEMPLATE'
#!/usr/bin/env bash
# 通用 Node.js 專案自動部署腳本
# 使用方式：複製此檔案，填入 PROJECT_NAME 與 APP_DIR，加入 cron
set -euo pipefail

PROJECT_NAME="<專案名稱>"          # 例如：ruralbot、projectB
APP_DIR="/var/www/<專案名稱>"       # 實際 repo 路徑
BRANCH="main"
LOCK_FILE="/tmp/${PROJECT_NAME}-deploy.lock"
LOG_TAG="[${PROJECT_NAME}]"

exec 9>"${LOCK_FILE}"
if ! flock -n 9; then
  echo "$(date -Is) ${LOG_TAG} deployment already running"
  exit 0
fi

cd "${APP_DIR}"
echo "$(date -Is) ${LOG_TAG} checking origin/${BRANCH}"
git fetch origin "${BRANCH}"

LOCAL_HEAD="$(git rev-parse HEAD)"
REMOTE_HEAD="$(git rev-parse "origin/${BRANCH}")"

if [ "${LOCAL_HEAD}" = "${REMOTE_HEAD}" ]; then
  echo "$(date -Is) ${LOG_TAG} no changes"
  exit 0
fi

echo "$(date -Is) ${LOG_TAG} updating ${LOCAL_HEAD} -> ${REMOTE_HEAD}"
git pull --ff-only origin "${BRANCH}"

npm ci
npx prisma migrate deploy
npm run build

sudo systemctl restart "${PROJECT_NAME}"
echo "$(date -Is) ${LOG_TAG} deployment completed"
TEMPLATE

chmod +x /opt/deploy-framework/scripts/deploy-template.sh
```

---

### Task 2-3：將 ruralbot 部署腳本連結至框架

```bash
# 複製 ruralbot 腳本至框架目錄（以修正過的 APP_DIR 版本為準）
cp /var/www/ruralbot/ops/ruralbot-auto-deploy.sh \
   /opt/deploy-framework/scripts/ruralbot-deploy.sh

# 將 log 集中至框架 logs 目錄
sudo touch /opt/deploy-framework/logs/ruralbot-deploy.log
sudo chown reiko:reiko /opt/deploy-framework/logs/ruralbot-deploy.log

# 更新 cron，改指向框架目錄的腳本與 log
crontab -e
```

將 cron entry 改為：

```
* * * * * /opt/deploy-framework/scripts/ruralbot-deploy.sh >> /opt/deploy-framework/logs/ruralbot-deploy.log 2>&1
```

---

### Task 2-4：建立新專案快速接入說明

```bash
cat > /opt/deploy-framework/README.md << 'DOC'
# 多專案自動部署框架

## 接入新專案步驟

1. 將 repo clone 至 /var/www/<project>/
2. 複製範本腳本：
   cp /opt/deploy-framework/scripts/deploy-template.sh \
      /opt/deploy-framework/scripts/<project>-deploy.sh
3. 編輯腳本，填入 PROJECT_NAME 與 APP_DIR
4. 建立 log 檔：
   touch /opt/deploy-framework/logs/<project>-deploy.log
5. 加入 cron：
   * * * * * /opt/deploy-framework/scripts/<project>-deploy.sh >> \
             /opt/deploy-framework/logs/<project>-deploy.log 2>&1
6. 複製並調整 systemd service 至 /etc/systemd/system/<project>.service
   systemctl daemon-reload && systemctl enable --now <project>

## 目前已接入的專案

| 專案 | app 路徑 | service | deploy 腳本 |
|------|----------|---------|-------------|
| ruralbot | /var/www/ruralbot | ruralbot.service | ruralbot-deploy.sh |
DOC
```

---

## Phase 3：PostgreSQL 資料遷移至 HDD

> **⚠️ 高風險操作，必須先完整備份再執行。**
> Phase 3 分兩步：（A）主資料目錄移至 HDD1，（B）自動備份至 HDD2。

### Task 3-0：確認 HDD 掛載點與可用空間

**在執行前，先回報以下指令的輸出：**

```bash
# 確認所有磁碟與掛載點
lsblk -f
df -h

# 確認 PostgreSQL 目前資料目錄
sudo -u postgres psql -c "SHOW data_directory;"

# 確認資料庫大小
sudo -u postgres psql -c "
SELECT pg_database.datname,
       pg_size_pretty(pg_database_size(pg_database.datname)) AS size
FROM pg_database
ORDER BY pg_database_size(pg_database.datname) DESC;"
```

> **Codex 注意：** 回報上方輸出後暫停，等待確認 HDD1 與 HDD2 的實際掛載路徑（例如 `/mnt/hdd1`、`/mnt/hdd2`），再繼續 Task 3-1。

---

### Task 3-1：備份現有資料庫

```bash
# 備份整個 PostgreSQL cluster（替換 <HDD1_PATH> 為實際路徑）
HDD1_PATH="<HDD1 掛載路徑>"  # 例如 /mnt/hdd1
BACKUP_FILE="${HDD1_PATH}/postgresql-backup-$(date +%Y%m%d-%H%M%S).sql"

sudo -u postgres pg_dumpall > "${BACKUP_FILE}"
ls -lh "${BACKUP_FILE}"
# 預期：備份檔存在，大小不為 0
```

---

### Task 3-2：遷移 PostgreSQL 資料目錄至 HDD1

```bash
HDD1_PATH="<HDD1 掛載路徑>"
NEW_PG_DIR="${HDD1_PATH}/postgresql/data"

# 停止 PostgreSQL
sudo systemctl stop postgresql

# 建立目標目錄並設定正確權限
sudo mkdir -p "${NEW_PG_DIR}"
sudo chown postgres:postgres "${NEW_PG_DIR}"
sudo chmod 700 "${NEW_PG_DIR}"

# 取得目前資料目錄
OLD_PG_DIR=$(sudo -u postgres psql -t -c "SHOW data_directory;" 2>/dev/null | tr -d ' ' || echo "/var/lib/postgresql/*/main")
echo "目前資料目錄：${OLD_PG_DIR}"

# 同步資料（rsync 保留所有權限與 symlink）
sudo rsync -av --progress "${OLD_PG_DIR}/" "${NEW_PG_DIR}/"

# 找出 postgresql.conf 位置並更新 data_directory
PG_CONF=$(sudo find /etc/postgresql -name "postgresql.conf" | head -1)
echo "設定檔位置：${PG_CONF}"
sudo cp "${PG_CONF}" "${PG_CONF}.bak-$(date +%Y%m%d)"
sudo sed -i "s|data_directory = '.*'|data_directory = '${NEW_PG_DIR}'|g" "${PG_CONF}"
# 確認更新成功
grep "data_directory" "${PG_CONF}"

# 重新啟動並驗證
sudo systemctl start postgresql
sleep 5
sudo systemctl status postgresql --no-pager
sudo -u postgres psql -c "SHOW data_directory;"
# 預期：顯示新路徑 ${NEW_PG_DIR}

# 確認 ruralbot DB 可正常查詢
sudo -u postgres psql -d ruralbot -c "SELECT COUNT(*) FROM guilds;"
```

---

### Task 3-3：建立 HDD2 自動備份排程

```bash
HDD2_PATH="<HDD2 掛載路徑>"  # 例如 /mnt/hdd2
BACKUP_DIR="${HDD2_PATH}/postgresql-backups"
sudo mkdir -p "${BACKUP_DIR}"
sudo chown reiko:reiko "${BACKUP_DIR}"

# 建立備份腳本
cat > /opt/deploy-framework/scripts/pg-backup.sh << SCRIPT
#!/usr/bin/env bash
set -euo pipefail
BACKUP_DIR="${BACKUP_DIR}"
TIMESTAMP=\$(date +%Y%m%d-%H%M%S)
BACKUP_FILE="\${BACKUP_DIR}/pg-backup-\${TIMESTAMP}.sql.gz"

sudo -u postgres pg_dumpall | gzip > "\${BACKUP_FILE}"
echo "\$(date -Is) backup completed: \${BACKUP_FILE} (\$(du -sh \${BACKUP_FILE} | cut -f1))"

# 保留最近 14 天備份，刪除更舊的
find "\${BACKUP_DIR}" -name "pg-backup-*.sql.gz" -mtime +14 -delete
echo "\$(date -Is) old backups cleaned"
SCRIPT

chmod +x /opt/deploy-framework/scripts/pg-backup.sh

# 加入 cron，每天凌晨 3 點備份
crontab -e
```

在 crontab 加入：

```
0 3 * * * /opt/deploy-framework/scripts/pg-backup.sh >> /opt/deploy-framework/logs/pg-backup.log 2>&1
```

手動跑一次確認：

```bash
bash /opt/deploy-framework/scripts/pg-backup.sh
tail -5 /opt/deploy-framework/logs/pg-backup.log
ls -lh "${BACKUP_DIR}"
```

---

## 各 Phase 完成後驗證清單

```bash
# Phase 1 驗證
echo "=== ruralbot git ===" && git -C /var/www/ruralbot log --oneline -1
echo "=== dist ===" && ls /var/www/ruralbot/dist/index.js
echo "=== service ===" && systemctl is-active ruralbot
echo "=== ExecStart ===" && grep ExecStart /etc/systemd/system/ruralbot.service
echo "=== cron ===" && crontab -l | grep deploy
echo "=== deploy log ===" && tail -3 /opt/deploy-framework/logs/ruralbot-deploy.log

# Phase 2 驗證
echo "=== framework ===" && ls /opt/deploy-framework/scripts/
echo "=== README ===" && head -5 /opt/deploy-framework/README.md

# Phase 3 驗證
echo "=== pg data dir ===" && sudo -u postgres psql -t -c "SHOW data_directory;"
echo "=== pg status ===" && systemctl is-active postgresql
echo "=== backup dir ===" && ls -lh <HDD2_PATH>/postgresql-backups/
```

---

## 重要注意事項

- **Phase 3 必須在 Task 3-0 回報磁碟資訊後才能繼續**，HDD 路徑需確認後才能填入
- `ruralbot.service` 維持 `User=reiko`，不強制改為 `ruralbot`（減少權限問題風險）
- `.env` 目前在 `/var/www/ruralbot/.env`，短期可接受；若日後需要強化安全性，再遷移至 `/etc/ruralbot/ruralbot.env`
- Phase 3 完成後，舊的 PG 資料目錄保留不刪除，確認運作穩定 7 天後再清除
