# 2026-05-08 SmilePay callback 對外連線診斷

## 問題

SmilePay 通知信顯示客戶已繳款完成，但 Roturl 連續拋送失敗。信件中的回送位置為：

```text
http://211.22.158.125/api/payment/callback
```

本次從開發機對 production URL 測試，`211.22.158.125` 可以 ping 到，但 TCP 80 連線失敗；直接打 `http://211.22.158.125/`、`/api/payment/callback` 與 `:3000/api/payment/callback` 皆逾時。這代表 SmilePay 目前不是進到 Express callback 後被程式拒絕，而是公網 HTTP 入口不可達。

## 三重審查

1. 官方文件：SmilePay 金流 Q&A「已繳費未入帳」指出程式串接建議帶 `Roturl_status`，Roturl 正常接收後必須回覆與 `Roturl_status` 相同內容；若未回覆或回覆不同，SmilePay 會重新傳送交易完成資料，最多 8 次。來源：https://www.smilepay.net/em/FAQ-F-record.asp
2. 程式碼與部署設定：`/api/payment/callback` 已支援 GET/POST，成功回覆為純文字 `SmilePay_OK`；`src/services/dashboard/server.ts` 預設監聽 `0.0.0.0:3000`，Nginx 範本應將 80 proxy 到 `127.0.0.1:3000`。但 `ops/ruralbot-auto-deploy.sh` 原本預設部署目錄為 `/opt/ruralbot`，實機卻是 `/var/www/ruralbot`，已改成自動偵測並保留 `RURALBOT_APP_DIR` 覆蓋。
3. 主機實測：`192.168.254.84:80` 內網可通，`211.22.158.125:80` 從主機與外部測試皆逾時。`ufw` 已放行 80/443，Nginx 也正常 listen 80，但 UPnP 沒有 IGD，代表公網入口卡在上層路由器/NAT。
4. 維運慣例：正式部署以 Ubuntu systemd 單服務為準，`SMILEPAY_ROTURL`、Nginx 80 port、dashboard 實際監聽 port 必須一致；若公網 IP 仍無法直達主機，必須先修路由器 port forwarding，不能只重啟服務。

## 變更

- 將 `ops/ruralbot-auto-deploy.sh` 改為優先使用 `RURALBOT_APP_DIR`，否則自動選擇 `/opt/ruralbot`，最後回退到 `/var/www/ruralbot`，避免服務與部署路徑再度分岔。

## Production 必查項目

在 Ubuntu 主機上依序檢查：

```bash
sudo systemctl status ruralbot --no-pager
sudo journalctl -u ruralbot -n 120 --no-pager
sudo ss -ltnp | grep -E ':80|:3000'
sudo nginx -t
sudo systemctl status nginx --no-pager
sudo ufw status verbose
curl -i http://127.0.0.1:3000/healthz
curl -i -X POST http://127.0.0.1:3000/api/payment/callback \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data "Od_sob=PING-NOT-EXIST&Amount=1&Classif=C&Roturl_status=SmilePay_OK"
curl -i -X POST http://127.0.0.1/api/payment/callback \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data "Od_sob=PING-NOT-EXIST&Amount=1&Classif=C&Roturl_status=SmilePay_OK"
```

外部測試必須看到 80 port TCP 成功，才有機會接到 SmilePay：

```powershell
Test-NetConnection 211.22.158.125 -Port 80
Invoke-WebRequest -Uri "http://211.22.158.125/api/payment/callback" -Method POST -ContentType "application/x-www-form-urlencoded" -Body "Od_sob=PING-NOT-EXIST&Amount=1&Classif=C&Roturl_status=SmilePay_OK"
```

測試 unknown order 回 `ERROR` 是正常的；重點是必須快速取得 HTTP 回應，不可逾時。

## 風險與回滾

- 本次只調整部署腳本預設目錄與文件，不修改資料庫 schema、payment callback 邏輯或 Discord 通知邏輯。
- 若正式主機實際刻意使用 `/var/www/ruralbot`，可在 cron 環境明確設定 `RURALBOT_APP_DIR=/var/www/ruralbot` 覆蓋預設值；不需要改回 destructive 部署流程。
