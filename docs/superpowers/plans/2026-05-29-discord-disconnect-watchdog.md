# Discord 斷線自癒修正 - 2026-05-29

## 背景

使用者回報 Discord 機器人斷線。嘗試從本機連線 `192.168.254.84:22` 時 SSH 逾時，`tracert` 第一跳回報 `Destination host unreachable`，因此本次無法直接讀取主機 `journalctl` 或重啟正式服務。

## 三重審查

1. 官方文件審查：依 systemd 官方 man page，長駐服務可用 `Restart=` 由 systemd 接手重啟，並需注意 start limit；依 discord.js 事件與型別，Gateway 狀態與 shard 事件可用來判斷是否長時間未恢復。
2. 程式與部署審查：`src/index.ts` 已記錄 `ShardDisconnect`、`ShardError`、`ShardReconnecting`、`ShardResume`，但若程序仍存活卻長時間未恢復 Ready，systemd 不會重啟。`client.login()` 原本未處理拒絕結果，登入失敗可能只留下 unhandled rejection 紀錄。
3. 維運慣例審查：現行部署使用 Ubuntu systemd 單服務，新增程序內 watchdog 並讓 systemd restart 接手，符合單實例部署與健康檢查優先以 HTTP 存活/Discord Ready 分離的慣例。

## 實作內容

- 新增 `src/services/discord/gateway_watchdog.ts`。
- 啟動後若 Discord client 在預設 2 分鐘內未 Ready，記錄 fatal 並退出，交由 systemd 重啟。
- Gateway 出現 disconnect/error/reconnecting 後，若預設 5 分鐘仍未恢復 Ready，記錄 fatal 並退出，交由 systemd 重啟。
- 支援環境變數調整：
  - `DISCORD_INITIAL_READY_TIMEOUT_MS`
  - `DISCORD_GATEWAY_STALE_TIMEOUT_MS`
  - `DISCORD_GATEWAY_WATCHDOG_INTERVAL_MS`
- 補上 `client.login()` 失敗處理，登入失敗會以非 0 狀態結束。
- 補強 `ops/ruralbot.service.example` 的 `StartLimitIntervalSec`、`StartLimitBurst`、`RestartSteps` 與 `RestartMaxDelaySec`。

## 驗證

- `npm run build`

## 後續部署

主機網路恢復後需執行：

```bash
git pull --ff-only origin main
npm ci
npm run install:dashboard
npx prisma migrate deploy
npm run build
sudo systemctl daemon-reload
sudo systemctl restart ruralbot
curl -fsS http://127.0.0.1:3000/healthz
```

若正式機 service 尚未套用新版範本，需同步更新 `/etc/systemd/system/ruralbot.service` 的 start limit 與 restart 設定。
