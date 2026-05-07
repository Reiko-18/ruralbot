# 2026-05-07 Discord DM 不可送達處理

## 背景

正式環境出現 `DiscordAPIError[50278]: Cannot send messages to this user due to having no mutual guilds`。觸發點在 `/rp` 付款建立成功後嘗試傳送私人訊息付款資訊。

## 三重審查

1. 官方文件審查：Discord API 錯誤碼文件定義 `50278` 為無共同 guild 而不能傳訊息；User 資源文件顯示 DM 需透過建立 DM channel 後送訊息，實務上仍可能因使用者狀態或隱私設定失敗。
2. 程式碼審查：`src/events/payment/rp-interact.event.ts` 與 `src/services/payment/payment_callback.ts` 都會傳送付款相關 DM，且付款資訊已先更新在原互動訊息或頻道通知中，DM 屬輔助通知。
3. 維運審查：預期中的 DM 不可送達不應以完整 stack trace 污染警告監控；真正未知的 Discord API 或建構錯誤仍需保留 warn。

## 變更

- 新增 `src/services/discord/dm.ts`，集中處理使用者 DM 發送。
- 對 Discord error code `50007` 與 `50278` 改以 `info` 記錄，表示使用者不可接收 DM。
- `/rp` 建單通知與 SmilePay 成功 callback 通知共用同一 helper。
- 保留 embed 建構或其他未知錯誤的 `warn`。

## 驗證

- `npx tsc --noEmit`：通過。
- `npm run build`：本機因缺少 `DIRECT_URL`，Prisma config 載入階段中止，未完成完整 build。正式環境需由 systemd 或 `.env` 提供 `DIRECT_URL`。

## 官方參考

- Discord API 錯誤碼與狀態碼：https://discord.com/developers/docs/topics/opcodes-and-status-codes
- Discord User 資源與 Create DM：https://discord.com/developers/docs/resources/user#create-dm
