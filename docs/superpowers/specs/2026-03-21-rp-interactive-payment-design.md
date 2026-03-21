# /rp Interactive Payment Command Design

## Overview

Add a `/rp` slash command that provides an interactive payment flow in Discord. Users select a convenience store (FamilyMart or 7-11), see a confirmation with fees breakdown, then receive payment details after confirming. All steps update the same Embed message with Button components. Responses are ephemeral (only visible to the command user).

## User Flow

```
Step 1: User runs /rp amount:500
→ Embed: "請選擇繳費超商"
→ Buttons: [全家 FamilyMart] [7-11 ibon]

Step 2: User clicks store button
→ Embed updates to confirmation:
  - 訂單金額: $500
  - 手續費: $30
  - 總付款金額: $530
  - 繳費超商: 全家
→ Buttons: [確認付款] [取消]

Step 3a: User clicks 確認付款
→ Call SmilePay Background API
→ Embed updates to payment details:
  - 訂單編號, SmilePay 追蹤碼
  - 繳費超商, 繳費代碼
  - 訂單金額, 手續費, 總付款金額
  - 繳費期限, 狀態: 待繳費
→ Buttons removed

Step 3b: User clicks 取消
→ Embed updates to "已取消"
→ Buttons removed, no transaction created
```

## Timeout Handling

Embed a Unix timestamp in the custom ID. The event handler checks if the interaction is older than 15 minutes and rejects with "此付款已逾時，請重新使用 /rp" if expired.

## Fee Configuration

### Database Changes

Add to `PaymentConfig` model in `schema.prisma`:

```prisma
feeFamily       Int?  @map("fee_family")        // FamilyMart fee (null = 0)
fee711          Int?  @map("fee_711")            // 7-11 fee for amount <= threshold
fee711Over      Int?  @map("fee_711_over")       // 7-11 fee for amount > threshold
fee711Threshold Int?  @map("fee_711_threshold")  // 7-11 tier threshold (default 1000)
```

Run `npx prisma db push` after schema change.

### Fee Calculation Logic

```
FamilyMart: feeFamily ?? 0
7-11: amount > (fee711Threshold ?? 1000) ? (fee711Over ?? 0) : (fee711 ?? 0)
```

### Dashboard UI

Add a "手續費設定" section to `PaymentConfig.tsx` with 4 input fields for the fee values.

## SmilePay Pay_zg Mapping

| Store | Pay_zg | Response Fields |
|-------|--------|-----------------|
| FamilyMart (全家) | `6` (FamiPort) | `FamiNO` — 14-char payment code |
| 7-11 (ibon) | `4` (7-11 ibon) | `IbonNo` — 20-char payment code |

## Database Changes for Transaction Tracking

Add to `PaymentTransaction` model:

```prisma
originalAmount  Int?     @map("original_amount")   // 原始訂單金額
feeAmount       Int?     @map("fee_amount")         // 手續費
paymentStore    String?  @map("payment_store")      // "fami" or "711"
```

The existing `amount` field stores the **total payable** (original + fee). The new fields provide the breakdown. Existing `/payment create` transactions will have `originalAmount` and `feeAmount` as null (no fee concept), maintaining backward compatibility.

## API Changes

### smilepay_api.ts

`createBackgroundPayment` currently hardcodes `Pay_zg: "3"`. Change to accept `payZg` as a parameter so callers can specify `"4"` (ibon) or `"6"` (FamiPort).

`buildPaymentPageUrl` similarly needs `payZg` parameter.

### SmilePayXmlResponse type

Add `IbonNo`, `FamiNO`, `PayEndDate` fields to capture store-specific response data. (Barcode fields not needed for ibon/FamiPort flows.)

### parseXmlResponse

Update to extract `IbonNo`, `FamiNO`, `PayEndDate` from the XML.

### repo_payment_config.ts

Update `upsertPaymentConfig` function signature to accept the 4 new fee fields.

### Dashboard API route

Update the `PUT /api/payment/config/:guildId` handler in `src/services/dashboard/routes/payment.ts` to pass fee fields through to `upsertPaymentConfig`.

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `src/prisma/schema.prisma` | Modify | Add 4 fee fields to PaymentConfig, 3 fields to PaymentTransaction |
| `src/types/payment.type.ts` | Modify | Add IbonNo/FamiNO/PayEndDate to SmilePayXmlResponse |
| `src/services/payment/smilepay_api.ts` | Modify | Make Pay_zg a parameter, parse new XML fields |
| `src/services/payment/repo_payment_config.ts` | Modify | Add fee fields to upsert function |
| `src/services/payment/repo_payment_transaction.ts` | Modify | Add new fields to createTransaction |
| `src/services/dashboard/routes/payment.ts` | Modify | Pass fee fields in PUT config handler |
| `src/commands/payment/rp.cmd.ts` | Create | /rp command with Embed + store selection buttons |
| `src/events/payment/rp-interact.event.ts` | Create | Button interaction handler for confirm/cancel flow |
| `src/index.ts` | Modify | Register rp command and interaction event |
| `dashboard/src/components/PaymentConfig.tsx` | Modify | Add fee configuration inputs |
| `dashboard/src/types.ts` | Modify | Add fee fields to PaymentConfig interface |

## Command Definition

```
/rp
  amount: Integer (required, min 1, max 20000) — 訂單金額
  remark: String (optional, max 30 chars) — 備註
```

Amount max 20000 matches SmilePay convenience store payment limits.
Remark max 30 chars to keep custom IDs within Discord's 100-char limit.

## Interaction Custom IDs

Button custom IDs encode state and user scoping:

```
rp:{userId}:{ts}:store:fami:{amount}:{remark}
rp:{userId}:{ts}:store:711:{amount}:{remark}
rp:{userId}:{ts}:confirm:{store}:{amount}:{remark}
rp:{userId}:{ts}:cancel
```

- `userId`: restricts button clicks to the original command invoker. Event handler checks `interaction.user.id === userId` and rejects others.
- `ts`: Unix timestamp (seconds) for timeout check. Reject if `now - ts > 900` (15 min).
- `remark`: URL-encoded, capped at 30 chars to keep total custom ID under 100 chars.

Max ID length estimate: `rp:` (3) + userId (18) + `:` + ts (10) + `:confirm:fami:` (14) + amount (5) + `:` + remark (30) = ~82 chars. Safe under 100.

## Embed Details

### Step 1: Store Selection
- Title: "選擇繳費超商"
- Color: purple (0x7c3aed)
- Fields: 訂單金額
- Footer: "請在 15 分鐘內完成操作"
- Buttons: 全家 FamilyMart (PRIMARY), 7-11 ibon (PRIMARY)
- Ephemeral: yes

### Step 2: Confirmation
- Title: "確認付款資訊"
- Color: yellow (0xeab308)
- Fields: 訂單金額, 手續費, 總付款金額, 繳費超商
- Buttons: 確認付款 (SUCCESS), 取消 (DANGER)

### Step 3a: Payment Details
- Title: "繳費資訊"
- Color: green (0x22c55e)
- Fields: 訂單編號, SmilePay 追蹤碼, 繳費超商, 繳費代碼, 訂單金額, 手續費, 總付款金額, 繳費期限, 狀態
- No buttons

### Step 3b: Cancelled
- Title: "付款已取消"
- Color: red (0xef4444)
- Description: "此付款已取消"
- No buttons

## Transaction Recording

- Transaction is only created at Step 3a (after confirmation)
- `amount` stores total payable (original + fee)
- `originalAmount` stores the original order amount
- `feeAmount` stores the calculated fee
- `paymentStore` stores `"fami"` or `"711"`
- Uses existing `createTransaction`, `updateTransactionStatus`, `generatePaymentOrderId` from service layer

## Error Handling

- SmilePay API failure at Step 3a: Show error embed "取號失敗，請稍後重試" with red color, no transaction created
- Missing credentials: Show error message "金流功能尚未設定，請聯繫管理員"
- Button interaction timeout (>15 min): Reply "此付款已逾時，請重新使用 /rp"
- Wrong user clicks button: Reply ephemeral "只有發起者可以操作此付款"
- Amount exceeds SmilePay limit: Caught at command level by `setMaxValue(20000)`
