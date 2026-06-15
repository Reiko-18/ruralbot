# 2026-06-15 Bot Owner /leave 防禦指令

## 背景

RuralBot 再次被邀請到不明 Discord 伺服器，本次目標 guild id 為 `1515521583169409114`。需求是讓合法 bot 管理者能用 slash command 指定 guild id，要求 bot 主動退出該伺服器。

## 官方文件審查

1. Discord 官方 User API 提供 bot 離開 guild 的 `Leave Guild` 端點；discord.js v14 的 `Guild#leave()` 是此行為的封裝。
2. Discord Application Commands 支援 `STRING` option，適合讓 `/leave` 接收 guild id。
3. discord.js `SlashCommandBuilder` 支援字串 option、長度限制與預設成員權限；本次使用 `PermissionFlagsBits.Administrator` 作為 Discord UI 層級限制，再用 `BOT_OWNER_IDS` 做實際執行者白名單。

參考：

- https://discord.com/developers/docs/resources/user#leave-guild
- https://discord.com/developers/docs/interactions/application-commands
- https://discord.js.org/docs/packages/discord.js/14.25.1/Guild:Class

## 實作內容

- 新增 `src/services/discord/bot_owner.ts`，解析 `BOT_OWNER_IDS`，只接受 17 到 20 位數字 Discord user id。
- 新增 `src/commands/security/leave.cmd.ts`，提供 `/leave guild_id:<id>`：
  - 使用 ephemeral 回覆。
  - 未設定 `BOT_OWNER_IDS` 時直接拒絕。
  - 非 owner 使用者直接拒絕並記錄 warn log。
  - 檢查 guild id 格式。
  - 從 cache 或 Discord API fetch guild 後呼叫 `guild.leave()`。
  - 成功與失敗皆寫入 logger。
- 更新 `src/index.ts` 註冊 `/leave`。
- 更新 `deploy-commands.mjs`，確保手動部署 slash commands 時也包含 `/leave`。
- 更新 `.env.example`，加入 `BOT_OWNER_IDS`，並將 `1515521583169409114` 加入封鎖 guild 範例。
- 更新 `src/services/discord/guild_guard.ts`，將 `1515521583169409114` 加入 emergency default blocklist，啟動掃描或再次加入時會自動離開。

## 安全界線

本次只執行防禦性離開 guild，不實作刪除對方伺服器頻道、踢出成員或其他破壞性操作。這可降低 bot 持續留在不明伺服器的風險，也避免越權或高破壞操作。

## 部署注意事項

正式主機的 `/etc/ruralbot/ruralbot.env` 需要加入：

```env
BOT_OWNER_IDS=你的DiscordUserId
BLOCKED_GUILD_IDS=1500125455619985460,1515521583169409114
```

更新後重新部署或重啟 `ruralbot`。啟動時會部署 slash commands，並掃描已加入 guild；若 bot 仍在 `1515521583169409114`，會自動呼叫 `guild.leave()`。

## 驗證

- `npm run build`
- `node --check deploy-commands.mjs`

