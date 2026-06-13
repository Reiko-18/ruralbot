# 2026-06-13 封鎖可疑 Discord 伺服器

## 背景

RuralBot 被邀請進入未知伺服器 `1500125455619985460`。需求是讓 bot 退出該伺服器，且未來即使再次被邀請也要自動退出。

## 審查結論

1. Discord 官方 REST API 支援 bot 以目前使用者身分離開 guild；discord.js v14 也提供 `Guild#leave()` 包裝此行為。
2. 刪除 guild 不是一般 bot 可安全執行的操作，且成功條件與 ownership 綁定，不符合本專案 90% 信心門檻。
3. 此需求不需要資料庫 migration。封鎖清單屬維運設定，採用 `BLOCKED_GUILD_IDS` 環境變數，並將 `1500125455619985460` 內建為緊急預設封鎖 ID。

## 變更內容

- 新增 `src/services/discord/guild_guard.ts`，集中處理封鎖 guild 判斷與退出。
- `guildCreate` 事件偵測到封鎖 guild 時立即呼叫 `guild.leave()`，不再發出一般加入通知。
- bot 啟動完成後掃描目前 guild cache，若仍在封鎖 guild 內會嘗試退出。
- slash command handler 會忽略封鎖 guild 的互動，並再次嘗試退出，避免離開流程延遲期間誤執行命令。
- `.env.example` 新增 `BLOCKED_GUILD_IDS` 範例。

## 驗證

- 執行 `npm run build` 確認 Prisma generate、TypeScript server build 與 dashboard build 全部通過。

## 維運備註

- 遠端正式環境部署後，需確認 systemd `EnvironmentFile` 或主機環境變數含有 `BLOCKED_GUILD_IDS=1500125455619985460`。即使未設定，程式仍會內建封鎖此 guild。
- 若未來要封鎖更多 guild，以逗號或空白分隔加入 `BLOCKED_GUILD_IDS`。
- 若要完全禁止所有外部邀請，需在 Discord Developer Portal 關閉 Public Bot，這會影響所有新伺服器邀請，非本次最小範圍變更。
