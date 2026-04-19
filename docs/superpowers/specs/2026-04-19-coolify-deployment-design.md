# Coolify 部署修整設計

## 目標

將 RuralBot 從既有外部部署平台遷移到自有主機上的 Coolify，並讓 Discord bot、dashboard 與健康檢查在容器環境中穩定運作。

## 高信心依據

- Coolify Dockerfile 型應用使用 UI health check 時，容器內需具備 `curl` 或 `wget`。
- Dockerfile 型部署需由應用自行監聽正確 port 與 `0.0.0.0`。
- Discord gateway 斷線與重連屬半常態事件，不應直接當成容器不健康。

## 設計決策

### 1. 提前啟動 HTTP dashboard

- `startDashboard(client)` 在 Discord `client.login()` 前執行。
- 目的：讓 Coolify 可在 Discord 尚未 fully ready 前先檢查 HTTP 存活。

### 2. 增加 `/healthz`

- 提供最早可回應的 HTTP 健康檢查端點。
- 回傳內容包含：
  - `ok`
  - `discordReady`
  - `uptimeSec`
- 此端點主要代表 HTTP 與程序可存活，不以 Discord ready 作為失敗條件。

### 3. Dockerfile 保留 `curl`

- 於 `node:20-slim` 內安裝 `curl`。
- 目的：滿足 Coolify UI health check 執行需求。

### 4. 健康檢查設定

- Build Pack：`Dockerfile`
- Port：`3000`
- Health Check Path：`/healthz`
- Health Check Port：`3000`
- 單實例部署

## 已知限制

- 若使用 UI health check 而 image 內缺少 `curl`/`wget`，Coolify 會將容器標為 `unhealthy` 並回滾。
- 若公開 DNS 尚未設定，自訂網域不可直接用於 callback 或對外 dashboard 存取。
- `RAILWAY_PUBLIC_URL` 目前仍存在於 keepalive 邏輯中，後續應收斂為通用平台變數。

## 後續建議

- 將平台相關 env 命名抽象化，例如 `APP_URL`。
- 清理暫存 log 與 build context 雜訊。
- 視需求評估將 production 啟動改為編譯後 JS，而非直接以 `tsx` 執行 TS。
