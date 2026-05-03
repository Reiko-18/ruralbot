# 2026-05-03 金流資料落庫審查

## 審查範圍

- Dashboard 建立付款 API。
- `/rp` 互動式超商繳費。
- SmilePay callback 寫入與交易狀態更新。
- 遠端 PostgreSQL 最近交易資料抽查。

## 審查結果

- Dashboard 建立付款會將 `payerName`、`payerEmail`、`payerPhone` 寫入 `payment_transactions`。
- `/rp` 建立付款會將買家資料、原始金額、手續費、超商類型、Discord channel/message/user reference 寫入 `payment_transactions`。
- SmilePay callback 會依 `Od_sob` 查找交易，並將 raw callback 寫入 `payment_callback_logs`。
- 最近 7 天的實際付款交易共 1 筆，姓名、Email、電話、手續費拆分、Discord reference 均有落庫。
- 該筆交易目前尚未付款完成，因此 callback log 為 0 屬正常狀態。
- 2026-03-21 的舊交易缺少買家資料，原因是當時尚未實作官方必填資料流程，不代表新版流程失效。

## 修正

審查新版 `/rp` 流程時發現買家資料暫存 key 誤把 action 納入，可能導致 modal 填完後下一步讀不到資料。已改為使用使用者、時間戳、超商、金額、備註組合成 key，確保 `buyer` 與 `pay` 動作讀到同一份買家資料。

## 驗證

- `npm run build`：通過。
