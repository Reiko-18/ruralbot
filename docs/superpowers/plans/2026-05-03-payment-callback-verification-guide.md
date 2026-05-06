# 2026-05-03 SmilePay 付款回傳驗證方式

## 版面調整

`/rp` 成功建立訂單的 embed 側邊條已改回淡紫色 `0xb8a7ff`，與付款方式確認、購買人資訊確認、取號中、取消訊息維持同一色系。

## 回傳驗證方式

### 1. 確認 callback URL 設定

Ubuntu `.env`：

```env
SMILEPAY_ROTURL=http://211.22.158.125/api/payment/callback
SMILEPAY_ENV=production
```

SmilePay 後台或申請設定也需與上述 URL 一致。URL 不含 port 時，Nginx 需將 80 port 反向代理到 dashboard/Express 的 3000 port。

### 2. 安全檢查 callback 入口

在 Ubuntu 主機執行：

```bash
curl -sS -X POST http://127.0.0.1/api/payment/callback
```

預期回應：

```text
ERROR
```

這只代表入口可達，因為沒有 SmilePay 必要欄位，所以不能代表付款成功。正式成功 callback 若有送 `Roturl_status=SmilePay_OK`，endpoint body 應直接回純文字 `SmilePay_OK`，不可包成 XML。

### 3. 使用內建測試 callback

已建立付款單後，可用該訂單編號呼叫：

```bash
curl http://127.0.0.1:3000/api/payment/test-callback/<ORDER_ID>
```

這會模擬成功 callback，確認程式能把交易改成 `COMPLETED`、寫入 callback log，並發送 Discord 通知。此方式會改資料庫狀態，僅適合測試訂單。

### 4. 正式驗證

正式流程以 SmilePay 實際付款為準：

1. `/rp` 建立付款單。
2. 到超商繳費。
3. SmilePay POST 到 `SMILEPAY_ROTURL`。
4. `payment_transactions.status` 從 `PENDING` 變 `COMPLETED`。
5. `payment_callback_logs` 新增一筆 raw callback。
6. Discord 原訊息與通知頻道收到繳費成功通知。

### 5. 資料庫查核 SQL

```sql
select order_id, status, amount, smilepay_no, payment_code, completed_at
from payment_transactions
order by created_at desc
limit 10;

select t.order_id, count(l.id) as callback_logs
from payment_transactions t
left join payment_callback_logs l on l.transaction_id = t.id
group by t.order_id
order by max(t.created_at) desc
limit 10;
```

## 驗證

- `npm run build`：通過。
