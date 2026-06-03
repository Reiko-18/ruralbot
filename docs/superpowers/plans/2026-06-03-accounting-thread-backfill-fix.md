# 2026-06-03 訂單紀錄漏發補救

## 問題

使用者回報 2026/05 訂單在 dashboard 可見，但沒有依預期發送到 Discord 訂單紀錄頻道 `1483831380029739169`。正式服務 `/healthz` 顯示 Discord Ready，且 `/api/accounting/orders` 查到 2026/05 有 38 筆訂單，表示 DB 寫入正常，問題集中在 Discord thread log 投遞或設定。

## 三重審查

1. 官方文件：Discord thread 發訊息需要可看見頻道、建立公開 thread、在 thread 內發訊息等權限；discord.js 仍以 channel/thread `send()` 投遞訊息。Prisma `findMany` 可用 `orderBy` 保證補發順序。
2. 程式碼：`/order-add` 與 `/order-custom` 會先寫入 `orders`，再呼叫 `logOrderToThread()`；若 Discord 發送失敗只記錄錯誤，不會回滾 DB，因此 dashboard 可見但 Discord 缺漏是現有架構允許的狀態。
3. 維運：既有 `backfill_threads.ts` 會重送所有訂單且沒有去重，不能直接用於正式補發，需先加日期範圍、目標頻道與 Discord 既有訂單 ID 掃描。

## 修正

- `src/services/accounting/thread_logger.ts`
  - 抽出 `formatOrderThreadDate()`、`getOrCreateOrderThread()` 與 `buildOrderLogEmbed()`，讓即時投遞與補發腳本共用同一格式。
  - 支援 `ACCOUNTING_CHANNEL_ID` 作為緊急覆寫，避免 DB `AccountingConfig` 缺漏時完全跳過投遞。
  - 發送前檢查並記錄缺少的 Discord 權限。
- `src/scripts/backfill_threads.ts`
  - 改為預設 dry-run，必須加 `--yes` 才會實際發送。
  - 支援 `--start`、`--end`、`--order-id`、`--guild-id`、`--channel-id`。
  - 每個日期 thread 先掃描既有 Embed title 的 `#ORDER_ID`，只補發缺漏訂單。
  - DB 查詢以 `createdAt asc, id asc` 補發，維持順序。
- `src/services/accounting/thread_backfill.ts`
  - 將補發、掃描既有 Discord 訂單 ID、依日期 thread 分組與送出重試邏輯集中成共用 service。
- `src/commands/accounting/accounting-backfill.cmd.ts`
  - 新增 Administrator-only `/accounting-backfill`，可在 Discord 內使用正式 bot client 與正式 DB 執行 dry-run 或實際補發。
- `package.json`
  - 新增 `npm run backfill:accounting-threads`。
- `.env.example`
  - 新增選用 `ACCOUNTING_CHANNEL_ID`。

## 補發指令

正式環境部署新版後，先 dry-run：

```bash
npm run backfill:accounting-threads -- --start 2026-05-01 --end 2026-06-01 --channel-id 1483831380029739169
```

確認待補清單正確後實際補發：

```bash
npm run backfill:accounting-threads -- --start 2026-05-01 --end 2026-06-01 --channel-id 1483831380029739169 --yes
```

若沒有 SSH 或正式主機 shell 權限，部署新版後可由 Discord 管理員執行：

```text
/accounting-backfill channel:#訂單紀錄 start:2026-05-01 end:2026-06-01 dry_run:true
/accounting-backfill channel:#訂單紀錄 start:2026-05-01 end:2026-06-01 dry_run:false
```

## 驗證

- 已執行 `npm run build`。本機因沒有 `.env`，第一次缺 `DIRECT_URL`；後續以 `.env.example` 形狀的 dummy `DATABASE_URL` / `DIRECT_URL` 注入該次 shell 後，Prisma generate、server TypeScript 與 dashboard Vite build 皆通過。
- 正式補發需在有 `TOKEN` 與 `DATABASE_URL` 的 Ubuntu 主機執行。
- 本機目前沒有 SSH 憑證與 `.env`，不能直接登入正式 Discord 或 PostgreSQL。

## 風險與回滾

- 未修改資料庫 schema，無 migration 回滾問題。
- 若補發指令誤設日期，dry-run 會先列出待補資料；實際送出需要 `--yes`。
- 回滾方式：還原 `thread_logger.ts`、`backfill_threads.ts`、`package.json`、`.env.example` 與文件後重新 build/deploy。
