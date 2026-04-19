# 訂單日期時區修復計畫 — 2026-04-19

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Codex 執行前提醒：**
> - 此專案使用 TypeScript + ESM，所有 import 必須加 `.js` 副檔名
> - 修改完成後執行 `npx tsc --noEmit` 確認型別無誤，再 commit + push
> - 伺服器 auto-deploy cron 會在 1 分鐘內自動拉取並重啟服務
> - **不需要做 DB migration**，此修復只影響新建立的訂單

**Goal:** 修復使用者指定日期建立訂單時，訂單被歸類到前一天的時區錯誤。

**Architecture:** 根本原因是 `new Date('YYYY-MM-DDT00:00:00')` 在 UTC+8 伺服器上會被解析為台灣午夜（UTC 前一天 16:00），導致 PostgreSQL 的 `EXTRACT(DAY)` 查詢返回前一天。修法是將時間字串改為 `T12:00:00+08:00`（台灣正午），存入 PostgreSQL 為 `T04:00:00Z`，UTC 日期永遠等於輸入日期。

**Tech Stack:** TypeScript, discord.js v14, PostgreSQL, Prisma 7

---

## 根本原因詳解

```
使用者輸入 date: "2026-04-12"
  ↓ new Date(`2026-04-12T00:00:00`)    ← 無時區後綴 → Node.js 以本地時間（UTC+8）解析
  ↓ 實際 UTC 值 = 2026-04-11T16:00:00Z ← 存入 PostgreSQL
  ↓ EXTRACT(DAY FROM created_at)  = 11  ← 按 UTC 計算，得到 4/11
  ↓ 訂單被歸類到 4/11                  ← BUG

修復後：
  ↓ new Date(`2026-04-12T12:00:00+08:00`)  ← 明確指定 UTC+8 正午
  ↓ 實際 UTC 值 = 2026-04-12T04:00:00Z    ← 存入 PostgreSQL
  ↓ EXTRACT(DAY FROM created_at)  = 12     ← UTC 日期仍是 4/12 ✓
  ↓ Discord 顯示 = 2026-04-12 下午 12:00  ← 台灣時間正午 ✓
```

---

## 檔案影響清單

| 動作 | 路徑 | 行號 | 說明 |
|------|------|------|------|
| 修改 | `src/commands/accounting/order-add.cmd.ts` | 76 | `T00:00:00` → `T12:00:00+08:00` |
| 修改 | `src/commands/accounting/order-custom.cmd.ts` | 44 | `T00:00:00` → `T12:00:00+08:00` |

---

## Task 1：修復 order-add.cmd.ts 的日期解析

**Files:**
- Modify: `src/commands/accounting/order-add.cmd.ts:76`

---

- [ ] **Step 1: 確認目前第 76 行的內容**

開啟 `src/commands/accounting/order-add.cmd.ts`，確認第 76 行為：

```typescript
const createdAt = normalizedDate ? new Date(`${normalizedDate}T00:00:00`) : new Date();
```

---

- [ ] **Step 2: 將第 76 行改為使用台灣時區正午**

將第 76 行：
```typescript
const createdAt = normalizedDate ? new Date(`${normalizedDate}T00:00:00`) : new Date();
```

改為：
```typescript
const createdAt = normalizedDate ? new Date(`${normalizedDate}T12:00:00+08:00`) : new Date();
```

**變更說明：**
- `T12:00:00+08:00`：台灣時間（UTC+8）正午
- 等同 UTC `T04:00:00Z`，確保 `EXTRACT(DAY)` 在 PostgreSQL 中取得的日期與使用者輸入的日期一致
- Discord 會顯示為「下午 12:00」（台灣時間正午），而不是原本錯誤的「上午 12:00」（午夜）
- `new Date()` 保持不變：不指定日期時使用當前實際時刻，時區正確

---

- [ ] **Step 3: 驗證 TypeScript 型別**

```bash
cd d:\ruralbot
npx tsc --noEmit
```
預期：無任何錯誤輸出，exit code 0。

---

## Task 2：修復 order-custom.cmd.ts 的日期解析

**Files:**
- Modify: `src/commands/accounting/order-custom.cmd.ts:44`

---

- [ ] **Step 1: 確認目前第 44 行的內容**

開啟 `src/commands/accounting/order-custom.cmd.ts`，確認第 44 行為：

```typescript
const createdAt = normalizedDate ? new Date(`${normalizedDate}T00:00:00`) : new Date();
```

---

- [ ] **Step 2: 將第 44 行改為使用台灣時區正午**

將第 44 行：
```typescript
const createdAt = normalizedDate ? new Date(`${normalizedDate}T00:00:00`) : new Date();
```

改為：
```typescript
const createdAt = normalizedDate ? new Date(`${normalizedDate}T12:00:00+08:00`) : new Date();
```

---

- [ ] **Step 3: 驗證 TypeScript 型別**

```bash
cd d:\ruralbot
npx tsc --noEmit
```
預期：無任何錯誤輸出，exit code 0。

---

## Task 3：Commit 並 push

- [ ] **Step 1: Commit 兩個檔案**

```bash
cd d:\ruralbot
git add src/commands/accounting/order-add.cmd.ts src/commands/accounting/order-custom.cmd.ts
git commit -m "fix(accounting): 修復訂單日期時區問題，改用 T12:00:00+08:00 避免 UTC 午夜跨日"
git push origin main
```

預期：push 成功，伺服器 cron 在 1 分鐘內自動 pull + 重啟 ruralbot。

---

## 完成驗證

**功能驗證（在 Discord 執行）：**

1. 執行 `/order-custom name:測試 price:100 cost:80 date:2026-04-12`
2. 確認訂單顯示的日期為 **4/12 下午 12:00**（不是「上午 12:00」）
3. 在 sales-overview 或 order-lookup 中查詢 4/12，確認訂單出現在正確日期

---

## 注意事項

- **舊資料不受影響**：已存在的訂單仍以舊的 UTC 值儲存，歸類仍是錯誤的日期。若需修正舊資料，需額外執行 DB 更新指令（本計畫不涵蓋，可視需求另行處理）。
- **不指定日期的訂單**（`new Date()`）：使用當前時刻，因為是即時操作，台灣時間與 UTC 日期的差異通常無影響（只有凌晨 12:00–8:00 之間會有跨日問題，但屬於極端邊緣情況）。
