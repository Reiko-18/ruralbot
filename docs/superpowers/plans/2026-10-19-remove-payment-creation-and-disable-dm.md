# 2026-10-19 移除超商代碼開單並禁止私訊操作

## 需求與範圍

- 停止建立超商繳費代碼，保留記帳、商品與銷售訂單功能。
- 禁止透過機器人私訊執行指令或元件操作。
- 保留既有金流交易紀錄、統計、付款回呼與機器人主動通知。

## 實作

- 移除 `/rp` 指令、互動按鈕與買家資料表單流程。
- 移除 `/payment create`，保留 `status`、`list`、`stats`。
- 同步更新啟動註冊與 `deploy-commands.mjs`，避免獨立部署重新加入開單功能。
- 移除後台「建立付款」按鈕、Modal、API client 與 `POST /api/payment/create/:guildId`；舊 API 請求由既有 API catch-all 回傳 404。
- 刪除取號、付款連結產生、買家資料驗證、開單編號與交易建立專用程式，移除唯一供開單使用的 `fast-xml-parser` 依賴。
- 移除開單用啟用開關及手續費設定，設定頁只維護既有交易付款回報所需的商家憑證。
- 兩套全域命令部署均指定 `contexts: [InteractionContextType.Guild]`。
- 共用指令處理器及所有獨立 `InteractionCreate` listener 在入口排除 `!interaction.inGuild()`，涵蓋 Slash commands、自動完成、選單、按鈕與表單。
- 保留付款成功、票口紀錄與黑名單提示等主動私訊通知；私訊中的下載連結不受影響。

## 資料與部署

- 不修改 Prisma schema 或 migrations，不刪除既有交易、回呼紀錄、記帳資料與商家設定資料。
- 保留 GET/POST `/api/payment/callback`、匿名存取例外、驗證碼計算與原子付款狀態更新。
- 既有回呼仍依賴 `getEffectiveCredentials()`，因此保留原有 SmilePay 憑證與環境設定。
- 不更動 `.env`、反向代理、systemd、cron 或 Render 範本；不新增環境變數。
- 來源分支：`codex/remove-payment-creation`，已合併至 `main`。正式服務須更新程式、重新建置並重啟後生效；啟動時會覆寫全域 Slash commands 清單，移除開單並套用僅限伺服器的操作範圍。
- 本次未連線正式 Discord、金流平台或正式資料庫，也未執行正式部署。

## 驗證

- `npm run build`：Prisma client、後端 TypeScript 與 dashboard TypeScript/Vite 建置通過。建置使用暫時的本機假 `DIRECT_URL`，不連線資料庫。
- `node --check deploy-commands.mjs`：通過。
- `node --import tsx --test tests/interaction-scope.test.ts`：6 個測試通過。覆蓋私訊共用入口、3 個元件 listener、伺服器指令執行及兩套部署範圍；獨立部署測試亦檢查開單移除與記帳指令保留。REST 呼叫使用 mock。
- 本機 HTTP 自檢：舊開單 API 回 404，既有交易可查詢；回呼錯誤簽章遭拒、正確簽章可完成付款、重複回呼不重複轉態，GET/POST 均正常。所有資料庫操作使用 mock。
- 開單符號與引用搜尋無殘留，`git diff --check` 通過。

## 三重審查依據

- 官方 API 與版本相容性、程式與部署依賴、專案慣例與維運需求由 3 個 agent 分別完成修改前審查；實作後另完成程式差異審查。
- [Discord 全域命令覆寫](https://docs.discord.com/developers/interactions/application-commands#bulk-overwrite-global-application-commands)：沿用既有 bulk overwrite 流程更新命令清單。
- [Discord 操作環境](https://docs.discord.com/developers/interactions/application-commands#interaction-contexts)：僅允許 Guild，排除 BotDM 與 PrivateChannel。
- [discord.js 14.25.1 ButtonInteraction](https://discord.js.org/docs/packages/discord.js/14.25.1/ButtonInteraction:Class)：執行時使用 `inGuild()`，避免誤擋未快取的伺服器。
- [discord.js 官方開源程式](https://github.com/discordjs/discord.js)：沿用現有套件與部署方式，無新增依賴或相容層。

## 回復方式

若要回復開單與原操作範圍，revert 本次變更 commit，依既有流程重新安裝依賴、建置並重啟服務，使全域命令重新註冊即可；本次沒有資料庫變更，不需資料還原。

## 主線合併（2026-10-19）

- 依使用者指示，以 `git merge --ff-only` 將功能 commit `301f8c4` 合併到 `main`，並正常推送至 GitHub；沒有強制推送或改寫歷史。
- 合併前已 fetch 最新遠端，主線沒有額外提交；合併後程式碼與先前通過建置、6 項測試及 HTTP 自檢的版本完全一致，本次僅追加合併文件。
- 既有部署設定追蹤 `main`，推送可能觸發自動部署；尚未確認正式部署完成或正式服務健康狀態。
