# 全面 Bug 稽核與修復（2026-07-16）

## 方法
以多代理工作流對手寫碼（`src/`、`dashboard/src/`、`deploy-commands.mjs`，排除 Prisma 生成碼）做
**8 維度並行掃描**（併發/非同步、Discord 錯誤路徑、安全與金流驗證、資料一致性、輸入驗證邊界、
資源洩漏、業務邏輯正確性、API 相容性與前端），去重後對每個 finding 派獨立 opus 敵對驗證員嘗試反駁。
共 31 個 raw findings，全數 CONFIRMED（0 誤報、0 不確定）。修復後由獨立 opus code-reviewer
覆核，結論「可合入、無 blocker」。

## 嚴重度分佈
6 blocker / 11 major / 14 minor。

## 兩項使用者決策
- **Dashboard 存取控制**：採 Express Basic Auth（env `DASHBOARD_USER`/`DASHBOARD_PASS`，fail-closed，
  排除 `/api/payment/callback`）。
- **SmilePay 回呼驗證**：設了 `SMILEPAY_MERCHANT_VERIFY_PARAM` 才強制驗 `Mid_smilepay`（fail-closed），
  未設則放行但大聲警告；金額比對與 Smseid 一律啟用。

## 主要修復
### 金流安全（blocker）
- `payment_callback.ts`：`Mid_smilepay` 改條件式 fail-closed；一律加 `callback Amount === transaction.amount`
  硬比對；改用 `completePendingTransaction`（`updateMany where status:'PENDING'`）原子轉態，`count===1`
  才發成功通知，杜絕並發回呼重複通知。
- `repo_payment_transaction.ts`：新增 `completePendingTransaction`/`failPendingTransaction`；`createTransaction`
  對 P2002 明確 warn 後重拋（不在底層換 orderId 重試，避免與已送 SmilePay 的 orderId 脫鉤誤配）。
- `dashboard/server.ts`：新增 Basic Auth middleware（timingSafeEqual、fail-closed 503、排除 callback）。
- `dashboard/routes/payment.ts`：`GET/PUT /config` 遮蔽 `dcvc/rvg2c/verifyKey` 改回布林；PUT 留空不覆寫；
  移除 `/test-callback` 後門。
- `rp.cmd.ts` / `rp-interact.event.ts`：remark 改 nanoid token 不進 customId（防 100 字元超限崩潰）；
  handleConfirm 改為先建 PENDING 交易再呼叫 SmilePay、失敗標 FAILED（防孤兒交易）；catch 對已 ack 的
  button 改 editReply；快取加清理 + 15 分鐘 TTL。

### 正確性與資料一致性（major）
- `repo_order.ts`：`aggregateSales` 改 `$queryRaw` 用 `SUM(actual_price*quantity)` 修正數量>1 訂單營收/成本
  低估（`profit` 已含 quantity 不重乘），確保 `totalRevenue - totalCost === totalProfit`。
- `sales-overview.cmd.ts`：查詢區間改 UTC 曆日邊界對齊選單 `EXTRACT`；collector 加 try/catch + 防重入。
- `order-lookup.cmd.ts`：日期查詢改帶 `+08:00` 時區。

### 權限與輸入驗證（major/minor）
- 記帳/付款管理指令補 `.setDefaultMemberPermissions(Administrator)`（order/product/category 系列、payment、
  sales-overview）。`product-list` 因顯示成本/利潤亦收斂為管理限定。
- `order-add`/`order-custom` quantity `setMinValue(1)`；`product-add`/`order-custom` price/cost `setMinValue(0)`。
- `product-list` 分類選單裁切 25 上限；`price_list_builder` leaf embed 裁切 25 欄位。
- `product-delete`/`category-delete` 檢查+刪除包 `$transaction` 原子化。

### 錯誤處理與資源生命週期（major/minor）
- `ticket-manage.event.ts`：`handleButton`/`handleModal` 補外層 try/catch（防 Missing Access 卡死互動）；
  刪除票口改先 `channel.delete` 成功才標 ARCHIVED。
- `ticket_timeout.ts`：`checkTimeouts` 加 `isRunning` 防重入。
- `thread_logger.ts`：`getOrCreateOrderThread` 加 in-flight Promise Map 防並發建重複討論串。
- `command_handler.ts`：指令 `execute` 補頂層 try/catch + ephemeral 錯誤兜底。

## 驗證
- 後端 `tsc --noEmit`、dashboard `tsc --noEmit`：皆 0 錯（與修復前基準一致）。
- 完整 `npm run build`（db:generate + tsc + vite）：通過。
- opus code-reviewer 對整份 diff 覆核：可合入，7 個高風險點逐一查證無誤。

## 部署必要步驟（主機端）
> ⚠️ Basic Auth 為 **fail-closed**：新版部署後若未設帳密，dashboard 會全鎖（回 503）。
1. 於主機 `.env` / systemd EnvironmentFile 設定：
   - `DASHBOARD_USER`、`DASHBOARD_PASS`（dashboard 登入帳密）。
   - `SMILEPAY_MERCHANT_VERIFY_PARAM`（SmilePay 後台檢查碼；設定後才會強制驗簽章，強烈建議設定）。
2. 重新 `npm run build` 並重啟服務。
3. 驗證：`GET /healthz` 匿名 200；未帶帳密存取 `/api/*` 回 401；SmilePay `POST /api/payment/callback` 匿名可達；
   `GET /api/payment/config/:guildId` 回應不含金鑰明文。

## 發現但未於本次處理（既有、需後續決策）
- `smilepay_api.ts::buildPaymentPageUrl` 的轉址付款頁 URL 依 SmilePay 規格內嵌 `Dcvc/Rvg2c/Verify_key`。
  主顧客流程 `/rp` 走背景取號（不外洩），此 URL 僅出現在現已受 Basic Auth 保護的管理路由。若該 URL 會轉交
  顧客，需評估改為純背景模式或 SmilePay 新版簽章機制——屬 SmilePay 整合契約變更，需另行決策，未在本次改動。
- `/rp` confirm 按鈕快速連點可能建兩筆交易（既有），建議點擊後停用按鈕；未在本次改動。
