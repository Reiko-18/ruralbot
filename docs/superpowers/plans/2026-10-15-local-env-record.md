# 本機環境憑證紀錄 — 2026-10-15

- 依使用者要求將提供的六項資料保存於專案根目錄 `.env`，實際值不寫入文件或 Git。
- `TOKEN`、`APPLICATION_ID` 對應目前 bot 登入與 Slash commands 註冊流程。
- `DISCORD_CLIENT_ID`、`DISCORD_PUBLIC_KEY`、`DISCORD_CLIENT_SECRET`、`RENDER_API_KEY` 僅供本機保存；目前程式未使用，未新增相關整合或變更部署平台。
- 未加入可選行為設定，也未自行補造資料庫或管理介面憑證。此紀錄不代表完整可啟動設定。
- 已完成官方 dotenv 文件、程式與部署設定、Git 忽略與文件規範三項獨立審查。
- 驗證六個欄位名稱唯一、值非空，以及 `.env` 被 Git 忽略且未被追蹤；未連線驗證憑證有效性或啟動 bot。
- 僅涉及本機憑證保存與文件，不需建置程式或產生 `.exe`。
- 正式 Ubuntu 服務仍由 systemd 的 `EnvironmentFile` 管理，本次未變更遠端設定。
- 回復方式：刪除本次建立的本機 `.env`；不涉及資料庫或遠端服務變更。
