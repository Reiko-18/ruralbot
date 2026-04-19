# SmilePay Payment Gateway Integration Design

## Overview

Independent payment module integrating SmilePay (速買配) into RuralBot. Supports both Background API (server-to-server) and Standard Payment Page (redirect) methods. Convenience store code payment (超商代碼繳費) only. Full transaction tracking with callback logs.

## Credentials Management

Mixed approach: default from environment variables, per-Guild override via database.

- `SMILEPAY_DCVC` / `SMILEPAY_RVG2C` / `SMILEPAY_VERIFY_KEY` — env defaults
- `SMILEPAY_ENV` — `test` or `production` (determines API endpoint URLs)
- `SMILEPAY_ROTURL` — base callback URL (current production target: `http://211.22.158.125/api/payment/callback`)
- `PaymentConfig` model — per-Guild override, managed via Dashboard
- Effective credentials: DB values take priority over env vars when present

Test credentials: `Dcvc=107, Rvg2c=1`

## Database Schema

### PaymentConfig

Per-Guild payment gateway configuration.

```prisma
model PaymentConfig {
  id        String   @id @default(cuid())
  guildId   String   @unique @map("guild_id")
  dcvc      String?
  rvg2c     String?
  verifyKey String?  @map("verify_key") @db.Text
  enabled   Boolean  @default(true)
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  @@map("payment_configs")
}
```

### PaymentTransaction

Full transaction record with all SmilePay response fields.

```prisma
model PaymentTransaction {
  id              String   @id @default(cuid())
  guildId         String   @map("guild_id")
  orderId         String   @unique @map("order_id")
  amount          Int
  status          String   @default("PENDING") // PENDING, COMPLETED, FAILED, EXPIRED
  payerName       String?  @map("payer_name")
  payerEmail      String?  @map("payer_email")
  payerPhone      String?  @map("payer_phone")
  remark          String?  @db.Text
  smilePayNo      String?  @map("smilepay_no")
  paymentCode     String?  @map("payment_code")
  paymentDeadline DateTime? @map("payment_deadline")
  completedAt     DateTime? @map("completed_at")
  createdAt       DateTime @default(now()) @map("created_at")
  updatedAt       DateTime @updatedAt @map("updated_at")
  callbackLogs    PaymentCallbackLog[]

  @@index([guildId])
  @@index([status])
  @@map("payment_transactions")
}
```

### PaymentCallbackLog

Raw callback data for every Roturl POST received.

```prisma
model PaymentCallbackLog {
  id            String   @id @default(cuid())
  transactionId String   @map("transaction_id")
  transaction   PaymentTransaction @relation(fields: [transactionId], references: [id], onDelete: Cascade)
  rawData       String   @map("raw_data") @db.Text
  sourceIp      String?  @map("source_ip")
  createdAt     DateTime @default(now()) @map("created_at")

  @@map("payment_callback_logs")
}
```

## Type Definitions

File: `src/types/payment.type.ts`

```typescript
// Transaction status enum
type PaymentStatus = "PENDING" | "COMPLETED" | "FAILED" | "EXPIRED";

// SmilePay API request params
interface SmilePayRequestParams { Dcvc, Rvg2c, Od_sob, Amount, Roturl, Pay_zg, Verify_key, ... }

// SmilePay XML response
interface SmilePayResponse { Status, Desc, SmilePayNO, Amount, ... }

// Callback data shape
interface SmilePayCallbackData { Dcvc, Od_sob, Amount, SmilePayNO, ... }

// Credential config resolved from DB/env
interface EffectiveCredentials { dcvc, rvg2c, verifyKey, roturl, isTest }

// Transaction filters
interface TransactionFilters { status?, startDate?, endDate?, page?, limit? }
```

## Service Layer

Directory: `src/services/payment/`

### repo_payment_config.ts

- `getPaymentConfig(guildId)` — fetch guild config
- `upsertPaymentConfig(guildId, data)` — create/update config
- `getEffectiveCredentials(guildId)` — resolve DB > env fallback, includes roturl and isTest flag

### repo_payment_transaction.ts

- `createTransaction(data)` — create transaction record
- `updateTransactionStatus(id, status, smilePayData?)` — update status with optional SmilePay fields; validates transitions (PENDING→COMPLETED/FAILED/EXPIRED only, no reverse transitions)
- `getTransaction(id)` / `getTransactionByOrderId(orderId)` — single lookup
- `listTransactions(guildId, filters?)` — paginated list with date/status filters
- `getTransactionStats(guildId, dateRange?)` — aggregate stats

### smilepay_api.ts

- `createPaymentPage(params)` — generate Standard Payment Page URL (uses test/prod URL based on `SMILEPAY_ENV`)
- `createBackgroundPayment(params)` — POST to `SPPayment.asp`, parse XML, return payment code
- `parseXmlResponse(xml)` — XML string to typed object
- `buildVerifyCode(params)` — SmilePay verification code calculation (see Callback Security section)

Error handling: network timeouts and non-200 responses are logged via Logger. Transaction remains in PENDING status. No automatic retry — SmilePay's own retry mechanism on the callback side handles delivery assurance.

### payment_callback.ts

- `handleCallback(rawData, sourceIp)` — full callback processing:
  1. Log raw POST data to `PaymentCallbackLog`
  2. Compute verify code from callback params using `buildVerifyCode()`
  3. Compare computed code against received verification parameter
  4. If verification fails: log warning, respond with error (do NOT return OK status)
  5. If verification passes: find transaction by `Od_sob`, update status, log to Discord
  6. Return `<Roturlstatus>SmilePay_OK</Roturlstatus>`

### payment_id.ts

- `generateOrderId(guildId)` — unique order ID format: `PAY-{4 char guild hash}-{YYMMDDHHmmss}-{4 char nanoid}`
  - Example: `PAY-a1b2-260321143022-x7kQ`
  - Checks uniqueness against DB before returning (same pattern as existing `order_id.ts`)

## Callback Security

SmilePay sends a verification parameter with each callback. Validation process:

1. Extract callback fields: `Dcvc`, `Od_sob`, `Amount`, `SmilePayNO`, and the received verification value
2. Compute expected verify code using `buildVerifyCode()` with the merchant's `Verify_key`
3. Compare computed vs received — reject if mismatch
4. Log all verification failures with full callback data and source IP for audit

If verification fails, respond with a non-OK status so SmilePay will retry. The failure is logged as a warning via Discord webhook.

## Transaction Status Lifecycle

```
PENDING ──→ COMPLETED  (callback received with success status)
PENDING ──→ FAILED     (callback received with failure status, or SmilePay API returns error)
PENDING ──→ EXPIRED    (payment deadline passed without completion)
```

- **PENDING**: Created when payment is initiated. Default state.
- **COMPLETED**: SmilePay callback confirms successful payment.
- **FAILED**: SmilePay callback indicates failure, or Background API returns error `Status != 1`.
- **EXPIRED**: `paymentDeadline` has passed. Checked lazily on query (no cron job). When listing/querying transactions, any PENDING transaction past its deadline is automatically marked EXPIRED.

No reverse transitions allowed. Once COMPLETED/FAILED/EXPIRED, status is final.

## SmilePay API Integration

### Endpoints

| Purpose | Production URL | Test URL |
|---------|---------------|----------|
| Custom Payment Page (UTF-8) | `https://ssl.smse.com.tw/ezpos/mtmk_utf.asp` | N/A |
| Background API | `https://ssl.smse.com.tw/api/SPPayment.asp` | N/A |
| Standard Payment Page (UTF-8) | `https://ssl.smse.com.tw/pay/pay_a_utf.asp` | `https://ssl.smse.com.tw/pay_test/pay_a_utf.asp` |

Endpoint selection controlled by `SMILEPAY_ENV` environment variable.

### Key Parameters (Outgoing)

| Parameter | Description |
|-----------|-------------|
| `Dcvc` | Merchant ID |
| `Rvg2c` | Parameter code |
| `Od_sob` | Order ID |
| `Amount` | Amount (TWD integer) |
| `Pur_name` | Payer name |
| `Email` | Payer email |
| `Tel_number` | Phone |
| `Remark` | Remark |
| `Roturl` | Callback URL (from `SMILEPAY_ROTURL` env or guild config, current production target `http://211.22.158.125/api/payment/callback`) |
| `Pay_zg` | Payment method (3 = convenience store code) |
| `Verify_key` | Verification key |

### Background API XML Response

Success:
```xml
<SmilePay>
  <Status>1</Status>
  <Desc>Succeeded</Desc>
  <SmilePayNO>00E0001000002913643</SmilePayNO>
  <Amount>500</Amount>
</SmilePay>
```

Error (Status != 1): transaction is marked FAILED, `Desc` field logged.

### Roturl Callback

SmilePay POSTs payment results. Response format:
```html
<Roturlstatus>SmilePay_OK</Roturlstatus>
```

Retry schedule: immediate, 60s, 5m, 15m, 30m, 60m, 90m, 180m (max 8 attempts).

`paymentDeadline` is extracted from SmilePay's callback/API response when available. Convenience store codes typically expire in 3-7 days as set by SmilePay.

Current deployment note:

- Production callback URL is `http://211.22.158.125/api/payment/callback`
- Because this URL does not include a port, the Ubuntu host must expose port 80 and reverse-proxy requests to the Express dashboard service

## API Routes

Payment routes extracted to `src/services/dashboard/routes/payment.ts`, mounted on existing Express server via `app.use("/api/payment", paymentRoutes)`. This introduces a new `routes/` directory pattern for better modularity — existing routes remain in `server.ts` and can be migrated to this pattern in a follow-up.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/payment/config/:guildId` | Get payment config |
| `PUT` | `/api/payment/config/:guildId` | Update payment config |
| `POST` | `/api/payment/create/:guildId` | Create payment (returns URL + code) |
| `GET` | `/api/payment/transactions/:guildId` | List transactions (paginated, filterable) |
| `GET` | `/api/payment/transaction/:id` | Transaction detail with callback logs |
| `GET` | `/api/payment/stats/:guildId` | Transaction statistics |
| `POST` | `/api/payment/callback` | SmilePay Roturl endpoint (public) |

## Discord Commands

Directory: `src/commands/payment/`

Command files act as controllers directly (same pattern as accounting commands — no separate event handler needed since these are user-initiated slash commands, not Discord events).

| Command | Description |
|---------|-------------|
| `/payment create <amount> [payer] [remark]` | Create payment, return code + link |
| `/payment status <orderId>` | Query transaction status |
| `/payment list [status] [days]` | List recent transactions (default 7 days) |
| `/payment stats [days]` | Transaction summary stats |

## Dashboard Frontend

Directory: `dashboard/src/components/`

| Component | Purpose |
|-----------|---------|
| `PaymentDashboard.tsx` | Main container with navigation |
| `PaymentConfig.tsx` | Merchant credential settings form |
| `PaymentTransactions.tsx` | Transaction list with filters and pagination |
| `PaymentCreateModal.tsx` | Create payment modal |
| `PaymentStats.tsx` | Stats display (totals, counts, completion rate) |

## Logger Integration

All key operations logged via existing Logger → Discord webhook:

- Transaction created (amount, order ID, payer)
- Transaction status changed (completed/failed/expired)
- Callback received (SmilePay NO, status)
- Callback verification failed (source IP, raw data)
- Config changed (guild ID, changed fields)
- SmilePay API errors (endpoint, status code, response)

## Data Flow

### Create Payment (Background API)
```
User (Discord/Dashboard)
  → payment command/API
  → getEffectiveCredentials(guildId) → resolves dcvc, rvg2c, verifyKey, roturl
  → generateOrderId(guildId) → unique order ID
  → createTransaction(PENDING)
  → POST to SmilePay SPPayment.asp (with Roturl from credentials)
  → parseXmlResponse
  → if Status=1: updateTransaction(paymentCode, smilePayNo, paymentDeadline)
  → if Status!=1: updateTransactionStatus(FAILED), log error
  → return payment code to user
  → log to Discord
```

### Payment Completed (Callback)
```
SmilePay POST → /api/payment/callback
  → log raw data to PaymentCallbackLog
  → buildVerifyCode(callback params) → compare with received code
  → if mismatch: log warning, return non-OK → SmilePay will retry
  → find transaction by Od_sob
  → updateTransactionStatus(COMPLETED, smilePayData)
  → log to Discord
  → respond <Roturlstatus>SmilePay_OK</Roturlstatus>
```

### Create Payment (Standard Page)
```
User (Discord/Dashboard)
  → payment command/API
  → getEffectiveCredentials(guildId)
  → generateOrderId(guildId)
  → createTransaction(PENDING)
  → buildPaymentPageUrl(params, roturl)
  → return URL to user
  → (SmilePay handles payment flow)
  → callback arrives at Roturl (same as above)
```
