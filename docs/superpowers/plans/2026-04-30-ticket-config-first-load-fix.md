# 2026-04-30 票口設定首次載入 404 修復

## 問題

管理面板進入票口頁面時，前端會呼叫：

```text
GET /api/ticket/config/:guildId
```

若該 guild 尚未建立 `ticket_configs` 資料列，後端原本回傳 `404 Config not found`。這會讓瀏覽器 console 顯示 API 404，也讓新伺服器第一次進入票口設定時需要先經過錯誤狀態。

## 三重審查

1. 官方文件確認：Express 路由可用 path parameter 處理 `/api/ticket/config/:guildId`，此路由本身已正確掛載。
2. 程式碼檢查：正式主機 `/var/www/ruralbot/dist/services/dashboard/server.js` 已存在該路由；404 body 為 `{"error":"Config not found"}`，代表不是 Nginx 或 SPA fallback，而是資料尚未初始化。
3. 專案慣例檢查：票口設定頁屬於 dashboard 管理入口，首次開啟應可直接取得預設設定並編輯，符合價目表設定的管理體驗。

## 修正

- 新增 `getOrCreateTicketConfig(guildId)`。
- `GET /api/ticket/config/:guildId` 改為自動 upsert 預設設定。
- `PUT /api/ticket/config/:guildId` 保持既有更新語意。

## 驗證

- `npm run build` 通過。
- 部署後需驗證正式主機：

```bash
curl -i http://127.0.0.1/api/ticket/config/1329723956000718889
```

預期回應為 HTTP 200 與預設票口設定 JSON。
