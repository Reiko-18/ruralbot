# 2026-05-05 SmilePay callback 付款通知修復

## 問題

使用者回報 SmilePay 後台已顯示付款完成，但 Discord bot 沒有在原購買單頻道回傳付款完成通知。

## 三重審查

1. 官方文件：SmilePay FAQ 指出程式串接時建議送出 `Roturl_status`，callback 正常接收後必須回覆相同內容；若未回覆或內容不同，SmilePay 會重送交易完成資料，最多 8 次。
2. 程式碼：既有 `/api/payment/callback` 只註冊 POST；callback 對已進入 `COMPLETED`、`FAILED`、`EXPIRED` 的交易會直接回 OK，不會再補發 Discord 通知。若第一次 Discord 通知因權限、訊息抓取或暫時連線問題失敗，後續 callback 或測試端點不會修復畫面。
3. 維運：現有資料表已有 `channelId`、`messageId`、`userId` 可補發通知，不需要 schema migration；修正應集中在 callback 相容性與人工補發流程。

## 修正

- `src/services/payment/smilepay_api.ts`
  - 新增 `SMILEPAY_CALLBACK_OK_STATUS = "SmilePay_OK"`。
  - 建立付款頁與背景取號都送出 `Roturl_status=SmilePay_OK`。
- `src/services/payment/payment_callback.ts`
  - callback 參數改為先正規化，支援 query/body 與常見欄位別名。
  - callback 成功回覆優先使用 SmilePay 回送的 `Roturl_status`，沒有時使用 `SmilePay_OK`。
  - 2026-05-07 追加：成功回覆改為純文字 `SmilePay_OK`，不再包成 `<Roturlstatus>SmilePay_OK</Roturlstatus>`；官方 FAQ 要求回覆內容必須與 `Roturl_status` 相同，XML 包裝會被視為不同內容而觸發「Roturl 連續拋送失敗」通知。
  - 成功更新交易後，使用更新後的交易資料送 Discord 通知。
  - 付款完成通知、原訊息更新與 DM 均使用既有 `/rp` 淡紫主題色 `0xb8a7ff`，避免成功狀態變成綠色側邊條。
  - 匯出 `sendPaymentSuccessNotifications()` 供人工補發使用。
- `src/services/dashboard/routes/payment.ts`
  - `/api/payment/callback` 同時支援 GET 與 POST。
  - 2026-05-07 追加：callback HTTP 回應改用 `text/plain; charset=utf-8` 並直接輸出處理狀態字串。
  - `/api/payment/test-callback/:orderId` 對已完成交易可直接補發 Discord 成功通知。

## 人工補救方式

若 SmilePay 已完成入帳，但 Discord 未更新，可在部署新版後打：

```text
GET /api/payment/test-callback/{完整訂單編號}
```

若該交易已是 `COMPLETED`，此端點不會改交易狀態，只會依資料庫內的 `channelId`、`messageId`、`userId` 重新編輯原訊息、在原頻道發成功通知，並嘗試 DM 使用者。

## 驗證

- 已執行 `npm run build`。
- Prisma client、TypeScript 編譯與 dashboard Vite build 皆通過。
- 2026-05-07 追加驗證方式：

```bash
curl -i -X POST http://127.0.0.1:3000/api/payment/callback \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data "Od_sob=<ORDER_ID>&Smseid=<SMILEPAY_NO>&Amount=<AMOUNT>&Classif=C&Roturl_status=SmilePay_OK"
```

成功時 body 應為純文字 `SmilePay_OK`，不可含 `<Roturlstatus>` XML 包裝。

## 風險與回滾

- 未修改資料庫 schema，無 migration 回滾問題。
- 回滾方式：還原 `smilepay_api.ts`、`payment_callback.ts`、`routes/payment.ts` 三個檔案並重新 build/deploy；但若回到 XML 包裝回覆，仍可能再觸發 SmilePay Roturl 失敗通知。
- 若仍未收到通知，下一步檢查 production log 是否有 `Payment callback received`、`Payment success notification sent to channel` 或 Discord 權限相關 warn。
