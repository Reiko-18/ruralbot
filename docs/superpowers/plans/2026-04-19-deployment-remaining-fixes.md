# 部署剩餘問題修復計畫 — 2026-04-19

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Codex 執行前提醒：**
> - Task 1、Task 2 在本機 repo（`d:\ruralbot`）執行，完成後 commit + push
> - Task 3、Task 4 透過 SSH 在 Ubuntu 主機執行（`/var/www/ruralbot`）
> - 此專案使用 TypeScript + ESM，所有 import 必須加 `.js` 副檔名
> - 本機 shell 為 Windows bash；Ubuntu 主機為 Linux bash

**Goal:** 修復 price-menu 互動 10062 bug、修正 auto-deploy 腳本路徑錯誤，並驗證 PostgreSQL loop image 與 systemctl sudo 在主機重開機後能正常運作。

**Architecture:** 修復分兩層：（1）repo 程式碼修正（Task 1、2），直接 commit 後由 auto-deploy 推送至主機；（2）主機維運驗證（Task 3、4），透過 SSH 執行確認並補上缺少的 fstab / sudoers 設定。

**Tech Stack:** TypeScript, discord.js v14, Node.js, bash, systemd, PostgreSQL, Ubuntu

---

## 檔案影響清單

| 動作 | 路徑 | 說明 |
|------|------|------|
| 修改 | `src/events/price/price-menu.event.ts` | ephemeral 路徑加入 deferUpdate()，統一改用 editReply() |
| 修改 | `ops/ruralbot-auto-deploy.sh` | APP_DIR 從 `/opt/ruralbot` 改為 `/var/www/ruralbot` |
| 主機確認 | `/etc/fstab` | 補上 loop image 掛載條目（若缺少） |
| 主機確認 | `/etc/sudoers.d/ruralbot-deploy` | 補上 reiko 的免密 sudo 規則（若缺少） |

---

## Task 1：修復 price-menu ephemeral 路徑的 10062 問題

**背景：** `DiscordAPIError[10062]: Unknown interaction` 發生在 Discord interaction token 的 3 秒確認時限到期後。
目前 ephemeral 路徑（`isEphemeral === true`）直接呼叫 `interaction.update()`，若 `buildPriceView()` 耗時超過 3 秒就會 timeout。
非 ephemeral 路徑已正確使用 `deferReply()` 先確認，ephemeral 路徑需補上 `deferUpdate()`。

**Files:**
- Modify: `src/events/price/price-menu.event.ts`

---

- [ ] **Step 1: 讀取現有程式碼確認行數**

開啟 `src/events/price/price-menu.event.ts`，確認目前 `isEphemeral` 分支的位置（約第 14–43 行）。預期看到：
- 非 ephemeral 分支（第 14–17 行）：有 `deferReply()`
- ephemeral 分支（第 31–36 行）：直接 `interaction.update()`，**缺少** `deferUpdate()`

---

- [ ] **Step 2: 將 `src/events/price/price-menu.event.ts` 替換為以下內容**

```typescript
import { type Client, Events, MessageFlags } from "discord.js";
import { buildPriceView } from "../../services/price/price_list_builder.js";
import { PRICE_MENU_ID } from "../../types/price.type.js";
import { logger } from "../../services/logger/logger.js";

export function registerPriceMenuEvent(client: Client): void {
  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isStringSelectMenu()) return;
    if (interaction.customId !== PRICE_MENU_ID) return;

    const isEphemeral = interaction.message.flags.has(MessageFlags.Ephemeral);

    try {
      // Acknowledge interaction within 3 seconds to prevent 10062
      if (isEphemeral) {
        await interaction.deferUpdate();
      } else {
        if (!interaction.isRepliable()) return;
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      }

      const value = interaction.values[0];
      let view;

      if (value === "back:root") {
        view = buildPriceView(null);
      } else if (value.startsWith("back:")) {
        const parentId = value.slice(5);
        view = buildPriceView(parentId);
      } else {
        view = buildPriceView(value);
      }

      await interaction.editReply({
        embeds: view.embeds,
        components: view.components,
      });
    } catch (err) {
      logger.error({ err }, "Price menu interaction failed");
      try {
        const errorPayload = {
          embeds: [
            {
              title: "❌ 載入失敗",
              description: "載入失敗，請稍後再試。",
              color: 0xff0000,
            },
          ],
          components: [],
        };

        if (interaction.deferred || interaction.replied) {
          await interaction.editReply(errorPayload);
        }
      } catch {
        // interaction already responded or expired
      }
    }
  });
}
```

**關鍵變更說明：**
1. `isEphemeral === true` 路徑：新增 `await interaction.deferUpdate()` 在第一行，讓 Discord 知道 interaction 已確認（3 秒計時停止）
2. 兩條路徑最後統一使用 `await interaction.editReply()`，不再有 `interaction.update()`
3. 錯誤處理簡化：因為兩條路徑都必定先執行 `defer*`，所以只需判斷 `deferred || replied` 再呼叫 `editReply()`

---

- [ ] **Step 3: 驗證 TypeScript 型別正確**

在 `d:\ruralbot` 執行：
```bash
npx tsc --noEmit
```
預期：無任何錯誤輸出，exit code 0。

若出現 `interaction.editReply is not a function` 類型錯誤，確認 `interaction.isStringSelectMenu()` guard 已正確保留（第 8 行）。

---

- [ ] **Step 4: Commit**

```bash
git add src/events/price/price-menu.event.ts
git commit -m "fix(price): 修復 ephemeral select menu 10062，補上 deferUpdate 並統一改用 editReply"
```

---

## Task 2：修正 auto-deploy.sh 的 APP_DIR 路徑

**背景：** `ops/ruralbot-auto-deploy.sh` 目前 repo 內的 `APP_DIR` 為 `/opt/ruralbot`，但實際主機的 repo 路徑是 `/var/www/ruralbot`。
Codex 之前用 `sed -i` 修改了主機上的腳本，但因為腳本本身受 git 管理，下次 `git pull` 會把 repo 的舊版本拉下來覆蓋，導致自動部署再次壞掉。
正確做法是直接修改 repo 內的腳本，確保 git pull 後內容正確。

**Files:**
- Modify: `ops/ruralbot-auto-deploy.sh`

---

- [ ] **Step 1: 確認目前 APP_DIR 的值**

開啟 `ops/ruralbot-auto-deploy.sh` 第 4 行，確認目前為：
```bash
APP_DIR="/opt/ruralbot"
```

---

- [ ] **Step 2: 將第 4 行改為 `/var/www/ruralbot`**

將 `ops/ruralbot-auto-deploy.sh` 的第 4 行：
```bash
APP_DIR="/opt/ruralbot"
```
改為：
```bash
APP_DIR="/var/www/ruralbot"
```

修改後完整檔案應為：
```bash
#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/var/www/ruralbot"
LOCK_FILE="/tmp/ruralbot-deploy.lock"
BRANCH="main"

exec 9>"${LOCK_FILE}"
if ! flock -n 9; then
  echo "$(date -Is) deployment already running"
  exit 0
fi

cd "${APP_DIR}"

echo "$(date -Is) checking origin/${BRANCH}"
git fetch origin "${BRANCH}"

LOCAL_HEAD="$(git rev-parse HEAD)"
REMOTE_HEAD="$(git rev-parse "origin/${BRANCH}")"

if [ "${LOCAL_HEAD}" = "${REMOTE_HEAD}" ]; then
  echo "$(date -Is) no changes"
  exit 0
fi

echo "$(date -Is) updating ${LOCAL_HEAD} -> ${REMOTE_HEAD}"
git pull --ff-only origin "${BRANCH}"

npm ci
npx prisma migrate deploy
npm run build

systemctl restart ruralbot
echo "$(date -Is) deployment completed"
```

---

- [ ] **Step 3: 驗證腳本語法**

```bash
bash -n ops/ruralbot-auto-deploy.sh && echo "語法正確"
```
預期輸出：`語法正確`

---

- [ ] **Step 4: Commit 並 push**

```bash
git add ops/ruralbot-auto-deploy.sh
git commit -m "fix(deploy): 修正 auto-deploy.sh 的 APP_DIR 為實際主機路徑 /var/www/ruralbot"
git push origin main
```

push 後，主機的 auto-deploy cron 將在下一分鐘自動拉取此修正。

---

## Task 3：主機確認 PostgreSQL loop image 能在重開機後自動掛載

**背景：** Codex 將 PostgreSQL data directory 遷移至 `/srv/postgresql-hdd1`，其底層是掛載在 `/mnt/data` 的 NTFS 硬碟上的 loop image（`/mnt/data/postgresql/postgresql16-data.img`）。
若 `/etc/fstab` 沒有對應的掛載條目，重開機後 `/mnt/data` 和 loop image 都不會自動掛載，PostgreSQL 會因找不到 data directory 而啟動失敗。
本 Task 在 Ubuntu 主機（`/var/www/ruralbot` 所在機器）透過 SSH 執行。

**Files（主機端）:**
- Read: `/etc/fstab`
- 可能 Modify: `/etc/fstab`（若缺少條目）
- 可能 Create: systemd mount unit（若 NTFS fuse 用 systemd 管理）

---

- [ ] **Step 1: SSH 進入主機，確認目前掛載狀態**

```bash
# 確認 /mnt/data 與 /srv/postgresql-hdd1 目前是否已掛載
findmnt /mnt/data
findmnt /srv/postgresql-hdd1

# 確認 PostgreSQL data directory
sudo -u postgres psql -t -c "SHOW data_directory;"
```

預期：兩個路徑都顯示掛載資訊，data directory 顯示 `/srv/postgresql-hdd1/data`（或 Codex 遷移後的實際路徑）。

---

- [ ] **Step 2: 檢查 /etc/fstab 是否有對應條目**

```bash
cat /etc/fstab
```

確認是否存在以下兩筆（路徑依實際情況調整）：

1. NTFS 掛載（`/mnt/data`）的條目，例如：
   ```
   /dev/sdb1  /mnt/data  ntfs-3g  defaults,nofail  0  0
   ```
   或 UUID 格式：
   ```
   UUID=xxxx-xxxx  /mnt/data  ntfs-3g  defaults,nofail  0  0
   ```

2. Loop image 掛載（`/srv/postgresql-hdd1`）的條目，例如：
   ```
   /mnt/data/postgresql/postgresql16-data.img  /srv/postgresql-hdd1  ext4  loop,nofail  0  0
   ```

---

- [ ] **Step 3A: 若 fstab 缺少 NTFS 掛載條目，補上**

先確認 NTFS 分割區的 UUID：
```bash
sudo blkid | grep ntfs
# 或
lsblk -o NAME,UUID,FSTYPE,MOUNTPOINT | grep ntfs
```

取得 UUID 後，加入 fstab：
```bash
# 替換 <UUID> 與 <DEVICE>
echo 'UUID=<UUID>  /mnt/data  ntfs-3g  defaults,nofail,uid=1000,gid=1000  0  0' \
  | sudo tee -a /etc/fstab
```

驗證語法：
```bash
sudo mount -av 2>&1 | grep -E "/mnt/data|already mounted|successfully"
```

---

- [ ] **Step 3B: 若 fstab 缺少 loop image 掛載條目，補上**

```bash
echo '/mnt/data/postgresql/postgresql16-data.img  /srv/postgresql-hdd1  ext4  loop,nofail  0  0' \
  | sudo tee -a /etc/fstab
```

驗證語法：
```bash
sudo mount -av 2>&1 | grep -E "postgresql-hdd1|already mounted|successfully"
```

---

- [ ] **Step 4: 確認 PostgreSQL systemd service 在 mount 之後才啟動**

```bash
# 查看 postgresql service 的 After= 設定
systemctl cat postgresql@16-main.service | grep -E "After|Requires|Wants"
```

PostgreSQL service 需要在 loop image 掛載之後才啟動。若使用 fstab 掛載，systemd 會自動產生對應的 `.mount` unit（例如 `srv-postgresql\\x2dhdd1.mount`）。

確認對應 mount unit 存在：
```bash
systemctl list-units --type=mount | grep postgresql
```

若存在，確認 PostgreSQL service 有依賴此 mount unit：
```bash
# 若沒有自動依賴，手動建立 drop-in 設定
sudo mkdir -p /etc/systemd/system/postgresql@16-main.service.d/
sudo tee /etc/systemd/system/postgresql@16-main.service.d/mount-after.conf > /dev/null << 'EOF'
[Unit]
After=srv-postgresql\x2dhdd1.mount
Requires=srv-postgresql\x2dhdd1.mount
EOF
sudo systemctl daemon-reload
```

---

- [ ] **Step 5: 執行重開機模擬測試（不實際重開機）**

```bash
# 停止 PostgreSQL，卸載 loop image，再重新掛載，驗證流程
sudo systemctl stop postgresql@16-main

# 卸載（若失敗表示仍有連線）
sudo umount /srv/postgresql-hdd1 2>&1 || echo "umount failed, checking..."
sudo fuser /srv/postgresql-hdd1 2>&1

# 重新掛載（模擬開機）
sudo mount /srv/postgresql-hdd1

# 重啟 PostgreSQL
sudo systemctl start postgresql@16-main
sleep 5
sudo systemctl status postgresql@16-main --no-pager
sudo -u postgres psql -t -c "SHOW data_directory;"
# 預期：active (running)，data_directory 顯示 /srv/postgresql-hdd1/data
```

---

- [ ] **Step 6: 確認 ruralbot service 仍正常**

```bash
systemctl is-active ruralbot
# 預期：active
```

---

## Task 4：主機確認 reiko 可免密 sudo 執行 systemctl restart ruralbot

**背景：** `ops/ruralbot-auto-deploy.sh` 最後一行是 `systemctl restart ruralbot`，但腳本以 `reiko`（非 root）使用者透過 cron 執行。
若 `reiko` 沒有 `NOPASSWD` 的 sudo 權限，`systemctl restart` 會靜默失敗（exit code 非 0），導致服務沒有重啟，新版本跑不起來。
本 Task 在 Ubuntu 主機透過 SSH 執行。

**Files（主機端）:**
- 可能 Create: `/etc/sudoers.d/ruralbot-deploy`

---

- [ ] **Step 1: 測試目前 reiko 是否有免密 sudo**

以 `reiko` 身份（不是 root）執行：
```bash
sudo -n systemctl status ruralbot
echo "Exit code: $?"
```

- 若 exit code 為 0：`reiko` 已有免密 sudo，**跳過 Step 2 直接到 Step 3 驗證**。
- 若輸出 `sudo: a password is required` 或 exit code 非 0：需補上 sudoers 規則，繼續 Step 2。

---

- [ ] **Step 2: 補上 sudoers 免密規則**

```bash
# 建立 sudoers drop-in 檔（用 visudo 語法驗證，避免語法錯誤鎖死 sudo）
echo 'reiko ALL=(ALL) NOPASSWD: /bin/systemctl restart ruralbot, /bin/systemctl status ruralbot' \
  | sudo tee /etc/sudoers.d/ruralbot-deploy

# 設定正確權限（sudoers.d 檔案必須是 440）
sudo chmod 440 /etc/sudoers.d/ruralbot-deploy

# 驗證語法（若有語法錯誤，visudo 會報告並拒絕儲存）
sudo visudo -c -f /etc/sudoers.d/ruralbot-deploy
# 預期輸出：/etc/sudoers.d/ruralbot-deploy: parsed OK
```

---

- [ ] **Step 3: 驗證免密 sudo 生效**

以 `reiko` 身份（不是 root）執行：
```bash
# 測試不需要密碼即可 restart
sudo -n systemctl restart ruralbot
echo "Exit code: $?"
sleep 3
systemctl is-active ruralbot
# 預期：exit code 0，服務為 active
```

---

- [ ] **Step 4: 模擬 cron 執行腳本，確認 restart 正常**

```bash
# 手動以 cron 同等環境執行腳本（HOME 與 PATH 與 cron 一致）
env -i HOME=/home/reiko PATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin \
  bash /opt/deploy-framework/scripts/ruralbot-deploy.sh
# 預期：出現 "no changes" 或完整部署流程，最後 "deployment completed"
# 不應出現 "permission denied" 或 "password is required"
```

---

- [ ] **Step 5: 確認 deploy log 有成功記錄**

```bash
tail -10 /opt/deploy-framework/logs/ruralbot-deploy.log
# 預期最後一筆：...no changes 或 deployment completed
# 不應有 sudo 相關錯誤
```

---

## 完成驗證清單

Task 1–2 完成後（repo 端）：
```bash
# 本機確認
npx tsc --noEmit && echo "TypeScript OK"
git log --oneline -3
# 預期最新兩筆分別為 price fix 與 APP_DIR fix 的 commit
```

Task 3–4 完成後（主機端）：
```bash
echo "=== fstab ===" && grep -E "postgresql|mnt/data" /etc/fstab
echo "=== pg status ===" && systemctl is-active postgresql@16-main
echo "=== pg data dir ===" && sudo -u postgres psql -t -c "SHOW data_directory;"
echo "=== sudo test ===" && sudo -n systemctl status ruralbot > /dev/null && echo "sudo OK"
echo "=== ruralbot ===" && systemctl is-active ruralbot
```

全部輸出正常後，向使用者回報完成。
