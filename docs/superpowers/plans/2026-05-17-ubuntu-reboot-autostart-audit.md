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
