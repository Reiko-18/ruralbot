# /rp Interactive Payment Command Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an interactive `/rp` slash command with store selection buttons, fee confirmation, and SmilePay payment code generation — all within a single ephemeral embed.

**Architecture:** New `/rp` command sends initial embed with store buttons. A new event handler processes button interactions using stateless custom IDs (encoding userId, timestamp, store, amount, remark). Fee config stored in PaymentConfig DB model. SmilePay API parameterized to support ibon (Pay_zg=4) and FamiPort (Pay_zg=6).

**Tech Stack:** TypeScript, Discord.js v14 (Buttons, EmbedBuilder, ActionRowBuilder), Prisma, Express

**Spec:** `docs/superpowers/specs/2026-03-21-rp-interactive-payment-design.md`

---

## Task 1: Schema Changes (PaymentConfig fees + PaymentTransaction fields)

**Files:**
- Modify: `src/prisma/schema.prisma`

- [ ] **Step 1: Add fee fields to PaymentConfig**

In `src/prisma/schema.prisma`, find the `PaymentConfig` model. Add these 4 fields before `createdAt`:

```prisma
  feeFamily       Int?  @map("fee_family")
  fee711          Int?  @map("fee_711")
  fee711Over      Int?  @map("fee_711_over")
  fee711Threshold Int?  @map("fee_711_threshold")
```

- [ ] **Step 2: Add tracking fields to PaymentTransaction**

In the `PaymentTransaction` model, add these 3 fields before `createdAt`:

```prisma
  originalAmount  Int?     @map("original_amount")
  feeAmount       Int?     @map("fee_amount")
  paymentStore    String?  @map("payment_store")
```

- [ ] **Step 3: Run Prisma db push and generate**

```bash
npx prisma db push && npx prisma generate
```

- [ ] **Step 4: Commit**

```bash
git add src/prisma/ && git commit -m "feat(rp): add fee config and transaction tracking fields"
```

---

## Task 2: Update SmilePayXmlResponse Type + smilepay_api.ts

**Files:**
- Modify: `src/types/payment.type.ts`
- Modify: `src/services/payment/smilepay_api.ts`

- [ ] **Step 1: Add new fields to SmilePayXmlResponse**

In `src/types/payment.type.ts`, add these fields to the `SmilePayXmlResponse` interface:

```typescript
  IbonNo?: string;
  FamiNO?: string;
  PayEndDate?: string;
```

- [ ] **Step 2: Parameterize Pay_zg in smilepay_api.ts**

In `src/services/payment/smilepay_api.ts`, change `buildPaymentPageUrl` signature to accept `payZg`:

```typescript
export function buildPaymentPageUrl(
  credentials: EffectiveCredentials,
  params: { orderId: string; amount: number; payZg?: string; payerName?: string; email?: string; phone?: string; remark?: string },
): string {
```

And change the hardcoded `Pay_zg: "3"` to `Pay_zg: params.payZg ?? "3"`.

Do the same for `createBackgroundPayment`:

```typescript
export async function createBackgroundPayment(
  credentials: EffectiveCredentials,
  params: { orderId: string; amount: number; payZg?: string; payerName?: string; email?: string; phone?: string; remark?: string },
): Promise<SmilePayXmlResponse> {
```

Change `Pay_zg: "3"` to `Pay_zg: params.payZg ?? "3"`.

- [ ] **Step 3: Update parseXmlResponse to extract new fields**

In `parseXmlResponse`, add to the return object:

```typescript
    IbonNo: data.IbonNo ? String(data.IbonNo) : undefined,
    FamiNO: data.FamiNO ? String(data.FamiNO) : undefined,
    PayEndDate: data.PayEndDate ? String(data.PayEndDate) : undefined,
```

- [ ] **Step 4: Commit**

```bash
git add src/types/payment.type.ts src/services/payment/smilepay_api.ts && git commit -m "feat(rp): parameterize Pay_zg and add store-specific XML fields"
```

---

## Task 3: Update repo_payment_config.ts + repo_payment_transaction.ts

**Files:**
- Modify: `src/services/payment/repo_payment_config.ts`
- Modify: `src/services/payment/repo_payment_transaction.ts`

- [ ] **Step 1: Add fee fields to upsertPaymentConfig**

In `src/services/payment/repo_payment_config.ts`, update the `data` parameter type:

```typescript
export async function upsertPaymentConfig(
  guildId: string,
  data: {
    dcvc?: string | null;
    rvg2c?: string | null;
    verifyKey?: string | null;
    enabled?: boolean;
    feeFamily?: number | null;
    fee711?: number | null;
    fee711Over?: number | null;
    fee711Threshold?: number | null;
  },
) {
```

- [ ] **Step 2: Add a fee calculation helper**

Add this function to `repo_payment_config.ts`:

```typescript
export function calculateFee(
  config: { feeFamily?: number | null; fee711?: number | null; fee711Over?: number | null; fee711Threshold?: number | null } | null,
  store: "fami" | "711",
  amount: number,
): number {
  if (!config) return 0;
  if (store === "fami") return config.feeFamily ?? 0;
  const threshold = config.fee711Threshold ?? 1000;
  return amount > threshold ? (config.fee711Over ?? 0) : (config.fee711 ?? 0);
}
```

- [ ] **Step 3: Add new fields to createTransaction**

In `src/services/payment/repo_payment_transaction.ts`, update the `createTransaction` data type to include:

```typescript
export async function createTransaction(data: {
  guildId: string;
  orderId: string;
  amount: number;
  payerName?: string;
  payerEmail?: string;
  payerPhone?: string;
  remark?: string;
  originalAmount?: number;
  feeAmount?: number;
  paymentStore?: string;
}) {
```

- [ ] **Step 4: Commit**

```bash
git add src/services/payment/repo_payment_config.ts src/services/payment/repo_payment_transaction.ts && git commit -m "feat(rp): add fee calculation and transaction tracking fields"
```

---

## Task 4: Update Dashboard API Route + Types + PaymentConfig.tsx

**Files:**
- Modify: `src/services/dashboard/routes/payment.ts`
- Modify: `dashboard/src/types.ts`
- Modify: `dashboard/src/components/PaymentConfig.tsx`

- [ ] **Step 1: Update PUT config route**

In `src/services/dashboard/routes/payment.ts`, update the PUT handler to pass fee fields:

```typescript
paymentRoutes.put("/config/:guildId", async (req, res) => {
  try {
    const { dcvc, rvg2c, verifyKey, enabled, feeFamily, fee711, fee711Over, fee711Threshold } = req.body;
    const config = await upsertPaymentConfig(req.params.guildId, {
      dcvc, rvg2c, verifyKey, enabled,
      feeFamily: feeFamily != null ? Number(feeFamily) : null,
      fee711: fee711 != null ? Number(fee711) : null,
      fee711Over: fee711Over != null ? Number(fee711Over) : null,
      fee711Threshold: fee711Threshold != null ? Number(fee711Threshold) : null,
    });
    logger.info({ guildId: req.params.guildId }, "Payment config updated");
    res.json(config);
  } catch (err) {
    logger.error({ err }, "Failed to update payment config");
    res.status(500).json({ error: "Internal server error" });
  }
});
```

- [ ] **Step 2: Add fee fields to dashboard types**

In `dashboard/src/types.ts`, add to the `PaymentConfig` interface:

```typescript
  feeFamily: number | null;
  fee711: number | null;
  fee711Over: number | null;
  fee711Threshold: number | null;
```

- [ ] **Step 3: Add fee settings UI to PaymentConfig.tsx**

In `dashboard/src/components/PaymentConfig.tsx`:

1. Add state variables after the existing ones:
```typescript
const [feeFamily, setFeeFamily] = useState("");
const [fee711, setFee711] = useState("");
const [fee711Over, setFee711Over] = useState("");
const [fee711Threshold, setFee711Threshold] = useState("1000");
```

2. In the useEffect that loads config, add:
```typescript
if (c) {
  // ...existing fields...
  setFeeFamily(c.feeFamily != null ? String(c.feeFamily) : "");
  setFee711(c.fee711 != null ? String(c.fee711) : "");
  setFee711Over(c.fee711Over != null ? String(c.fee711Over) : "");
  setFee711Threshold(c.fee711Threshold != null ? String(c.fee711Threshold) : "1000");
}
```

3. In handleSave, add fee fields to the update call:
```typescript
const updated = await updatePaymentConfig(guildId, {
  dcvc: dcvc || null,
  rvg2c: rvg2c || null,
  verifyKey: verifyKey || null,
  enabled,
  feeFamily: feeFamily ? Number(feeFamily) : null,
  fee711: fee711 ? Number(fee711) : null,
  fee711Over: fee711Over ? Number(fee711Over) : null,
  fee711Threshold: fee711Threshold ? Number(fee711Threshold) : null,
} as any);
```

4. Add a new section after the enabled checkbox, before the save button:

```tsx
<div className="border-t border-gray-700 pt-4 mt-4">
  <h4 className="text-sm font-semibold text-gray-300 mb-3">超商手續費設定</h4>
  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
    <div>
      <label className="block text-sm text-gray-400 mb-1">全家手續費 (元)</label>
      <input type="number" min="0" className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white" value={feeFamily} onChange={(e) => setFeeFamily(e.target.value)} placeholder="0" />
    </div>
    <div>
      <label className="block text-sm text-gray-400 mb-1">7-11 手續費 (元)</label>
      <input type="number" min="0" className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white" value={fee711} onChange={(e) => setFee711(e.target.value)} placeholder="0" />
    </div>
    <div>
      <label className="block text-sm text-gray-400 mb-1">7-11 手續費 - 超過門檻 (元)</label>
      <input type="number" min="0" className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white" value={fee711Over} onChange={(e) => setFee711Over(e.target.value)} placeholder="0" />
    </div>
    <div>
      <label className="block text-sm text-gray-400 mb-1">7-11 階梯門檻 (元)</label>
      <input type="number" min="0" className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white" value={fee711Threshold} onChange={(e) => setFee711Threshold(e.target.value)} placeholder="1000" />
    </div>
  </div>
</div>
```

- [ ] **Step 4: Build dashboard**

```bash
cd dashboard && npm run build
```

- [ ] **Step 5: Commit**

```bash
git add src/services/dashboard/routes/payment.ts dashboard/src/types.ts dashboard/src/components/PaymentConfig.tsx dashboard/dist/ && git commit -m "feat(rp): add fee configuration to dashboard"
```

---

## Task 5: Create /rp Command

**Files:**
- Create: `src/commands/payment/rp.cmd.ts`

- [ ] **Step 1: Create the /rp command file**

```typescript
import {
  SlashCommandBuilder,
  MessageFlags,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type ChatInputCommandInteraction,
} from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("rp")
  .setDescription("互動式超商繳費")
  .addIntegerOption((o) =>
    o.setName("amount").setDescription("訂單金額 (新台幣)").setRequired(true).setMinValue(1).setMaxValue(20000),
  )
  .addStringOption((o) =>
    o.setName("remark").setDescription("備註 (最多 30 字)").setMaxLength(30),
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const amount = interaction.options.getInteger("amount", true);
  const remark = interaction.options.getString("remark") ?? "";
  const userId = interaction.user.id;
  const ts = Math.floor(Date.now() / 1000);
  const encodedRemark = encodeURIComponent(remark);

  const embed = new EmbedBuilder()
    .setTitle("選擇繳費超商")
    .setColor(0x7c3aed)
    .addFields({ name: "訂單金額", value: `$${amount.toLocaleString()}`, inline: true })
    .setFooter({ text: "請在 15 分鐘內完成操作" });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`rp:${userId}:${ts}:store:fami:${amount}:${encodedRemark}`)
      .setLabel("全家 FamilyMart")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`rp:${userId}:${ts}:store:711:${amount}:${encodedRemark}`)
      .setLabel("7-11 ibon")
      .setStyle(ButtonStyle.Primary),
  );

  await interaction.reply({ embeds: [embed], components: [row], flags: MessageFlags.Ephemeral });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/commands/payment/rp.cmd.ts && git commit -m "feat(rp): add /rp slash command with store selection"
```

---

## Task 6: Create rp-interact Event Handler

**Files:**
- Create: `src/events/payment/rp-interact.event.ts`

- [ ] **Step 1: Create the event handler**

```typescript
import {
  type Client,
  Events,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} from "discord.js";
import { getPaymentConfig, getEffectiveCredentials, calculateFee } from "../../services/payment/repo_payment_config.js";
import { createTransaction, updateTransactionStatus } from "../../services/payment/repo_payment_transaction.js";
import { generatePaymentOrderId } from "../../services/payment/payment_id.js";
import { createBackgroundPayment } from "../../services/payment/smilepay_api.js";
import { logger } from "../../services/logger/logger.js";

const STORE_LABELS: Record<string, string> = { fami: "全家 FamilyMart", "711": "7-11 ibon" };
const STORE_PAY_ZG: Record<string, string> = { fami: "6", "711": "4" };

export function registerRpInteractEvent(client: Client): void {
  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isButton()) return;
    if (!interaction.customId.startsWith("rp:")) return;

    const parts = interaction.customId.split(":");
    const userId = parts[1];
    const ts = parseInt(parts[2], 10);

    // User scoping
    if (interaction.user.id !== userId) {
      await interaction.reply({ content: "只有發起者可以操作此付款", flags: MessageFlags.Ephemeral });
      return;
    }

    // Timeout check (15 min = 900 seconds)
    if (Math.floor(Date.now() / 1000) - ts > 900) {
      await interaction.reply({ content: "此付款已逾時，請重新使用 /rp", flags: MessageFlags.Ephemeral });
      return;
    }

    const action = parts[3]; // "store", "confirm", or "cancel"

    try {
      if (action === "store") {
        await handleStoreSelect(interaction, parts);
      } else if (action === "confirm") {
        await handleConfirm(interaction, parts);
      } else if (action === "cancel") {
        await handleCancel(interaction);
      }
    } catch (err) {
      logger.error({ err }, "rp interaction failed");
      await interaction.update({
        embeds: [new EmbedBuilder().setTitle("發生錯誤").setDescription("操作失敗，請重新使用 /rp").setColor(0xef4444)],
        components: [],
      });
    }
  });
}

async function handleStoreSelect(interaction: any, parts: string[]) {
  const userId = parts[1];
  const ts = parts[2];
  const store = parts[4]; // "fami" or "711"
  const amount = parseInt(parts[5], 10);
  const encodedRemark = parts[6] ?? "";
  const guildId = interaction.guildId;

  const config = await getPaymentConfig(guildId);
  const fee = calculateFee(config, store as "fami" | "711", amount);
  const total = amount + fee;

  const embed = new EmbedBuilder()
    .setTitle("確認付款資訊")
    .setColor(0xeab308)
    .addFields(
      { name: "繳費超商", value: STORE_LABELS[store] ?? store, inline: true },
      { name: "訂單金額", value: `$${amount.toLocaleString()}`, inline: true },
      { name: "手續費", value: `$${fee.toLocaleString()}`, inline: true },
      { name: "總付款金額", value: `**$${total.toLocaleString()}**`, inline: false },
    );

  if (encodedRemark) {
    embed.addFields({ name: "備註", value: decodeURIComponent(encodedRemark), inline: false });
  }

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`rp:${userId}:${ts}:confirm:${store}:${amount}:${encodedRemark}`)
      .setLabel("確認付款")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`rp:${userId}:${ts}:cancel`)
      .setLabel("取消")
      .setStyle(ButtonStyle.Danger),
  );

  await interaction.update({ embeds: [embed], components: [row] });
}

async function handleConfirm(interaction: any, parts: string[]) {
  const store = parts[4]; // "fami" or "711"
  const amount = parseInt(parts[5], 10);
  const encodedRemark = parts[6] ?? "";
  const remark = encodedRemark ? decodeURIComponent(encodedRemark) : undefined;
  const guildId = interaction.guildId;

  // Show loading state
  await interaction.update({
    embeds: [new EmbedBuilder().setTitle("取號中...").setDescription("正在向 SmilePay 取得繳費代碼").setColor(0x7c3aed)],
    components: [],
  });

  const config = await getPaymentConfig(guildId);
  const credentials = getEffectiveCredentials(config);
  const fee = calculateFee(config, store as "fami" | "711", amount);
  const total = amount + fee;
  const payZg = STORE_PAY_ZG[store];
  const orderId = await generatePaymentOrderId(guildId);

  // Call SmilePay Background API
  const bgResult = await createBackgroundPayment(credentials, {
    orderId,
    amount: total,
    payZg,
    remark,
  });

  if (bgResult.Status !== "1") {
    logger.error({ orderId, status: bgResult.Status, desc: bgResult.Desc }, "SmilePay API returned error for /rp");
    await interaction.editReply({
      embeds: [new EmbedBuilder().setTitle("取號失敗").setDescription(`SmilePay 回應: ${bgResult.Desc}\n請稍後重試或聯繫管理員`).setColor(0xef4444)],
      components: [],
    });
    return;
  }

  // Extract payment code based on store
  const paymentCode = store === "711" ? bgResult.IbonNo : bgResult.FamiNO;
  const payEndDate = bgResult.PayEndDate;

  // Create transaction record
  const transaction = await createTransaction({
    guildId,
    orderId,
    amount: total,
    originalAmount: amount,
    feeAmount: fee,
    paymentStore: store,
    remark,
  });

  await updateTransactionStatus(transaction.id, "PENDING", {
    smilePayNo: bgResult.SmilePayNO,
    paymentCode: paymentCode ?? bgResult.SmilePayNO,
    paymentDeadline: payEndDate ? new Date(payEndDate) : undefined,
  });

  logger.info({ orderId, store, amount, fee, total, paymentCode }, "Payment created via /rp");

  // Build result embed
  const resultEmbed = new EmbedBuilder()
    .setTitle("繳費資訊")
    .setColor(0x22c55e)
    .addFields(
      { name: "訂單編號", value: `\`${orderId}\``, inline: true },
      { name: "SmilePay 追蹤碼", value: `\`${bgResult.SmilePayNO ?? "-"}\``, inline: true },
      { name: "繳費超商", value: STORE_LABELS[store] ?? store, inline: true },
      { name: "繳費代碼", value: `**\`${paymentCode ?? "-"}\`**`, inline: false },
      { name: "訂單金額", value: `$${amount.toLocaleString()}`, inline: true },
      { name: "手續費", value: `$${fee.toLocaleString()}`, inline: true },
      { name: "總付款金額", value: `**$${total.toLocaleString()}**`, inline: true },
      { name: "繳費期限", value: payEndDate ?? "依超商規定", inline: true },
      { name: "狀態", value: "⏳ 待繳費", inline: true },
    );

  if (remark) {
    resultEmbed.addFields({ name: "備註", value: remark, inline: false });
  }

  await interaction.editReply({ embeds: [resultEmbed], components: [] });
}

async function handleCancel(interaction: any) {
  const embed = new EmbedBuilder()
    .setTitle("付款已取消")
    .setColor(0xef4444)
    .setDescription("此付款已取消，如需重新付款請使用 /rp");

  await interaction.update({ embeds: [embed], components: [] });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/events/payment/rp-interact.event.ts && git commit -m "feat(rp): add button interaction handler for /rp flow"
```

---

## Task 7: Register Command + Event in index.ts

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Add imports and registration**

In `src/index.ts`:

1. Add import for the rp command near the existing payment command import:
```typescript
import * as rp from "./commands/payment/rp.cmd.js";
```

2. Add `registerCommand(rp);` near the existing `registerCommand(payment);` line.

3. Add import for the event handler:
```typescript
import { registerRpInteractEvent } from "./events/payment/rp-interact.event.js";
```

4. Add event registration near the existing `registerTicketButtonEvent(client);` line:
```typescript
registerRpInteractEvent(client);
```

- [ ] **Step 2: Commit**

```bash
git add src/index.ts && git commit -m "feat(rp): register /rp command and interaction event"
```

---

## Task 8: Build, Verify & Push

**Files:**
- Modify: `dashboard/dist/` (rebuild)

- [ ] **Step 1: Build dashboard**

```bash
cd dashboard && npm run build
```

- [ ] **Step 2: Final commit and push**

```bash
cd .. && git add -A && git commit -m "feat(rp): complete interactive payment command" && git push
```

---

## Task 9: Obsidian Documentation

**Files:**
- Create: `D:\reiko's coding corner\reiko's corner\ruralbot\rp-interactive-payment.md`

- [ ] **Step 1: Write documentation**

```markdown
# /rp 互動式超商繳費

## 概述
新增 `/rp` 指令，提供互動式超商繳費流程。用戶選擇超商、確認金額與手續費後，自動取得繳費代碼。

## 使用方式
```
/rp amount:500 remark:購買商品A
```

## 流程
1. 選擇繳費超商（全家 / 7-11）
2. 確認付款資訊（金額、手續費、總額）
3. 取得繳費代碼

## 手續費設定
在 Dashboard 金流設定中配置：
- 全家手續費
- 7-11 手續費（≤門檻）
- 7-11 手續費（>門檻）
- 7-11 階梯門檻（預設 1000）

## SmilePay Pay_zg
- 全家 = 6 (FamiPort)
- 7-11 = 4 (ibon)

## 安全機制
- 按鈕僅限發起者操作
- 15 分鐘操作逾時
- 確認後才建立交易紀錄
```
