# 2026-07-07 會計日誌 thread「Missing Access (50001)」收斂與根因處理

## 背景

正式主機出現以下 Discord 錯誤：

```
DiscordAPIError[50001]: Missing Access
    at ChannelManager.fetch (discord.js/.../ChannelManager.js:130)
    at async logOrderToThread (src/services/accounting/thread_logger.ts:108:21)
    at async Module.execute (src/commands/accounting/order-add.cmd.ts:98:5)
    at async handleInteraction (src/core/command_handler.ts:50:3)
    at async Client.<anonymous> (src/index.ts:168:3)
```

### 診斷結論（重要，Codex 先理解再動手）

1. 這**不是 crash**。`logOrderToThread`（`thread_logger.ts:91-127`）整段包在 `try/catch` 內，第 108 行 `client.channels.fetch(channelId)` 丟出的 `50001` 已被第 124 行 catch 接住並以 `logger.error(... "Failed to log order to thread")` 記錄。stack trace 一路顯示到 `order-add.cmd.ts:98 / command_handler:50 / index.ts:168`，那是 V8 async/await 的呼叫鏈，**不代表指令中斷**——`order-add` 仍會走到第 100 行 `interaction.editReply("訂單已建立...")`，使用者體驗上訂單建立成功，只有「寫入當日會計 thread」這一步失敗。
2. **根因**：`logOrderToThread` 取用的會計頻道 id（優先 `process.env.ACCOUNTING_CHANNEL_ID`，否則 DB accounting config 的 `channelId`，且 `targetGuildId` 會先套用 `botConfig.primaryGuildId` 轉址）指向一個 **bot 無法存取的頻道**。最可能情境：該頻道所在 guild 已被 bot 離開（近期 `/leave`、blocked-guild guard 大量退群），或 bot 在該頻道被移除 `View Channel` 權限，或該頻道已被刪除。
3. 這與 **2026-06-15 owner-leave 計畫已處理過的「同步頻道 Missing Access」是同一類問題**。`src/services/config/sync_mirror.ts:82-89` 已有處理範式：`getDiscordErrorCode(err) === 50001 → 印簡短 warn 並提示重設頻道`。`thread_logger.ts` 尚未套用同樣收斂，因此目前印出整段 error stack，屬雜訊。

## 目標

- **(A) 程式碼層**：讓 `thread_logger.ts` 對 `Missing Access (50001)`、`Unknown Channel (10003)`、`Missing Permissions (50013)` 這類「頻道存取失敗」的錯誤，改印**簡短 warn**（含頻道 id 與「請重新執行 `/accounting-setup`」提示），不再印整段 error stack；其他非預期錯誤維持原本 `logger.error`。
- **(B) 維運層**：文件記錄操作者需重新設定會計頻道。

## 官方文件審查（Codex 執行前先確認信心值 > 90%）

1. Discord API error code `50001 = Missing Access`、`10003 = Unknown Channel`、`50013 = Missing Permissions`（Discord 官方 Opcodes and Status Codes / JSON Error Codes 文件）。參考：https://discord.com/developers/docs/topics/opcodes-and-status-codes#json-json-error-codes
2. discord.js v14 `Client#channels.fetch()` 對無權限/不存在頻道會 reject 一個帶 `.code` 數字的 `DiscordAPIError`；此專案既有 `sync_mirror.ts` 與 `dm.ts` 皆已用 `err.code` 判斷，沿用同一慣例即可，不需引入新依賴。
3. 本次不改變任何數值/金額邏輯，只改 log 行為與錯誤分類，風險低。

## 範圍

- **只改** `src/services/accounting/thread_logger.ts`。
- **不要動** `order-add.cmd.ts`、`repo_accounting_config.ts`、accounting 金額計算、任何 DB schema，也不要順手重構其他函式。

## 實作內容（給 Codex 的逐步指令）

> 注意：本專案使用 **ESM imports，所有相對 import 必須帶 `.js` 副檔名**；縮排 2 空白、雙引號字串；沿用檔案既有風格。

### 步驟 1：在 `thread_logger.ts` 加入錯誤碼判斷 helper

在檔案上方（`import` 之後、`OrderThreadLogOrder` type 之前）新增一個與 `sync_mirror.ts:10-15` 一致的小工具，避免跨檔耦合：

```ts
function getDiscordErrorCode(err: unknown): number | string | undefined {
  if (err && typeof err === "object" && "code" in err) {
    return (err as { code?: number | string }).code;
  }
  return undefined;
}

// Discord: 50001 Missing Access, 10003 Unknown Channel, 50013 Missing Permissions
const CHANNEL_ACCESS_ERROR_CODES = new Set<number | string>([50001, 10003, 50013]);
```

### 步驟 2：改寫 `logOrderToThread` 的 catch（目前第 124-126 行）

把：

```ts
  } catch (err) {
    logger.error({ err, guildId, orderId: order.id }, "Failed to log order to thread");
  }
```

改為：

```ts
  } catch (err) {
    if (CHANNEL_ACCESS_ERROR_CODES.has(getDiscordErrorCode(err) ?? -1)) {
      logger.warn(
        { guildId, orderId: order.id, code: getDiscordErrorCode(err) },
        "Accounting channel missing access; run /accounting-setup with a channel the bot can access",
      );
      return;
    }
    logger.error({ err, guildId, orderId: order.id }, "Failed to log order to thread");
  }
```

> 提示：`?? -1` 是為了讓 `undefined`（非 Discord 錯誤）不會誤命中 Set；請保留其他非預期錯誤走 `logger.error` 的路徑，不要一律降級成 warn，以免遮蔽真正的 bug。

### 步驟 3（維運，非程式碼，需操作者執行）

在正式主機以合法管理者身分於 bot 仍在且有權限的伺服器頻道重新執行：

```
/accounting-setup channel:<可存取的頻道>
```

並確認 `/etc/ruralbot/ruralbot.env` 若有設定 `ACCOUNTING_CHANNEL_ID`，其值指向的頻道 bot 仍可存取（否則 env 會覆蓋 DB 設定，造成同樣的 50001）。若曾設定 `primaryGuildId` 轉址，需確認轉址後的目標 guild 之會計頻道 bot 仍在。

## 驗證方式與完成條件

- `npm run build`（會跑 Prisma generate 與 dashboard build，須成功；型別檢查通過）。
- 靜態確認 `git diff` 只動到 `src/services/accounting/thread_logger.ts`。
- 邏輯驗收（機械可判定）：
  - 當 `client.channels.fetch` 丟出 `code === 50001 / 10003 / 50013` 時，logger 輸出為 **一行 warn**（含 `"Accounting channel missing access"` 與 `code`），**不含整段 stack**，且函式正常 return（不影響 `order-add` 回覆）。
  - 當丟出其他錯誤（無 `code` 或 `code` 不在集合內）時，仍走 `logger.error(... "Failed to log order to thread")`。
- 維運驗收：重設會計頻道後，重新 `/order-add` 建立一筆訂單，確認當日 thread 有收到 embed，且 logger 不再出現 50001。

## 安全界線

- 不改動任何金額/利潤計算與 DB 寫入邏輯。
- 僅調整錯誤分類與 log 等級，屬防禦性、可回滾（單檔 revert 即還原）。

## 後續（完成後依專案規範）

- `git add`/`commit`（建議 `fix(accounting): 收斂會計日誌頻道 Missing Access 錯誤`）/`push`。
- 更新一份 repo 內文件（本計畫）與對應 Obsidian 筆記（`D:\reiko's coding corner\reiko's corner\ruralbot`）。

---

## 實作結果（2026-07-07 已落地）

只改 `src/services/accounting/thread_logger.ts`，實際做法：

1. 新增 `getDiscordErrorCode` helper 與 `CHANNEL_ACCESS_ERROR_CODES = {50001, 10003, 50013}`（沿用 `services/config/sync_mirror.ts` 慣例）。
2. 把 `botConfig`、`targetGuildId` 與 `channelId` 宣告移到 `try` 外層，讓 catch 能取用做診斷。
3. catch 內：若錯誤碼屬存取類，改印**簡短 warn** 並優雅 return（不中斷訂單），payload 含 `code`、`source`（`env`/`config`，依 `ACCOUNTING_CHANNEL_ID` env 是否有值判定）、`targetGuildId`、`channelId`、`orderId`；其他非預期錯誤維持 `logger.error`。

**根因結論**：此錯誤為**設定/權限問題，非程式邏輯 bug**。轉址（`primaryGuildId ?? guildId`）與 env 優先序皆為刻意設計。程式改動只讓失敗「可自我診斷 + 不中斷」，真正要恢復同步需依下方設定步驟排除。

**驗證**：`npm run build:server`（`tsc`）通過；code-reviewer 三軸審查結論「可合入」，無 blocker/major。

## 設定面排除步驟（需在正式主機操作、以 runtime 值為準）

依序排除，下次失敗的 warn log 會直接標出是 `source: env` 還是 `config`、以及 `targetGuildId`/`channelId`：

1. 檢查 `/etc/ruralbot/ruralbot.env` 是否設了 `ACCOUNTING_CHANNEL_ID`。若有且指向 bot 存取不到/已刪除的頻道 → 清空或改為有效頻道，重啟 `ruralbot`。
2. 用 `/bot-config view` 查出 `primaryGuildId`，在**該主群**以管理員身分執行 `/accounting-setup channel:<可存取頻道>`，確保主群 `AccountingConfig.channelId` 有效。
3. 確認 bot 仍是主群成員（未被 `/leave` 或 `BLOCKED_GUILD_IDS` 誤退），且對該頻道具 View Channel / Send Messages / Create Public Threads / Send Messages in Threads 權限。
