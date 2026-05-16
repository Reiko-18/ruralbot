# Ubuntu 主機重啟自動啟動審查與修正 - 2026-05-17

## 背景

本次透過 SSH 盤點 `192.168.254.84` Ubuntu 主機上的部署服務，確認主機重新開機後，各專案是否會自動啟動；若不足則補齊設定。

審查時同步參考官方文件確認以下方向：

- systemd 長期開機自啟以 `systemctl enable` 管理。
- Docker / Docker Compose 需有適當 restart policy。
- PM2 需建立對應的 systemd startup service，並保存目前 process list。

## 審查結果

### 已具備開機自啟

- `ruralbot.service`
- `admin-panel.service`
- `snr-bot.service`
- `webhook.service`
- `docker.service`
- `nginx.service`
- `postgresql.service`
- `cloudflared.service`
- `snr-bot-auto-deploy.timer`
- `ubuntu-dashboard-auto-deploy.timer`

### 原本有缺口或風險

- `scloud` 的 `postgres` / `redis` / `minio` 容器 restart policy 為 `no`，主機重開後不保證自動回來。
- `scloud` 應用層由 PM2 管理，但原本沒有 `pm2-reiko.service`。
- root crontab 仍殘留舊版 `/opt/check_and_deploy_ruralbot.sh`，內含 `git reset --hard origin/main`，與現行部署策略衝突。
- `coolify-sentinel` 容器 restart policy 為 `no`。

## 實際修正

### 1. Ruralbot

- 驗證 `ruralbot.service` 仍為 `enabled`。
- 驗證 `/healthz` 可正常回應。
- 保留目前可運行的：

```ini
ExecStart=/var/www/ruralbot/node_modules/.bin/tsx /var/www/ruralbot/dist/index.js
```

### 2. Scloud

- 在 `/home/reiko/scloud/docker-compose.yml` 的 `postgres`、`redis`、`minio` 補上：

```yaml
restart: unless-stopped
```

- 套用 `docker compose up -d`。
- 另外對既有容器補做 `docker update --restart unless-stopped`。

### 3. PM2

- 以 PM2 官方 startup 流程建立 `pm2-reiko.service`。
- 執行 `pm2 save` 保存目前的 `scloud-server` / `scloud-web`。
- 清掉舊 PM2 daemon 後，由 systemd 接管啟動。

### 4. 舊部署排程清理

- 移除 root crontab 中的 `/opt/check_and_deploy_ruralbot.sh` 舊排程。
- 保留目前 `reiko` 使用者的 `/opt/deploy-framework/scripts/ruralbot-deploy.sh`。

### 5. 其他容器

- 將 `coolify-sentinel` 改為 `restart=unless-stopped`。

## 驗證結果

### systemd / timer

- `ruralbot`: `enabled`, `active`
- `admin-panel`: `enabled`, `active`
- `snr-bot`: `enabled`, `active`
- `webhook`: `enabled`, `active`
- `docker`: `enabled`, `active`
- `nginx`: `enabled`, `active`
- `postgresql`: `enabled`, `active`
- `pm2-reiko`: `enabled`, `active`
- `snr-bot-auto-deploy.timer`: `enabled`, `active`
- `ubuntu-dashboard-auto-deploy.timer`: `enabled`, `active`

## 實機 reboot 測試結果

### 第一次 reboot

第一次實際重開機後，`ruralbot`、PostgreSQL、PM2 與部分 systemd 服務有正常回來，但發現兩個實際問題：

- `nginx.service` 啟動失敗，原因是 `apache2` 已先佔用 `0.0.0.0:80`。
- `docker.service` 與 `snr-bot.service` 留在 systemd job queue 中未完成，原因是 CasaOS 服務鏈路卡住。

進一步追查後確認：

- `casaos-gateway.service` 原本為 disabled。
- CasaOS 其他服務依賴 `/var/run/casaos/management.url`，但該檔案由 `casaos-gateway` 產生。
- 啟用 `casaos-gateway` 後又因 gateway 預設綁定 `port=80`，與 `nginx` 衝突而失敗。
- `casaos-local-storage.service` 設定了 `Before=docker.service`，CasaOS 鏈路失敗會連帶拖住 Docker 與 `snr-bot` 開機流程。

### 實際追加修正

- 停用並 mask `apache2.service`，避免重開機後搶佔 80 port。
- 保留 `nginx.service` 作為 80 port 正式入口。
- 啟用 `casaos-gateway.service`。
- 將 `/etc/casaos/gateway.ini` 的 CasaOS gateway port 從 `80` 改為 `8081`。
- 重啟 CasaOS chain，確認以下服務皆為 `enabled` / `active`：
  - `casaos-gateway`
  - `casaos-message-bus`
  - `casaos-user-service`
  - `casaos`
  - `casaos-local-storage`
  - `casaos-app-management`
- 啟動並確認 `docker.service`、`snr-bot.service` 皆恢復 `enabled` / `active`。

### 第二次 reboot 驗證

第二次實際重開機後，確認無需手動介入即可恢復：

- `ruralbot`: `enabled`, `active`
- `admin-panel`: `enabled`, `active`
- `snr-bot`: `enabled`, `active`
- `webhook`: `enabled`, `active`
- `docker`: `enabled`, `active`
- `nginx`: `enabled`, `active`
- `postgresql`: `enabled`, `active`
- `pm2-reiko`: `enabled`, `active`
- `cloudflared`: `enabled`, `active`
- `casaos-gateway`: `enabled`, `active`
- `casaos-message-bus`: `enabled`, `active`
- `casaos-user-service`: `enabled`, `active`
- `casaos`: `enabled`, `active`
- `casaos-local-storage`: `enabled`, `active`
- `casaos-app-management`: `enabled`, `active`
- `apache2`: `masked`, `inactive`
- `snr-bot-auto-deploy.timer`: `enabled`, `active`
- `ubuntu-dashboard-auto-deploy.timer`: `enabled`, `active`

第二次 reboot 後也確認：

- `systemctl list-jobs` 顯示 `No jobs running`。
- `nginx` 綁定 `0.0.0.0:80`。
- `ruralbot /healthz` 回應 `{"ok":true,"discordReady":true}`。
- `scloud-server` / `scloud-web` 由 PM2 自動恢復為 `online`。
- Docker 容器自動恢復，包含 `scloud`、`snr-bot`、`coolify`、`cloudreve`、monitoring、filebrowser。
- `snr-bot-app` 與 `monitor_cadvisor` health check 最終皆轉為 `healthy`。

### Ruralbot 健康檢查

`http://127.0.0.1:3000/healthz` 回應：

```json
{"ok":true,"discordReady":true,"uptimeSec":44}
```

### PM2

- `scloud-server`: `online`
- `scloud-web`: `online`

### Docker restart policy

- `scloud-postgres-1`: `unless-stopped`
- `scloud-redis-1`: `unless-stopped`
- `scloud-minio-1`: `unless-stopped`
- `snr-bot-app`: `unless-stopped`
- `snr-bot-postgres`: `unless-stopped`
- `cloudreve`: `unless-stopped`
- `big-bear-filebrowser`: `unless-stopped`
- `coolify-sentinel`: `unless-stopped`
- 其餘 `coolify` / `monitoring` / `local-server-stack` 相關容器已為 `always`

## 重要風險註記

本次曾依 repo 範本嘗試將 `ruralbot.service` 改為：

```ini
ExecStart=/usr/bin/node /var/www/ruralbot/dist/index.js
```

但實機立即失敗，錯誤為 Prisma 產生物在目前部署環境下出現 ESM 匯入解析錯誤：

- `ERR_MODULE_NOT_FOUND`
- `file:///var/www/ruralbot/dist/prisma/generated/prisma/internal/class`

因此本次已回復為可正常運行的 `tsx /var/www/ruralbot/dist/index.js`。在未先修正 Prisma 產物或 build / runtime 相容性前，不應直接把正式機改回純 `node dist/index.js`。

## 後續建議

1. 針對 `ruralbot` 另外開一個部署相容性修正任務，釐清 Prisma generated client 與目前 Node ESM 輸出的落差。
2. 若要更完整驗證重開機行為，可安排維護時段實做一次主機 reboot，並逐項檢查 service、timer、PM2 與 Docker 容器回復狀態。

## 每日休息維護排程

### 目標

主機每日凌晨 04:00 關機休息，並於早上 06:00 自動開機。

### 官方機制與前置驗證

採用 Linux RTC wake alarm 與 `rtcwake`。實作前已確認：

- `/usr/sbin/rtcwake` 存在，版本為 util-linux `2.39.3`。
- RTC 裝置為 `/sys/class/rtc/rtc0`。
- 系統時區為 `Asia/Taipei`。
- RTC 使用 UTC，`rtcwake` 可正確寫入 wake alarm。
- 以 `rtcwake -m no -s 180` 做不關機寫入測試，`alarm_IRQ` 成功變為 `yes`，測試後已清除 wake alarm。

### 實作內容

新增遠端主機檔案：

- `/usr/local/sbin/daily-maintenance-poweroff.sh`
- `/etc/systemd/system/daily-maintenance-poweroff.service`
- `/etc/systemd/system/daily-maintenance-poweroff.timer`

timer 設定：

```ini
[Timer]
OnCalendar=*-*-* 04:00:00
Persistent=true
Unit=daily-maintenance-poweroff.service
```

腳本行為：

1. 計算下一個 `06:00` 的 epoch。
2. 清除既有 `/sys/class/rtc/rtc0/wakealarm`。
3. 使用 `rtcwake -m off -t <epoch>` 設定 RTC 喚醒並關機。

### 驗證結果

- `daily-maintenance-poweroff.timer`: `enabled`, `active`
- `bash -n /usr/local/sbin/daily-maintenance-poweroff.sh`: 通過
- `systemd-analyze calendar '*-*-* 04:00:00'`: 下一次觸發為 `2026-05-17 04:00:00 CST`
- 腳本計算的下一次喚醒時間為 `2026-05-17 06:00:00 +08:00`

### 注意事項

- 此排程會讓主機每日 04:00 到 06:00 離線，期間 Discord bot、dashboard、Docker 專案、PM2 專案與 webhook 都不可用。
- 若 BIOS / 主機板韌體日後停用 RTC wake，Linux 排程仍會關機，但可能無法自動開機；目前 RTC 寫入測試已通過。
- 若需要臨時停用每日關機，可執行：

```bash
sudo systemctl disable --now daily-maintenance-poweroff.timer
sudo sh -c 'echo 0 > /sys/class/rtc/rtc0/wakealarm'
```
