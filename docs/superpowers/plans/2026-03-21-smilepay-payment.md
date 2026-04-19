# SmilePay Payment Gateway Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an independent payment module integrating SmilePay (速買配) convenience store code payments into RuralBot, with both Background API and Standard Payment Page methods, full transaction tracking, Dashboard management UI, and Discord slash commands.

**Architecture:** Three Prisma models (PaymentConfig, PaymentTransaction, PaymentCallbackLog). Backend services follow `repo_*` pattern in `src/services/payment/`. API routes extracted to `src/services/dashboard/routes/payment.ts` mounted on existing Express server. Dashboard adds a "金流" tab. Discord `/payment` command group for common operations.

**Tech Stack:** TypeScript, Discord.js v14, Prisma (PostgreSQL), Express 5, React 19, Tailwind CSS, fast-xml-parser (XML parsing)

**Spec:** `docs/superpowers/specs/2026-03-21-smilepay-payment-integration-design.md`

---

## Task 1: Database Schema & Migration

**Files:**
- Modify: `src/prisma/schema.prisma`

- [ ] **Step 1: Add PaymentConfig model**

In `src/prisma/schema.prisma`, add after the last model:

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

- [ ] **Step 2: Add PaymentTransaction model**

```prisma
model PaymentTransaction {
  id              String   @id @default(cuid())
  guildId         String   @map("guild_id")
  orderId         String   @unique @map("order_id")
  amount          Int
  status          String   @default("PENDING")
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

- [ ] **Step 3: Add PaymentCallbackLog model**

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

- [ ] **Step 4: Run Prisma migration**

```bash
npx prisma db push
```

- [ ] **Step 5: Regenerate Prisma client**

```bash
npx prisma generate
```

- [ ] **Step 6: Commit**

```bash
git add src/prisma/schema.prisma src/prisma/generated/
git commit -m "feat(payment): add payment schema models"
```

---

## Task 2: Type Definitions

**Files:**
- Create: `src/types/payment.type.ts`

- [ ] **Step 1: Create payment type definitions**

```typescript
export type PaymentStatus = "PENDING" | "COMPLETED" | "FAILED" | "EXPIRED";

export interface SmilePayRequestParams {
  Dcvc: string;
  Rvg2c: string;
  Od_sob: string;
  Amount: number;
  Pur_name?: string;
  Email?: string;
  Tel_number?: string;
  Remark?: string;
  Roturl: string;
  Pay_zg: string;
  Verify_key: string;
}

export interface SmilePayXmlResponse {
  Status: string;
  Desc: string;
  SmilePayNO?: string;
  Amount?: string;
  AtmBankNo?: string;
  AtmNo?: string;
  Data_id?: string;
  Rvg2c?: string;
  Dcvc?: string;
}

export interface SmilePayCallbackData {
  Dcvc: string;
  Od_sob: string;
  Amount: string;
  SmilePayNO: string;
  Classif: string;
  Data_id: string;
  Verify_key?: string;
  Roturl_status?: string;
}

export interface EffectiveCredentials {
  dcvc: string;
  rvg2c: string;
  verifyKey: string;
  roturl: string;
  isTest: boolean;
}

export interface TransactionFilters {
  status?: PaymentStatus;
  startDate?: Date;
  endDate?: Date;
  page?: number;
  limit?: number;
}

export interface TransactionStats {
  totalAmount: number;
  totalCount: number;
  completedCount: number;
  pendingCount: number;
  failedCount: number;
  expiredCount: number;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/types/payment.type.ts
git commit -m "feat(payment): add payment type definitions"
```

---

## Task 3: Install XML Parser Dependency

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install fast-xml-parser**

```bash
npm install fast-xml-parser
```

- [ ] **Step 2: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat(payment): add fast-xml-parser dependency"
```

---

## Task 4: Payment ID Generator

**Files:**
- Create: `src/services/payment/payment_id.ts`

- [ ] **Step 1: Create payment ID generator**

Follow the pattern from `src/services/accounting/order_id.ts`. Generate IDs in format `PAY-{4 char guild hash}-{YYMMDDHHmmss}-{4 char nanoid}`.

```typescript
import { customAlphabet } from "nanoid";
import { prisma } from "../../core/db.js";

const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const generateShort = customAlphabet(alphabet, 4);

function hashGuildId(guildId: string): string {
  let hash = 0;
  for (const ch of guildId) {
    hash = ((hash << 5) - hash + ch.charCodeAt(0)) | 0;
  }
  return Math.abs(hash).toString(36).slice(0, 4).padStart(4, "0");
}

function timestampPart(): string {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(2);
  const MM = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const HH = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");
  return `${yy}${MM}${dd}${HH}${mm}${ss}`;
}

export async function generatePaymentOrderId(guildId: string): Promise<string> {
  const guildHash = hashGuildId(guildId);
  const ts = timestampPart();

  for (let i = 0; i < 10; i++) {
    const id = `PAY-${guildHash}-${ts}-${generateShort()}`;
    const exists = await prisma.paymentTransaction.findUnique({
      where: { orderId: id },
    });
    if (!exists) return id;
  }
  throw new Error("Failed to generate unique payment order ID after 10 attempts");
}
```

- [ ] **Step 2: Commit**

```bash
git add src/services/payment/payment_id.ts
git commit -m "feat(payment): add payment order ID generator"
```

---

## Task 5: Payment Config Repository

**Files:**
- Create: `src/services/payment/repo_payment_config.ts`

- [ ] **Step 1: Create config repository**

```typescript
import { prisma } from "../../core/db.js";
import type { EffectiveCredentials } from "../../types/payment.type.js";

export async function getPaymentConfig(guildId: string) {
  return prisma.paymentConfig.findUnique({ where: { guildId } });
}

export async function upsertPaymentConfig(
  guildId: string,
  data: { dcvc?: string | null; rvg2c?: string | null; verifyKey?: string | null; enabled?: boolean },
) {
  return prisma.paymentConfig.upsert({
    where: { guildId },
    create: { guildId, ...data },
    update: data,
  });
}

export function getEffectiveCredentials(dbConfig: {
  dcvc?: string | null;
  rvg2c?: string | null;
  verifyKey?: string | null;
} | null): EffectiveCredentials {
  const dcvc = dbConfig?.dcvc || process.env.SMILEPAY_DCVC;
  const rvg2c = dbConfig?.rvg2c || process.env.SMILEPAY_RVG2C;
  const verifyKey = dbConfig?.verifyKey || process.env.SMILEPAY_VERIFY_KEY;
  const roturl = process.env.SMILEPAY_ROTURL;
  const isTest = process.env.SMILEPAY_ENV === "test";

  if (!dcvc || !rvg2c || !verifyKey || !roturl) {
    throw new Error("Missing SmilePay credentials. Set SMILEPAY_DCVC, SMILEPAY_RVG2C, SMILEPAY_VERIFY_KEY, SMILEPAY_ROTURL environment variables or configure per-guild settings.");
  }

  return { dcvc, rvg2c, verifyKey, roturl, isTest };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/services/payment/repo_payment_config.ts
git commit -m "feat(payment): add payment config repository"
```

---

## Task 6: Payment Transaction Repository

**Files:**
- Create: `src/services/payment/repo_payment_transaction.ts`

- [ ] **Step 1: Create transaction repository**

```typescript
import { prisma } from "../../core/db.js";
import type { PaymentStatus, TransactionFilters, TransactionStats } from "../../types/payment.type.js";

export async function createTransaction(data: {
  guildId: string;
  orderId: string;
  amount: number;
  payerName?: string;
  payerEmail?: string;
  payerPhone?: string;
  remark?: string;
}) {
  return prisma.paymentTransaction.create({ data });
}

const TERMINAL_STATUSES: PaymentStatus[] = ["COMPLETED", "FAILED", "EXPIRED"];

export async function updateTransactionStatus(
  id: string,
  status: PaymentStatus,
  smilePayData?: {
    smilePayNo?: string;
    paymentCode?: string;
    paymentDeadline?: Date;
    completedAt?: Date;
  },
) {
  const existing = await prisma.paymentTransaction.findUnique({ where: { id } });
  if (!existing) throw new Error(`Transaction ${id} not found`);
  if (TERMINAL_STATUSES.includes(existing.status as PaymentStatus)) {
    throw new Error(`Transaction ${id} is already in terminal status: ${existing.status}`);
  }

  return prisma.paymentTransaction.update({
    where: { id },
    data: {
      status,
      ...smilePayData,
      ...(status === "COMPLETED" && !smilePayData?.completedAt ? { completedAt: new Date() } : {}),
    },
  });
}

export async function getTransaction(id: string) {
  return prisma.paymentTransaction.findUnique({
    where: { id },
    include: { callbackLogs: { orderBy: { createdAt: "desc" } } },
  });
}

export async function getTransactionByOrderId(orderId: string) {
  return prisma.paymentTransaction.findUnique({
    where: { orderId },
    include: { callbackLogs: { orderBy: { createdAt: "desc" } } },
  });
}

export async function listTransactions(guildId: string, filters: TransactionFilters = {}) {
  const { status, startDate, endDate, page = 1, limit = 20 } = filters;

  const where: any = { guildId };
  if (status) where.status = status;
  if (startDate || endDate) {
    where.createdAt = {};
    if (startDate) where.createdAt.gte = startDate;
    if (endDate) where.createdAt.lt = endDate;
  }

  const [transactions, total] = await Promise.all([
    prisma.paymentTransaction.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.paymentTransaction.count({ where }),
  ]);

  // Lazy expiration: mark overdue PENDING transactions as EXPIRED
  const now = new Date();
  const expired = transactions.filter(
    (t) => t.status === "PENDING" && t.paymentDeadline && t.paymentDeadline < now,
  );
  if (expired.length > 0) {
    await prisma.paymentTransaction.updateMany({
      where: { id: { in: expired.map((t) => t.id) } },
      data: { status: "EXPIRED" },
    });
    for (const t of expired) t.status = "EXPIRED";
  }

  return { transactions, total, page, limit };
}

export async function getTransactionStats(
  guildId: string,
  startDate?: Date,
  endDate?: Date,
): Promise<TransactionStats> {
  const where: any = { guildId };
  if (startDate || endDate) {
    where.createdAt = {};
    if (startDate) where.createdAt.gte = startDate;
    if (endDate) where.createdAt.lt = endDate;
  }

  const [aggregate, statusCounts] = await Promise.all([
    prisma.paymentTransaction.aggregate({
      where: { ...where, status: "COMPLETED" },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.paymentTransaction.groupBy({
      by: ["status"],
      where,
      _count: true,
    }),
  ]);

  const countByStatus = Object.fromEntries(
    statusCounts.map((s) => [s.status, s._count]),
  );

  return {
    totalAmount: aggregate._sum.amount ?? 0,
    totalCount: statusCounts.reduce((sum, s) => sum + s._count, 0),
    completedCount: countByStatus["COMPLETED"] ?? 0,
    pendingCount: countByStatus["PENDING"] ?? 0,
    failedCount: countByStatus["FAILED"] ?? 0,
    expiredCount: countByStatus["EXPIRED"] ?? 0,
  };
}

export async function createCallbackLog(data: {
  transactionId: string;
  rawData: string;
  sourceIp?: string;
}) {
  return prisma.paymentCallbackLog.create({ data });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/services/payment/repo_payment_transaction.ts
git commit -m "feat(payment): add payment transaction repository"
```

---

## Task 7: SmilePay API Service

**Files:**
- Create: `src/services/payment/smilepay_api.ts`

- [ ] **Step 1: Create SmilePay API service**

Look up SmilePay API documentation at `https://ssl.smse.com.tw/pay_gr/doc/SmilePay_API_Background.pdf` via WebFetch before implementing. The key details from the spec PDF:

- Background API endpoint: `https://ssl.smse.com.tw/api/SPPayment.asp`
- Standard Page (UTF-8): `https://ssl.smse.com.tw/pay/pay_a_utf.asp`
- Test Page (UTF-8): `https://ssl.smse.com.tw/pay_test/pay_a_utf.asp`
- XML response wrapped in `<SmilePay>` root element
- `Pay_zg=3` for convenience store code payment
- Roturl response: `<Roturlstatus>SmilePay_OK</Roturlstatus>`

```typescript
import { createHash } from "node:crypto";
import { XMLParser } from "fast-xml-parser";
import { logger } from "../logger/logger.js";
import type {
  SmilePayRequestParams,
  SmilePayXmlResponse,
  EffectiveCredentials,
} from "../../types/payment.type.js";

const ENDPOINTS = {
  background: "https://ssl.smse.com.tw/api/SPPayment.asp",
  standardPage: "https://ssl.smse.com.tw/pay/pay_a_utf.asp",
  testPage: "https://ssl.smse.com.tw/pay_test/pay_a_utf.asp",
};

const xmlParser = new XMLParser();

export function buildPaymentPageUrl(
  credentials: EffectiveCredentials,
  params: { orderId: string; amount: number; payerName?: string; email?: string; phone?: string; remark?: string },
): string {
  const base = credentials.isTest ? ENDPOINTS.testPage : ENDPOINTS.standardPage;
  const query = new URLSearchParams({
    Dcvc: credentials.dcvc,
    Rvg2c: credentials.rvg2c,
    Od_sob: params.orderId,
    Amount: String(params.amount),
    Pay_zg: "3",
    Roturl: credentials.roturl,
    Verify_key: credentials.verifyKey,
    ...(params.payerName ? { Pur_name: params.payerName } : {}),
    ...(params.email ? { Email: params.email } : {}),
    ...(params.phone ? { Tel_number: params.phone } : {}),
    ...(params.remark ? { Remark: params.remark } : {}),
  });
  return `${base}?${query.toString()}`;
}

export async function createBackgroundPayment(
  credentials: EffectiveCredentials,
  params: { orderId: string; amount: number; payerName?: string; email?: string; phone?: string; remark?: string },
): Promise<SmilePayXmlResponse> {
  const body = new URLSearchParams({
    Dcvc: credentials.dcvc,
    Rvg2c: credentials.rvg2c,
    Od_sob: params.orderId,
    Amount: String(params.amount),
    Pay_zg: "3",
    Roturl: credentials.roturl,
    Verify_key: credentials.verifyKey,
    ...(params.payerName ? { Pur_name: params.payerName } : {}),
    ...(params.email ? { Email: params.email } : {}),
    ...(params.phone ? { Tel_number: params.phone } : {}),
    ...(params.remark ? { Remark: params.remark } : {}),
  });

  logger.info({ orderId: params.orderId, amount: params.amount }, "Sending background payment request to SmilePay");

  const res = await fetch(ENDPOINTS.background, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    logger.error({ status: res.status, body: text }, "SmilePay API HTTP error");
    throw new Error(`SmilePay API returned HTTP ${res.status}`);
  }

  const xml = await res.text();
  return parseXmlResponse(xml);
}

export function parseXmlResponse(xml: string): SmilePayXmlResponse {
  const parsed = xmlParser.parse(xml);
  const data = parsed.SmilePay;
  if (!data) {
    logger.error({ xml }, "SmilePay XML response missing SmilePay root element");
    throw new Error("Invalid SmilePay XML response");
  }
  return {
    Status: String(data.Status ?? ""),
    Desc: String(data.Desc ?? ""),
    SmilePayNO: data.SmilePayNO ? String(data.SmilePayNO) : undefined,
    Amount: data.Amount ? String(data.Amount) : undefined,
    AtmBankNo: data.AtmBankNo ? String(data.AtmBankNo) : undefined,
    AtmNo: data.AtmNo ? String(data.AtmNo) : undefined,
    Data_id: data.Data_id ? String(data.Data_id) : undefined,
    Rvg2c: data.Rvg2c ? String(data.Rvg2c) : undefined,
    Dcvc: data.Dcvc ? String(data.Dcvc) : undefined,
  };
}

/**
 * Build SmilePay verification code for callback validation.
 * SmilePay computes a hash from key callback fields + merchant verify key.
 * We replicate this to verify the callback is genuine.
 *
 * Note: Look up the exact SmilePay verification algorithm from their docs
 * at implementation time via WebFetch. The typical approach is:
 * MD5 or SHA256 of concatenated fields (Dcvc + Od_sob + Amount + SmilePayNO + Verify_key).
 */
export function buildVerifyCode(params: {
  Dcvc: string;
  Od_sob: string;
  Amount: string;
  SmilePayNO: string;
  verifyKey: string;
}): string {
  const raw = `${params.Dcvc}${params.Od_sob}${params.Amount}${params.SmilePayNO}${params.verifyKey}`;
  return createHash("md5").update(raw).digest("hex").toUpperCase();
}
```

- [ ] **Step 2: Commit**

```bash
git add src/services/payment/smilepay_api.ts
git commit -m "feat(payment): add SmilePay API service"
```

---

## Task 8: Payment Callback Handler

**Files:**
- Create: `src/services/payment/payment_callback.ts`

- [ ] **Step 1: Create callback handler**

```typescript
import { logger } from "../logger/logger.js";
import {
  getTransactionByOrderId,
  updateTransactionStatus,
  createCallbackLog,
} from "./repo_payment_transaction.js";
import { getPaymentConfig, getEffectiveCredentials } from "./repo_payment_config.js";
import { buildVerifyCode } from "./smilepay_api.js";
import type { SmilePayCallbackData } from "../../types/payment.type.js";

export async function handleCallback(
  rawData: Record<string, string>,
  sourceIp?: string,
): Promise<{ success: boolean; responseHtml: string }> {
  const callbackData = rawData as unknown as SmilePayCallbackData;
  const orderId = callbackData.Od_sob;

  logger.info({ orderId, smilePayNo: callbackData.SmilePayNO, sourceIp }, "Payment callback received");

  // Find the transaction
  const transaction = await getTransactionByOrderId(orderId);
  if (!transaction) {
    logger.error({ orderId }, "Payment callback for unknown order");
    return { success: false, responseHtml: "<Roturlstatus>ERROR</Roturlstatus>" };
  }

  // Log raw callback data
  await createCallbackLog({
    transactionId: transaction.id,
    rawData: JSON.stringify(rawData),
    sourceIp,
  });

  // Skip if already in terminal status
  if (["COMPLETED", "FAILED", "EXPIRED"].includes(transaction.status)) {
    logger.info({ orderId, status: transaction.status }, "Callback for already-terminal transaction, acknowledging");
    return { success: true, responseHtml: "<Roturlstatus>SmilePay_OK</Roturlstatus>" };
  }

  // Verify callback authenticity using verify code
  try {
    const config = await getPaymentConfig(transaction.guildId);
    const credentials = getEffectiveCredentials(config);

    const expectedCode = buildVerifyCode({
      Dcvc: callbackData.Dcvc,
      Od_sob: callbackData.Od_sob,
      Amount: callbackData.Amount,
      SmilePayNO: callbackData.SmilePayNO,
      verifyKey: credentials.verifyKey,
    });

    if (callbackData.Verify_key && callbackData.Verify_key !== expectedCode) {
      logger.error(
        { expected: expectedCode, received: callbackData.Verify_key, orderId, sourceIp },
        "Callback verify code mismatch — possible forgery",
      );
      return { success: false, responseHtml: "<Roturlstatus>VERIFY_FAIL</Roturlstatus>" };
    }
  } catch (err) {
    logger.error({ err, orderId }, "Failed to verify callback credentials");
    return { success: false, responseHtml: "<Roturlstatus>VERIFY_FAIL</Roturlstatus>" };
  }

  // Determine payment status from callback data
  // Classif field or other indicators may signal failure
  const isSuccess = callbackData.Classif !== "0" && callbackData.Data_id !== "";
  const newStatus = isSuccess ? "COMPLETED" : "FAILED";

  // Update transaction status
  try {
    await updateTransactionStatus(transaction.id, newStatus, {
      smilePayNo: callbackData.SmilePayNO,
      ...(isSuccess ? { completedAt: new Date() } : {}),
    });

    if (isSuccess) {
      logger.info(
        { orderId, smilePayNo: callbackData.SmilePayNO, amount: transaction.amount },
        "Payment completed successfully",
      );
    } else {
      logger.warn(
        { orderId, smilePayNo: callbackData.SmilePayNO, classif: callbackData.Classif },
        "Payment failed per SmilePay callback",
      );
    }

    return { success: true, responseHtml: "<Roturlstatus>SmilePay_OK</Roturlstatus>" };
  } catch (err) {
    logger.error({ err, orderId }, "Failed to update transaction status from callback");
    return { success: false, responseHtml: "<Roturlstatus>ERROR</Roturlstatus>" };
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/services/payment/payment_callback.ts
git commit -m "feat(payment): add payment callback handler"
```

---

## Task 9: Payment API Routes

**Files:**
- Create: `src/services/dashboard/routes/payment.ts`
- Modify: `src/services/dashboard/server.ts`

- [ ] **Step 1: Create routes directory and payment routes file**

First create the directory:
```bash
mkdir -p src/services/dashboard/routes
```

Then create the file:

```typescript
import { Router } from "express";
import { logger } from "../../logger/logger.js";
import { getPaymentConfig, upsertPaymentConfig, getEffectiveCredentials } from "../../payment/repo_payment_config.js";
import {
  createTransaction,
  listTransactions,
  getTransaction,
  getTransactionStats,
  updateTransactionStatus,
} from "../../payment/repo_payment_transaction.js";
import { generatePaymentOrderId } from "../../payment/payment_id.js";
import { buildPaymentPageUrl, createBackgroundPayment } from "../../payment/smilepay_api.js";
import { handleCallback } from "../../payment/payment_callback.js";

export const paymentRoutes = Router();

// GET /api/payment/config/:guildId
paymentRoutes.get("/config/:guildId", async (req, res) => {
  try {
    const config = await getPaymentConfig(req.params.guildId);
    const hasEnvCredentials = !!(process.env.SMILEPAY_DCVC && process.env.SMILEPAY_RVG2C && process.env.SMILEPAY_VERIFY_KEY);
    res.json({ config, hasEnvCredentials });
  } catch (err) {
    logger.error({ err }, "Failed to fetch payment config");
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /api/payment/config/:guildId
paymentRoutes.put("/config/:guildId", async (req, res) => {
  try {
    const { dcvc, rvg2c, verifyKey, enabled } = req.body;
    const config = await upsertPaymentConfig(req.params.guildId, { dcvc, rvg2c, verifyKey, enabled });
    logger.info({ guildId: req.params.guildId }, "Payment config updated");
    res.json(config);
  } catch (err) {
    logger.error({ err }, "Failed to update payment config");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/payment/create/:guildId
paymentRoutes.post("/create/:guildId", async (req, res) => {
  try {
    const { amount, payerName, payerEmail, payerPhone, remark } = req.body;
    if (!amount || typeof amount !== "number" || amount <= 0) {
      return res.status(400).json({ error: "Invalid amount" });
    }

    const guildId = req.params.guildId;
    const config = await getPaymentConfig(guildId);
    const credentials = getEffectiveCredentials(config);
    const orderId = await generatePaymentOrderId(guildId);

    // Create transaction record
    const transaction = await createTransaction({
      guildId,
      orderId,
      amount,
      payerName,
      payerEmail,
      payerPhone,
      remark,
    });

    // Build payment page URL
    const paymentUrl = buildPaymentPageUrl(credentials, {
      orderId,
      amount,
      payerName,
      email: payerEmail,
      phone: payerPhone,
      remark,
    });

    // Try background API for payment code
    let paymentCode: string | undefined;
    let smilePayNo: string | undefined;
    try {
      const bgResult = await createBackgroundPayment(credentials, {
        orderId,
        amount,
        payerName,
        email: payerEmail,
        phone: payerPhone,
        remark,
      });

      if (bgResult.Status === "1") {
        paymentCode = bgResult.SmilePayNO;
        smilePayNo = bgResult.SmilePayNO;
        await updateTransactionStatus(transaction.id, "PENDING", {
          smilePayNo,
          paymentCode,
        });
      } else {
        logger.warn({ orderId, status: bgResult.Status, desc: bgResult.Desc }, "SmilePay background API returned non-success");
      }
    } catch (err) {
      logger.warn({ err, orderId }, "Background payment API failed, falling back to payment page URL only");
    }

    logger.info({ orderId, amount, guildId, payerName }, "Payment created");

    res.status(201).json({
      transaction: { ...transaction, paymentCode, smilePayNo },
      paymentUrl,
    });
  } catch (err) {
    logger.error({ err }, "Failed to create payment");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/payment/transactions/:guildId
paymentRoutes.get("/transactions/:guildId", async (req, res) => {
  try {
    const { status, start, end, page, limit } = req.query;
    const result = await listTransactions(req.params.guildId, {
      status: status as any,
      startDate: start ? new Date(start as string) : undefined,
      endDate: end ? new Date(end as string) : undefined,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
    res.json(result);
  } catch (err) {
    logger.error({ err }, "Failed to list transactions");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/payment/transaction/:id
paymentRoutes.get("/transaction/:id", async (req, res) => {
  try {
    const transaction = await getTransaction(req.params.id);
    if (!transaction) return res.status(404).json({ error: "Transaction not found" });
    res.json(transaction);
  } catch (err) {
    logger.error({ err }, "Failed to fetch transaction");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/payment/stats/:guildId
paymentRoutes.get("/stats/:guildId", async (req, res) => {
  try {
    const { start, end } = req.query;
    const stats = await getTransactionStats(
      req.params.guildId,
      start ? new Date(start as string) : undefined,
      end ? new Date(end as string) : undefined,
    );
    res.json(stats);
  } catch (err) {
    logger.error({ err }, "Failed to fetch transaction stats");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/payment/callback — public endpoint for SmilePay Roturl
paymentRoutes.post("/callback", async (req, res) => {
  try {
    const sourceIp = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.ip;
    const result = await handleCallback(req.body, sourceIp);
    res.set("Content-Type", "text/html; charset=utf-8");
    res.send(result.responseHtml);
  } catch (err) {
    logger.error({ err }, "Payment callback processing error");
    res.set("Content-Type", "text/html; charset=utf-8");
    res.send("<Roturlstatus>ERROR</Roturlstatus>");
  }
});
```

- [ ] **Step 2: Mount payment routes in server.ts**

In `src/services/dashboard/server.ts`, add the import near the top with other imports:

```typescript
import { paymentRoutes } from "./routes/payment.js";
```

Add the route mount before the static file serving section (before `app.use(express.static(...))`):

```typescript
app.use("/api/payment", paymentRoutes);
```

Also add URL-encoded body parsing if not already present (needed for SmilePay callback which POSTs form data):

```typescript
app.use(express.urlencoded({ extended: true }));
```

- [ ] **Step 3: Commit**

```bash
git add src/services/dashboard/routes/payment.ts src/services/dashboard/server.ts
git commit -m "feat(payment): add payment API routes"
```

---

## Task 10: Discord Slash Command

**Files:**
- Create: `src/commands/payment/payment.cmd.ts`

- [ ] **Step 1: Create payment command with subcommands**

```typescript
import {
  SlashCommandBuilder,
  MessageFlags,
  EmbedBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { getPaymentConfig, getEffectiveCredentials } from "../../services/payment/repo_payment_config.js";
import {
  createTransaction,
  getTransactionByOrderId,
  listTransactions,
  getTransactionStats,
  updateTransactionStatus,
} from "../../services/payment/repo_payment_transaction.js";
import { generatePaymentOrderId } from "../../services/payment/payment_id.js";
import { buildPaymentPageUrl, createBackgroundPayment } from "../../services/payment/smilepay_api.js";
import { logger } from "../../services/logger/logger.js";

export const data = new SlashCommandBuilder()
  .setName("payment")
  .setDescription("金流管理")
  .addSubcommand((sub) =>
    sub
      .setName("create")
      .setDescription("建立付款")
      .addIntegerOption((o) => o.setName("amount").setDescription("金額 (新台幣)").setRequired(true).setMinValue(1))
      .addStringOption((o) => o.setName("payer").setDescription("付款人名稱"))
      .addStringOption((o) => o.setName("remark").setDescription("備註")),
  )
  .addSubcommand((sub) =>
    sub
      .setName("status")
      .setDescription("查詢交易狀態")
      .addStringOption((o) => o.setName("order_id").setDescription("訂單編號").setRequired(true)),
  )
  .addSubcommand((sub) =>
    sub
      .setName("list")
      .setDescription("列出近期交易")
      .addStringOption((o) =>
        o.setName("status").setDescription("篩選狀態").addChoices(
          { name: "待付款", value: "PENDING" },
          { name: "已完成", value: "COMPLETED" },
          { name: "失敗", value: "FAILED" },
          { name: "已過期", value: "EXPIRED" },
        ),
      )
      .addIntegerOption((o) => o.setName("days").setDescription("天數 (預設 7)").setMinValue(1).setMaxValue(90)),
  )
  .addSubcommand((sub) =>
    sub
      .setName("stats")
      .setDescription("交易統計")
      .addIntegerOption((o) => o.setName("days").setDescription("天數 (預設 30)").setMinValue(1).setMaxValue(365)),
  );

const STATUS_LABELS: Record<string, string> = {
  PENDING: "⏳ 待付款",
  COMPLETED: "✅ 已完成",
  FAILED: "❌ 失敗",
  EXPIRED: "⌛ 已過期",
};

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const sub = interaction.options.getSubcommand();
  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.editReply("此指令只能在伺服器中使用。");
    return;
  }

  try {
    switch (sub) {
      case "create":
        await handleCreate(interaction, guildId);
        break;
      case "status":
        await handleStatus(interaction);
        break;
      case "list":
        await handleList(interaction, guildId);
        break;
      case "stats":
        await handleStats(interaction, guildId);
        break;
    }
  } catch (err) {
    logger.error({ err, sub }, "Payment command failed");
    await interaction.editReply("操作失敗，請稍後再試。");
  }
}

async function handleCreate(interaction: ChatInputCommandInteraction, guildId: string) {
  const amount = interaction.options.getInteger("amount", true);
  const payerName = interaction.options.getString("payer") ?? undefined;
  const remark = interaction.options.getString("remark") ?? undefined;

  const config = await getPaymentConfig(guildId);
  const credentials = getEffectiveCredentials(config);
  const orderId = await generatePaymentOrderId(guildId);

  const transaction = await createTransaction({ guildId, orderId, amount, payerName, remark });

  const paymentUrl = buildPaymentPageUrl(credentials, { orderId, amount, payerName, remark });

  // Try background API
  let paymentCode: string | undefined;
  try {
    const bgResult = await createBackgroundPayment(credentials, { orderId, amount, payerName, remark });
    if (bgResult.Status === "1") {
      paymentCode = bgResult.SmilePayNO;
      await updateTransactionStatus(transaction.id, "PENDING", {
        smilePayNo: bgResult.SmilePayNO,
        paymentCode: bgResult.SmilePayNO,
      });
    }
  } catch {
    // Background API failed, payment page URL still works
  }

  const embed = new EmbedBuilder()
    .setTitle("付款已建立")
    .setColor(0x7c3aed)
    .addFields(
      { name: "訂單編號", value: orderId, inline: true },
      { name: "金額", value: `$${amount.toLocaleString()}`, inline: true },
      ...(payerName ? [{ name: "付款人", value: payerName, inline: true }] : []),
      ...(paymentCode ? [{ name: "超商繳費代碼", value: `\`${paymentCode}\``, inline: false }] : []),
      { name: "付款連結", value: paymentUrl, inline: false },
    );

  logger.info({ orderId, amount, guildId, payerName }, "Payment created via Discord command");
  await interaction.editReply({ embeds: [embed] });
}

async function handleStatus(interaction: ChatInputCommandInteraction) {
  const orderId = interaction.options.getString("order_id", true);
  const transaction = await getTransactionByOrderId(orderId);

  if (!transaction) {
    await interaction.editReply(`找不到訂單 **${orderId}**`);
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle(`訂單 ${transaction.orderId}`)
    .setColor(transaction.status === "COMPLETED" ? 0x22c55e : transaction.status === "PENDING" ? 0xeab308 : 0xef4444)
    .addFields(
      { name: "狀態", value: STATUS_LABELS[transaction.status] ?? transaction.status, inline: true },
      { name: "金額", value: `$${transaction.amount.toLocaleString()}`, inline: true },
      ...(transaction.payerName ? [{ name: "付款人", value: transaction.payerName, inline: true }] : []),
      ...(transaction.smilePayNo ? [{ name: "SmilePay 編號", value: transaction.smilePayNo, inline: true }] : []),
      ...(transaction.paymentCode ? [{ name: "繳費代碼", value: `\`${transaction.paymentCode}\``, inline: true }] : []),
      { name: "建立時間", value: transaction.createdAt.toLocaleString("zh-TW"), inline: true },
      ...(transaction.completedAt ? [{ name: "完成時間", value: transaction.completedAt.toLocaleString("zh-TW"), inline: true }] : []),
    );

  await interaction.editReply({ embeds: [embed] });
}

async function handleList(interaction: ChatInputCommandInteraction, guildId: string) {
  const status = interaction.options.getString("status") as any;
  const days = interaction.options.getInteger("days") ?? 7;

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const { transactions, total } = await listTransactions(guildId, { status, startDate, limit: 10 });

  if (transactions.length === 0) {
    await interaction.editReply("沒有找到符合條件的交易。");
    return;
  }

  const lines = transactions.map(
    (t) => `${STATUS_LABELS[t.status] ?? t.status} \`${t.orderId}\` — $${t.amount.toLocaleString()} ${t.payerName ?? ""}`,
  );

  const embed = new EmbedBuilder()
    .setTitle(`近 ${days} 天交易 (共 ${total} 筆)`)
    .setColor(0x7c3aed)
    .setDescription(lines.join("\n"));

  await interaction.editReply({ embeds: [embed] });
}

async function handleStats(interaction: ChatInputCommandInteraction, guildId: string) {
  const days = interaction.options.getInteger("days") ?? 30;

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const stats = await getTransactionStats(guildId, startDate);

  const completionRate = stats.totalCount > 0
    ? ((stats.completedCount / stats.totalCount) * 100).toFixed(1)
    : "0";

  const embed = new EmbedBuilder()
    .setTitle(`近 ${days} 天交易統計`)
    .setColor(0x7c3aed)
    .addFields(
      { name: "總收款金額", value: `$${stats.totalAmount.toLocaleString()}`, inline: true },
      { name: "總交易筆數", value: String(stats.totalCount), inline: true },
      { name: "完成率", value: `${completionRate}%`, inline: true },
      { name: "已完成", value: String(stats.completedCount), inline: true },
      { name: "待付款", value: String(stats.pendingCount), inline: true },
      { name: "失敗/過期", value: String(stats.failedCount + stats.expiredCount), inline: true },
    );

  await interaction.editReply({ embeds: [embed] });
}
```

- [ ] **Step 2: Register the command**

In `src/index.ts`, add the payment command import and `registerCommand(payment)` call following the existing pattern for other commands (e.g. how accounting commands are registered).

- [ ] **Step 3: Commit**

```bash
git add src/commands/payment/payment.cmd.ts src/core/command_handler.ts
git commit -m "feat(payment): add /payment Discord slash command"
```

---

## Task 11: Dashboard Types & API Client

**Files:**
- Modify: `dashboard/src/types.ts`
- Modify: `dashboard/src/api/client.ts`

- [ ] **Step 1: Add payment types to dashboard**

In `dashboard/src/types.ts`, add at the end:

```typescript
// === Payment ===

export interface PaymentConfig {
  id: string;
  guildId: string;
  dcvc: string | null;
  rvg2c: string | null;
  verifyKey: string | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentTransaction {
  id: string;
  guildId: string;
  orderId: string;
  amount: number;
  status: "PENDING" | "COMPLETED" | "FAILED" | "EXPIRED";
  payerName: string | null;
  payerEmail: string | null;
  payerPhone: string | null;
  remark: string | null;
  smilePayNo: string | null;
  paymentCode: string | null;
  paymentDeadline: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentCallbackLog {
  id: string;
  transactionId: string;
  rawData: string;
  sourceIp: string | null;
  createdAt: string;
}

export interface PaymentTransactionDetail extends PaymentTransaction {
  callbackLogs: PaymentCallbackLog[];
}

export interface PaymentTransactionList {
  transactions: PaymentTransaction[];
  total: number;
  page: number;
  limit: number;
}

export interface PaymentStats {
  totalAmount: number;
  totalCount: number;
  completedCount: number;
  pendingCount: number;
  failedCount: number;
  expiredCount: number;
}
```

- [ ] **Step 2: Add payment API client functions**

In `dashboard/src/api/client.ts`, add at the end:

```typescript
// === Payment ===

export const fetchPaymentConfig = (guildId: string) =>
  request<{ config: PaymentConfig | null; hasEnvCredentials: boolean }>(`/payment/config/${guildId}`);

export const updatePaymentConfig = (guildId: string, data: Partial<PaymentConfig>) =>
  request<PaymentConfig>(`/payment/config/${guildId}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });

export const createPayment = (guildId: string, data: { amount: number; payerName?: string; payerEmail?: string; payerPhone?: string; remark?: string }) =>
  request<{ transaction: PaymentTransaction; paymentUrl: string }>(`/payment/create/${guildId}`, {
    method: "POST",
    body: JSON.stringify(data),
  });

export const fetchPaymentTransactions = (guildId: string, params?: { status?: string; start?: string; end?: string; page?: number; limit?: number }) => {
  const qs = new URLSearchParams();
  if (params?.status) qs.set("status", params.status);
  if (params?.start) qs.set("start", params.start);
  if (params?.end) qs.set("end", params.end);
  if (params?.page) qs.set("page", String(params.page));
  if (params?.limit) qs.set("limit", String(params.limit));
  const q = qs.toString();
  return request<PaymentTransactionList>(`/payment/transactions/${guildId}${q ? `?${q}` : ""}`);
};

export const fetchPaymentTransaction = (id: string) =>
  request<PaymentTransactionDetail>(`/payment/transaction/${id}`);

export const fetchPaymentStats = (guildId: string, start?: string, end?: string) => {
  const qs = new URLSearchParams();
  if (start) qs.set("start", start);
  if (end) qs.set("end", end);
  const q = qs.toString();
  return request<PaymentStats>(`/payment/stats/${guildId}${q ? `?${q}` : ""}`);
};
```

Add the necessary type imports at the top of `client.ts`:

```typescript
import type { PaymentConfig, PaymentTransaction, PaymentTransactionDetail, PaymentTransactionList, PaymentStats } from "../types";
```

- [ ] **Step 3: Commit**

```bash
git add dashboard/src/types.ts dashboard/src/api/client.ts
git commit -m "feat(payment): add dashboard types and API client"
```

---

## Task 12: Dashboard — PaymentConfig Component

**Files:**
- Create: `dashboard/src/components/PaymentConfig.tsx`

- [ ] **Step 1: Create payment config settings component**

```typescript
import { useState, useEffect } from "react";
import type { PaymentConfig as PaymentConfigType } from "../types";
import { fetchPaymentConfig, updatePaymentConfig } from "../api/client";

interface Props {
  guildId: string;
}

export function PaymentConfig({ guildId }: Props) {
  const [config, setConfig] = useState<PaymentConfigType | null>(null);
  const [hasEnvCredentials, setHasEnvCredentials] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dcvc, setDcvc] = useState("");
  const [rvg2c, setRvg2c] = useState("");
  const [verifyKey, setVerifyKey] = useState("");
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    fetchPaymentConfig(guildId)
      .then(({ config: c, hasEnvCredentials: hasEnv }) => {
        setConfig(c);
        setHasEnvCredentials(hasEnv);
        if (c) {
          setDcvc(c.dcvc ?? "");
          setRvg2c(c.rvg2c ?? "");
          setVerifyKey(c.verifyKey ?? "");
          setEnabled(c.enabled);
        }
      })
      .catch((err) => console.error("Failed to load payment config:", err))
      .finally(() => setLoading(false));
  }, [guildId]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await updatePaymentConfig(guildId, {
        dcvc: dcvc || null,
        rvg2c: rvg2c || null,
        verifyKey: verifyKey || null,
        enabled,
      } as any);
      setConfig(updated);
    } catch (err) {
      console.error("Failed to save payment config:", err);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="text-gray-400">載入中...</div>;

  return (
    <div className="glow-card p-6 space-y-4">
      <h3 className="text-lg font-semibold">SmilePay 商家設定</h3>

      {hasEnvCredentials && (
        <div className="text-sm text-gray-400 bg-gray-800 p-3 rounded">
          已偵測到環境變數預設憑證。下方欄位留空將使用預設值。
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm text-gray-400 mb-1">商家代號 (Dcvc)</label>
          <input
            type="text"
            className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white"
            value={dcvc}
            onChange={(e) => setDcvc(e.target.value)}
            placeholder={hasEnvCredentials ? "使用環境變數預設值" : ""}
          />
        </div>
        <div>
          <label className="block text-sm text-gray-400 mb-1">參數碼 (Rvg2c)</label>
          <input
            type="text"
            className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white"
            value={rvg2c}
            onChange={(e) => setRvg2c(e.target.value)}
            placeholder={hasEnvCredentials ? "使用環境變數預設值" : ""}
          />
        </div>
      </div>

      <div>
        <label className="block text-sm text-gray-400 mb-1">檢查碼 (Verify Key)</label>
        <input
          type="password"
          className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white"
          value={verifyKey}
          onChange={(e) => setVerifyKey(e.target.value)}
          placeholder={hasEnvCredentials ? "使用環境變數預設值" : ""}
        />
      </div>

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="payment-enabled"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="rounded"
        />
        <label htmlFor="payment-enabled" className="text-sm text-gray-300">啟用金流功能</label>
      </div>

      <button
        className="btn-accent px-4 py-2 rounded text-sm"
        onClick={handleSave}
        disabled={saving}
      >
        {saving ? "儲存中..." : "儲存設定"}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add dashboard/src/components/PaymentConfig.tsx
git commit -m "feat(payment): add PaymentConfig dashboard component"
```

---

## Task 13: Dashboard — PaymentStats Component

**Files:**
- Create: `dashboard/src/components/PaymentStats.tsx`

- [ ] **Step 1: Create payment stats component**

```typescript
import { useState, useEffect } from "react";
import type { PaymentStats as PaymentStatsType } from "../types";
import { fetchPaymentStats } from "../api/client";

interface Props {
  guildId: string;
}

export function PaymentStats({ guildId }: Props) {
  const [stats, setStats] = useState<PaymentStatsType | null>(null);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const start = new Date();
    start.setDate(start.getDate() - days);
    fetchPaymentStats(guildId, start.toISOString())
      .then(setStats)
      .catch((err) => console.error("Failed to load payment stats:", err))
      .finally(() => setLoading(false));
  }, [guildId, days]);

  if (loading) return <div className="text-gray-400">載入中...</div>;
  if (!stats) return <div className="text-gray-500">無法載入統計</div>;

  const completionRate = stats.totalCount > 0
    ? ((stats.completedCount / stats.totalCount) * 100).toFixed(1)
    : "0";

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-400">統計區間：</span>
        {[7, 30, 90].map((d) => (
          <button
            key={d}
            className={`px-3 py-1 rounded text-sm ${days === d ? "btn-accent" : "text-gray-400 hover:text-white"}`}
            onClick={() => setDays(d)}
          >
            {d} 天
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="glow-card p-4">
          <div className="text-gray-400 text-xs mb-1">總收款金額</div>
          <div className="text-xl font-bold">${stats.totalAmount.toLocaleString()}</div>
        </div>
        <div className="glow-card p-4">
          <div className="text-gray-400 text-xs mb-1">總交易筆數</div>
          <div className="text-xl font-bold">{stats.totalCount}</div>
        </div>
        <div className="glow-card p-4">
          <div className="text-gray-400 text-xs mb-1">完成率</div>
          <div className="text-xl font-bold">{completionRate}%</div>
        </div>
        <div className="glow-card p-4">
          <div className="text-gray-400 text-xs mb-1">已完成</div>
          <div className="text-xl font-bold text-green-400">{stats.completedCount}</div>
        </div>
        <div className="glow-card p-4">
          <div className="text-gray-400 text-xs mb-1">待付款</div>
          <div className="text-xl font-bold text-yellow-400">{stats.pendingCount}</div>
        </div>
        <div className="glow-card p-4">
          <div className="text-gray-400 text-xs mb-1">失敗/過期</div>
          <div className="text-xl font-bold text-red-400">{stats.failedCount + stats.expiredCount}</div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add dashboard/src/components/PaymentStats.tsx
git commit -m "feat(payment): add PaymentStats dashboard component"
```

---

## Task 14: Dashboard — PaymentCreateModal Component

**Files:**
- Create: `dashboard/src/components/PaymentCreateModal.tsx`

- [ ] **Step 1: Create payment creation modal**

```typescript
import { useState } from "react";
import { createPayment } from "../api/client";

interface Props {
  guildId: string;
  onClose: () => void;
  onCreated: () => void;
}

export function PaymentCreateModal({ guildId, onClose, onCreated }: Props) {
  const [amount, setAmount] = useState("");
  const [payerName, setPayerName] = useState("");
  const [payerEmail, setPayerEmail] = useState("");
  const [payerPhone, setPayerPhone] = useState("");
  const [remark, setRemark] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ orderId: string; paymentCode?: string; paymentUrl: string } | null>(null);

  const handleSubmit = async () => {
    const amt = parseInt(amount, 10);
    if (!amt || amt <= 0) return;

    setSubmitting(true);
    try {
      const res = await createPayment(guildId, {
        amount: amt,
        payerName: payerName || undefined,
        payerEmail: payerEmail || undefined,
        payerPhone: payerPhone || undefined,
        remark: remark || undefined,
      });
      setResult({
        orderId: res.transaction.orderId,
        paymentCode: res.transaction.paymentCode ?? undefined,
        paymentUrl: res.paymentUrl,
      });
      onCreated();
    } catch (err) {
      console.error("Failed to create payment:", err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-700 rounded-lg p-6 w-full max-w-md space-y-4" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold">建立付款</h3>

        {result ? (
          <div className="space-y-3">
            <div className="bg-green-900/30 border border-green-700 rounded p-3 text-sm">付款已建立</div>
            <div><span className="text-gray-400 text-sm">訂單編號：</span><span className="font-mono">{result.orderId}</span></div>
            {result.paymentCode && (
              <div><span className="text-gray-400 text-sm">超商繳費代碼：</span><span className="font-mono text-lg font-bold">{result.paymentCode}</span></div>
            )}
            <div>
              <span className="text-gray-400 text-sm">付款連結：</span>
              <a href={result.paymentUrl} target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:underline text-sm break-all">{result.paymentUrl}</a>
            </div>
            <button className="btn-accent px-4 py-2 rounded text-sm w-full" onClick={onClose}>關閉</button>
          </div>
        ) : (
          <>
            <div>
              <label className="block text-sm text-gray-400 mb-1">金額 (新台幣) *</label>
              <input type="number" min="1" className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">付款人名稱</label>
              <input type="text" className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white" value={payerName} onChange={(e) => setPayerName(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Email</label>
                <input type="email" className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white" value={payerEmail} onChange={(e) => setPayerEmail(e.target.value)} />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">電話</label>
                <input type="tel" className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white" value={payerPhone} onChange={(e) => setPayerPhone(e.target.value)} />
              </div>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">備註</label>
              <textarea className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white" rows={2} value={remark} onChange={(e) => setRemark(e.target.value)} />
            </div>
            <div className="flex gap-2">
              <button className="btn-accent px-4 py-2 rounded text-sm flex-1" onClick={handleSubmit} disabled={submitting || !amount}>
                {submitting ? "建立中..." : "建立付款"}
              </button>
              <button className="px-4 py-2 rounded text-sm text-gray-400 hover:text-white border border-gray-700" onClick={onClose}>取消</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add dashboard/src/components/PaymentCreateModal.tsx
git commit -m "feat(payment): add PaymentCreateModal dashboard component"
```

---

## Task 15: Dashboard — PaymentTransactions Component

**Files:**
- Create: `dashboard/src/components/PaymentTransactions.tsx`

- [ ] **Step 1: Create payment transactions list component**

```typescript
import { useState, useEffect, useCallback } from "react";
import type { PaymentTransaction } from "../types";
import { fetchPaymentTransactions } from "../api/client";

interface Props {
  guildId: string;
  refreshKey: number;
}

const STATUS_STYLES: Record<string, { label: string; color: string }> = {
  PENDING: { label: "待付款", color: "text-yellow-400" },
  COMPLETED: { label: "已完成", color: "text-green-400" },
  FAILED: { label: "失敗", color: "text-red-400" },
  EXPIRED: { label: "已過期", color: "text-gray-500" },
};

export function PaymentTransactions({ guildId, refreshKey }: Props) {
  const [transactions, setTransactions] = useState<PaymentTransaction[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchPaymentTransactions(guildId, {
        status: statusFilter || undefined,
        page,
        limit: 15,
      });
      setTransactions(result.transactions);
      setTotal(result.total);
    } catch (err) {
      console.error("Failed to load transactions:", err);
    } finally {
      setLoading(false);
    }
  }, [guildId, page, statusFilter, refreshKey]);

  useEffect(() => { load(); }, [load]);

  const totalPages = Math.ceil(total / 15);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-400">篩選：</span>
        {["", "PENDING", "COMPLETED", "FAILED", "EXPIRED"].map((s) => (
          <button
            key={s}
            className={`px-3 py-1 rounded text-sm ${statusFilter === s ? "btn-accent" : "text-gray-400 hover:text-white"}`}
            onClick={() => { setStatusFilter(s); setPage(1); }}
          >
            {s ? (STATUS_STYLES[s]?.label ?? s) : "全部"}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-gray-400">載入中...</div>
      ) : transactions.length === 0 ? (
        <div className="text-gray-500">尚無交易紀錄</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-400 border-b border-gray-700">
                <th className="text-left py-2 px-3">訂單編號</th>
                <th className="text-left py-2 px-3">金額</th>
                <th className="text-left py-2 px-3">狀態</th>
                <th className="text-left py-2 px-3">付款人</th>
                <th className="text-left py-2 px-3">繳費代碼</th>
                <th className="text-left py-2 px-3">建立時間</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((t) => {
                const style = STATUS_STYLES[t.status] ?? { label: t.status, color: "text-gray-400" };
                return (
                  <tr key={t.id} className="border-b border-gray-800 hover:bg-gray-800/50">
                    <td className="py-2 px-3 font-mono text-xs">{t.orderId}</td>
                    <td className="py-2 px-3">${t.amount.toLocaleString()}</td>
                    <td className={`py-2 px-3 ${style.color}`}>{style.label}</td>
                    <td className="py-2 px-3">{t.payerName ?? "-"}</td>
                    <td className="py-2 px-3 font-mono text-xs">{t.paymentCode ?? "-"}</td>
                    <td className="py-2 px-3 text-gray-400">{new Date(t.createdAt).toLocaleString("zh-TW")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button className="px-3 py-1 rounded text-sm text-gray-400 hover:text-white disabled:opacity-30" disabled={page <= 1} onClick={() => setPage(page - 1)}>上一頁</button>
          <span className="text-sm text-gray-400">{page} / {totalPages}</span>
          <button className="px-3 py-1 rounded text-sm text-gray-400 hover:text-white disabled:opacity-30" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>下一頁</button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add dashboard/src/components/PaymentTransactions.tsx
git commit -m "feat(payment): add PaymentTransactions dashboard component"
```

---

## Task 16: Dashboard — PaymentDashboard Main Container

**Files:**
- Create: `dashboard/src/components/PaymentDashboard.tsx`
- Modify: `dashboard/src/App.tsx`

- [ ] **Step 1: Create PaymentDashboard container**

Follow the same pattern as `TicketDashboard.tsx` — manages its own guild selection with `fetchGuilds()` and `localStorage`.

```typescript
import { useState, useEffect } from "react";
import { fetchGuilds } from "../api/client";
import { PaymentConfig } from "./PaymentConfig";
import { PaymentStats } from "./PaymentStats";
import { PaymentTransactions } from "./PaymentTransactions";
import { PaymentCreateModal } from "./PaymentCreateModal";

type View = "stats" | "transactions" | "config";

export function PaymentDashboard() {
  const [guildId, setGuildId] = useState(() => localStorage.getItem("payment_guild_id") ?? "");
  const [guilds, setGuilds] = useState<{ id: string; name: string }[]>([]);
  const [view, setView] = useState<View>("stats");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    fetchGuilds()
      .then((data) => {
        setGuilds(data);
        if (!guildId && data.length > 0) {
          setGuildId(data[0].id);
        }
      })
      .catch((err) => console.error("Failed to load guilds:", err));
  }, []);

  useEffect(() => {
    if (guildId) localStorage.setItem("payment_guild_id", guildId);
  }, [guildId]);

  return (
    <div className="w-full space-y-6">
      {/* Guild selector */}
      <div className="flex items-center gap-4">
        <select
          className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white"
          value={guildId}
          onChange={(e) => setGuildId(e.target.value)}
        >
          <option value="">選擇伺服器</option>
          {guilds.map((g) => (
            <option key={g.id} value={g.id}>{g.name}</option>
          ))}
        </select>
      </div>

      {guildId && (
        <>
          <div className="flex items-center justify-between">
            <div className="flex gap-1">
              {([
                ["stats", "統計總覽"],
                ["transactions", "交易紀錄"],
                ["config", "金流設定"],
              ] as const).map(([key, label]) => (
                <button
                  key={key}
                  className={`px-3 py-1.5 rounded text-sm ${view === key ? "btn-accent" : "text-gray-400 hover:text-white"}`}
                  onClick={() => setView(key)}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              className="btn-accent px-4 py-2 rounded text-sm"
              onClick={() => setShowCreateModal(true)}
            >
              建立付款
            </button>
          </div>

          {view === "stats" && <PaymentStats guildId={guildId} />}
          {view === "transactions" && <PaymentTransactions guildId={guildId} refreshKey={refreshKey} />}
          {view === "config" && <PaymentConfig guildId={guildId} />}

          {showCreateModal && (
            <PaymentCreateModal
              guildId={guildId}
              onClose={() => setShowCreateModal(false)}
              onCreated={() => setRefreshKey((k) => k + 1)}
            />
          )}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Integrate into App.tsx**

In `dashboard/src/App.tsx`:

1. Add import:
```typescript
import { PaymentDashboard } from "./components/PaymentDashboard";
```

2. Add `"payment"` to the `Tab` type:
```typescript
type Tab = "price" | "presence" | "accounting" | "ticket" | "payment";
```

3. Add the tab button in the nav section:
```typescript
<button
  className={`px-3 py-1.5 rounded text-sm ${tab === "payment" ? "btn-accent" : "text-gray-400"}`}
  onClick={() => setTab("payment")}
>
  金流
</button>
```

4. Add the conditional render for the payment tab (before the closing else/PresenceManager block), following the same pattern as TicketDashboard (no props — manages its own guild selection):
```typescript
) : tab === "payment" ? (
  <div className="flex-1 overflow-y-auto p-6">
    <PaymentDashboard />
  </div>
```

- [ ] **Step 3: Build and verify dashboard**

```bash
cd dashboard && npm run build
```

Expected: Build succeeds with no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add dashboard/src/components/PaymentDashboard.tsx dashboard/src/App.tsx
git commit -m "feat(payment): add PaymentDashboard container and integrate into App"
```

---

## Task 17: Obsidian Documentation

**Files:**
- Create: `D:\reiko's coding corner\reiko's corner\ruralbot\smilepay-payment-integration.md`

- [ ] **Step 1: Write Obsidian documentation**

```markdown
# SmilePay 金流串接

## 概述
整合 SmilePay (速買配) 超商代碼繳費至 RuralBot，支援 Background API 和 Standard Payment Page 兩種方式。

## 功能
- 建立付款（背景取號 + 付款頁面 URL）
- 交易追蹤（PENDING → COMPLETED/FAILED/EXPIRED）
- SmilePay Roturl callback 自動處理
- 完整 callback 日誌記錄
- Dashboard 管理介面（統計、交易列表、設定）
- Discord `/payment` 指令

## 環境變數
- `SMILEPAY_DCVC` — 商家代號
- `SMILEPAY_RVG2C` — 參數碼
- `SMILEPAY_VERIFY_KEY` — 檢查碼
- `SMILEPAY_ROTURL` — callback URL，現行 production 目標為 `http://211.22.158.125/api/payment/callback`
- `SMILEPAY_ENV` — `test` 或 `production`

## 資料庫
- `PaymentConfig` — 每 Guild 金流設定
- `PaymentTransaction` — 交易紀錄
- `PaymentCallbackLog` — callback 原始日誌

## API 端點
- `GET/PUT /api/payment/config/:guildId`
- `POST /api/payment/create/:guildId`
- `GET /api/payment/transactions/:guildId`
- `GET /api/payment/transaction/:id`
- `GET /api/payment/stats/:guildId`
- `POST /api/payment/callback` (SmilePay Roturl)

## Discord 指令
- `/payment create <amount> [payer] [remark]`
- `/payment status <order_id>`
- `/payment list [status] [days]`
- `/payment stats [days]`
```

- [ ] **Step 2: Commit all and push**

```bash
git add -A
git commit -m "feat(payment): complete SmilePay payment gateway integration"
git push
```
