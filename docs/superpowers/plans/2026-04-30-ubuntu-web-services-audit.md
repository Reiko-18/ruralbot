# 2026-04-30 Ubuntu Web 服務稽核與修復

## 背景

使用者要求確認 Ubuntu 主機上所有需要 Web 入口的專案都能順利運行。此次檢查延續同日 RuralBot dashboard 反向代理修復，目標是確認主機上的 Nginx、systemd 服務、Docker Web 容器與公開入口狀態。

## 三重審查

1. 官方文件確認：Nginx 依 `server_name` 與 `Host` header 選擇虛擬主機；Docker 既有容器的 restart policy 可透過 `docker update --restart` 調整。
2. 主機設定檢查：確認 `/etc/nginx/sites-enabled` 啟用 `ruralbot` 與 `scloud`，`nginx -t` 通過，`ruralbot.service`、`admin-panel.service`、Docker、PostgreSQL 與 Nginx 均在運行。
3. 維運風險檢查：未修改資料庫、env、憑證或應用程式碼；僅停用一個無資料掛載、無直接對外 port、已失去 Compose artifact 且持續失敗重啟的 Coolify 舊部署容器。

## 本次主機修復

- 停用並停止 Coolify 殘留容器 `o2fsbla7wafo5gj0tng74eg2-190459883730` 的自動重啟。
- 該容器屬於 Coolify 專案 `snr-bot` 的舊應用部署，啟動命令缺少 `bash -c` 後方參數，因此持續以 exit code 2 重啟。
- 主機上實際運行中的 SNR Bot Web 服務為 `snr-bot-app`，透過 `10000` port 回應健康狀態，未受影響。

## 驗證結果

- `http://192.168.254.84/`：RuralBot 管理面板，HTTP 200。
- `http://192.168.254.84/healthz`：RuralBot healthz，HTTP 200。
- `http://192.168.254.84:8000/`：Coolify，HTTP 200。
- `http://192.168.254.84:8080/`：File Browser，HTTP 200。
- `http://192.168.254.84:9101/`：MinIO Console，HTTP 200。
- `http://192.168.254.84:5212/`：Cloudreve，HTTP 200。
- `http://192.168.254.84:10000/`：SNR Bot，HTTP 200。
- 主機本機 `Host: ruralshop.top` 與 `Host: www.ruralshop.top` 經 Nginx 可正確路由至 Scloud。

## 尚待外部平台處理

- `ruralshop.top` 與 `www.ruralshop.top` 的公開 DNS 目前指向 Cloudflare proxy IP。
- 從外部直接存取 `ruralshop.top` 回 HTTP 404，`www.ruralshop.top` 回 Cloudflare 1014。
- 主機本機 Nginx 路由正常，因此剩餘問題不在 Ubuntu 主機內的 Nginx 或 Scloud 服務，而是 Cloudflare DNS、CNAME 或 proxy 來源設定需要修正。

## 回滾方式

若需要恢復該 Coolify 舊容器，可在主機執行：

```bash
docker update --restart=unless-stopped o2fsbla7wafo5gj0tng74eg2-190459883730
docker start o2fsbla7wafo5gj0tng74eg2-190459883730
```

但該容器目前仍會因缺少啟動命令再次失敗，建議改由 Coolify 重新部署或移除舊應用紀錄。
