# 2026-07-17 記帳系統全面審查與升級

## 背景

使用者要求對記帳系統做設計層級審查：找出死邏輯與「沒想到的部分」、系統層面優化，並對比市場記帳系統點出缺陷。本次以 1 個結構盤點 agent + 1 個市場研究 agent + 3 個並行審查 agent（正確性／金額模型／系統層面）+ 1 個最終把關 opus 審查完成三重審查流程。

## 審查發現（依嚴重度）

### 已修復

| # | 缺陷 | 嚴重度 | 修復 |
|---|---|---|---|
| 1 | 日期分桶用 UTC 曆日：台北 00:00–08:00 建的訂單歸到前一天（跨月/年時錯月/錯年），且 order-lookup（台北曆日）與 sales-overview（UTC 曆日）對「同一天」定義不一致，兩邊對不上帳 | major（靜默錯帳） | 新增 `src/services/accounting/tz_date.ts` 台北曆日工具；`repo_order.ts` 的 `$queryRaw` 分桶改 `(created_at + INTERVAL '8 hours')`（台灣無 DST）；sales-overview／order-lookup／sales-export／討論串命名／backfill 全部統一台北曆日 |
| 2 | 訂單硬刪除、無操作人記錄：財務記錄可被無痕抹除，多人記帳無法追責 | major | Order 加 `createdBy`／`deletedAt`／`deletedBy`；`/order-delete` 改為作廢（軟刪除，`updateMany` 原子操作防連點）；新增 `/order-restore` 復原；作廢/復原都會 fail-soft 通知記帳討論串；所有範圍/聚合查詢過濾作廢單（`getOrderById` 刻意保留可查作廢單供稽核） |
| 3 | Order 表零索引：日期範圍/聚合查詢全表掃描 | critical（擴放懸崖） | schema 加 `@@index([createdAt])`、`@@index([productId])`，migration：`src/prisma/migrations/20260717000000_order_audit_soft_delete/` |
| 4 | sales-overview 一次 `getOrders()` 拉整段期間進記憶體，前端切片假分頁 | critical（擴放懸崖） | 改資料庫層分頁（`countOrders` + skip/take），UI 行為不變 |
| 5 | dashboard orders API 無上限 + 每筆訂單各查一次 tickets（N+1） | critical（擴放懸崖） | 加 limit（預設 200/上限 500）、tickets 改一次 `in` 查詢；回應含 `totalCount`，前端顯示截斷提示 |
| 6 | deploy-commands.mjs 有 11 個指令缺 `setDefaultMemberPermissions`（含 order-delete、payment）——實際部署到 Discord 的是這個檔，線上權限比 src 寬 | major（安全） | 逐指令對照 src 鏡像補齊（src 本來就公開的 rp/price-list/ticket-admin 維持公開）；option 的 min/max 鏡像同步補齊 |
| 7 | thread_logger 找封存討論串只抓一頁：運行數月後對舊日期補單會重複建串 | major | 改 `before` 游標翻頁遍歷 active + archived 全部討論串 |
| 8 | backfill 執行中若另有人同時下單，該單會被重複發送 embed | major | thread_logger 記錄 `recentlyLoggedOrderIds`（session 內），backfill 發送前檢查跳過；另因分桶改台北曆日，backfill 去重會聯集掃「當天＋前一天」名稱的討論串，涵蓋舊 UTC 命名位移 |
| 9 | 帳目資料鎖死在 Discord，無法交給會計流程（市場對比前 5 大落差） | major | 新增 `/sales-export`：台北曆日區間 CSV 匯出（UTF-8 BOM、RFC 4180 跳脫、上限 5000 筆截斷註明、附營收/成本/利潤總計） |
| 10 | 付款成功通知文案「已成功登入消費紀錄」但實際不寫任何帳——誤導維運者以為有自動記帳 | minor（文案） | 改為「付款成功」，不再暗示已記帳 |
| 11 | 單列顯示混用「單價」與「總利潤」易誤讀（總計本身正確）；輸入驗證缺口（face_value/custom_price 可負值、名稱無長度上限炸 autocomplete/embed）；product-list collector 無 try/catch 防護；order-lookup 非法日期落通用錯誤 | minor | 補 `setMinValue(0)`/`setMaxLength(80)`（src 與 deploy 鏡像）、product-list 補防重入與錯誤處理、order-lookup 補曆法驗證 |
| 12 | 死邏輯：`getCategoryProductCount`／`getProductByName`／`getProductOrderCount` 全庫零呼叫（指令端已內聯同等邏輯） | minor | 刪除 |

### 審查確認沒問題的部分

- **Float 存台幣金額**：經實測（PostgreSQL DOUBLE PRECISION，binary64），台幣整數與現行折數值在 53 位尾數內完全精確，100 萬筆累積誤差實測為 0。**現況不造成錯帳**，未改金額型別。唯一注意：日後若與 `PaymentTransaction.amount Int` 整合，換算時要用 `Math.round` 不可 `floor`。
- **成本快照設計正確**：Order 存 `actualPrice/actualCost` 快照，改商品價不竄改歷史帳；刪商品 `SetNull` + 保留 `productName`。
- **聚合語義一致**：aggregateSales 正確處理「營收乘 quantity、profit 已預乘」，overview 與 dashboard 同源。
- **權限（src 端）**：12 個記帳指令一致為 Administrator。
- **logger 覆蓋**：關鍵路徑均有足夠上下文。

## 數值行為影響聲明

- 日期分桶改台北曆日後，**歷史報表的日/月/年歸屬會變**：過去在台北 00:00–08:00 建立的訂單，重新查詢時會歸入正確的台北日（先前被歸前一天）。這是修正而非漂移；金額本身不變。
- 新建討論串自此按台北日命名；既有依 UTC 日命名的討論串不搬移，backfill 去重已涵蓋兩種命名。
- 聚合統計自此排除作廢單（先前硬刪除後統計同樣不含，語義連續）。

## 主機部署步驟

1. `git pull` 後 `npm run install:all`（若 lock 有變）與 `npm run build`。
2. `npx prisma migrate deploy` —— 套用 `20260717000000_order_audit_soft_delete`（三個 nullable 新欄 + 兩索引，對既有資料安全，可即時上線）。
3. `node deploy-commands.mjs` —— **必跑**：註冊 `/order-restore`、`/sales-export` 並修正 11 個指令的線上權限預設值。
4. 重啟 bot service。

## 未實作（roadmap，需產品決策）

1. **付款 → 記帳自動整合**：付款成功自動建 Order（需決定金流品項與商品目錄的對應規則）。目前仍靠人工補單，漏單風險存在。
2. **`/order-edit`**：打錯數量/價格目前只能作廢重建（作廢已留痕，比先前刪除重建好，但仍非編輯）。
3. **`linkOrder` 串接**：`repo_ticket_instance.ts:127` 的 Order↔TicketInstance 關聯函式從未被呼叫（原設計稿 `docs/superpowers/plans/2026-03-20-ticket-system.md` 有規劃），dashboard 的 orders.tickets 恆為空。
4. **銷售排行/圖表**：aggregateSales 尚無 groupBy 商品/分類，拿不到「這個月什麼賣最好」。
5. **主機每日 pg_dump 備份排程**：程式庫內未找到備份腳本證據，需在主機端確認/建立。
6. **庫存、稅務、多幣別、dashboard 寫入**：市場對比中的落差，對現行單店台幣場景優先度低。
7. `/sales-export` 為非 ephemeral 回覆（與 sales-overview 慣例一致）：財務全表對頻道成員可見，若記帳頻道權限收緊即無虞，需有意識確認。
