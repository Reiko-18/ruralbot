# CLAUDE.md

本檔案為 Claude Code 於本 repo 工作時的最高指引，內容與 `AGENTS.md` 同步，所有代理皆須遵守。

## Claude 的工作職責（最高優先）

- 每當使用者提出新需求時，Claude 必須**優先執行以下前置確認流程**，再開始分析或寫計畫：
  1. 執行 `git log --oneline -10` 取得最新 10 筆 commit
  2. 讀取 `docs/superpowers/plans/` 目錄，找出最近一份計畫文件
  3. 對照計畫文件中的 Task 清單與 commit 紀錄，判斷上一份計畫是否已完成
  4. 在回覆開頭明確告知使用者：「上一份計畫 **[已完成 / 部分完成 / 未完成]**」，並列出未完成的項目（若有）
  5. 確認後才進入新需求的分析與計畫撰寫

- Claude 的工作是**分析使用者需求**，根據專案現況寫出完整實作計畫，**不直接執行任何計畫**。
- 計畫將交由 Codex（或其他代理）實現，因此計畫內必須包含足夠的 prompt 引導語，讓 Codex 能正確理解專案慣例、注意事項與執行順序。
- 每份計畫文件需包含：
  - 清楚的目標與架構說明
  - 每個步驟的具體指令、檔案路徑、預期輸出
  - 針對 Codex 的提示語（例如：「注意此專案使用 ESM imports，所有 import 須加 .js 延伸名」）
  - 驗證方式與完成條件
- 計畫完成後儲存至 `docs/superpowers/plans/YYYY-MM-DD-<主題>.md`，並回報使用者計畫路徑。
- **禁止在分析與計畫階段以外執行任何程式碼變更、git 操作或檔案修改。**

## 回覆與語言規則

- 所有回覆一律使用繁體中文。
- 程式碼註解、commit message 說明、文件內容以中文為主。
- 技術術語、套件名稱、API 名稱與程式碼本身可保留英文。

## 最高優先級工作流程

- 任何變更前，先閱讀相關程式碼、現有文件與部署設定。
- 任何變更前，先查詢最新官方技術文件，確認方案可行後再實作。
- 只採用信心值超過 90% 的技術與操作；低於門檻時先標記風險。
- 任何變更前，先完成三重審查。
- 任務完成後，必須執行必要驗證。
- 任務完成後，必須自動 commit 並 push 到 GitHub。
- 任務完成後，必須同步更新 repo 內文件與 Obsidian 筆記。
- 若專案需要編譯成 `.exe`，每次完成改動後都必須自動編譯一次。

## 三重審查要求

- 審查 1：查詢最新官方或主要技術文件，確認方案與版本相容性。
- 審查 2：檢查相關程式碼、部署設定與潛在錯誤。
- 審查 3：檢查是否符合專案慣例、文件體系與維運需求。
- 若可用 subagent，預設使用 3 個 agent 並行審查。
- 若因工具或上層規則無法使用 subagent，改以三輪獨立審查流程替代，仍需先完成審查再修改。

## 信心門檻

- 僅套用信心值超過 90% 的技術、修正與部署操作。
- 若無法達到此門檻，先提出阻塞點與替代方案，不直接落地。

## 專案概要

RuralBot 為 TypeScript 撰寫的 Discord bot 與 dashboard，使用 Prisma + PostgreSQL。
正式部署平台為自架 Ubuntu 主機，搭配：

- systemd 管理 `ruralbot` 單一服務
- 同主機本地 PostgreSQL
- cron 輪詢 GitHub 自動部署
- Express 由 bot 程序同時提供 dashboard 與 API

Railway、Coolify、Supabase 等 PaaS 假設已不屬於現行部署設計。

## 專案結構

- `src/`：Discord bot 與後端服務。
- `src/commands/<feature>/<name>.cmd.ts`：Slash commands。
- `src/events/<feature>/<name>.event.ts`：事件處理。
- `src/services/<feature>/repo_<name>.ts`：領域邏輯、資料存取與整合服務。
- `src/core/`：共用基礎設施（`db.ts`、`command_handler.ts` 等）。
- `src/types/<feature>.type.ts`：TypeScript 型別定義。
- `src/prisma/schema.prisma`：Prisma schema。
- `dashboard/`：Vite + React 管理介面。
- `ops/`：Ubuntu systemd 與 cron 自動部署範本。
- `docs/superpowers/specs/`：設計規格文件。
- `docs/superpowers/plans/`：實作計畫與變更紀錄。

## 資料流

```text
Command/Event -> Event Handler -> Service/Repo -> Prisma DB
Dashboard/API -> Express Route -> Service/Repo -> Prisma DB
```

## 開發與驗證指令

- `npm run dev`：啟動 bot。
- `npm run build`：產生 Prisma client 並建置 dashboard。
- `npm run build:dashboard`：只建置 dashboard。
- `npm run db:generate`：重建 Prisma client。
- `npm run db:migrate`：執行本地 migration。
- `npm run db:push`：同步 schema 到資料庫。
- `npm run db:studio`：開啟 Prisma Studio。
- `cd dashboard; npm run dev`：本地啟動 dashboard。

## 編碼與設計規範

- 使用 TypeScript、ESM imports、2 空白縮排與雙引號字串。
- 依現有命名慣例維持 `.cmd.ts`、`.event.ts`、`repo_*.ts`、PascalCase 元件命名。
- Command 檔案使用 `.cmd.ts` 後綴；事件使用 `.event.ts`；型別使用 `.type.ts`；repository 服務以 `repo_` 前綴。
- Features 依領域分目錄分組。
- 前端介面必須使用 responsive 寫法，不寫死尺寸。
- 變更部署、啟動與健康檢查時，同步檢查 `ops/`、`deploy-commands.mjs`、`prisma.config.ts` 與相關 env 流程。
- 新增或調整函式時，若屬關鍵流程或錯誤處理，應使用既有 logger 記錄。

## 文件與 Obsidian 規範

- repo 內正式設計文件放在 `docs/superpowers/specs/`。
- repo 內實作計畫與變更紀錄放在 `docs/superpowers/plans/`。
- 外部 Obsidian 筆記路徑：`D:\reiko's coding corner\reiko's corner\ruralbot`。
- 每次完成變更後，至少更新一份 repo 內文件與一份對應 Obsidian 筆記。
- 文件與筆記檔名優先使用日期或主題可辨識命名。

## Git 規範

- 任務完成後自動執行 `git add`、`git commit`、`git push`。
- commit 格式遵循 Conventional Commits，例如 `fix(deploy): ...`、`docs(agents): ...`。
- commit 主旨與說明以中文為主，可保留必要英文技術名詞。

## 部署與維運規範

- 現行正式部署平台為自架 Ubuntu 主機，不使用 Railway、Coolify 或其他 PaaS。
- Ubuntu 主機以 systemd 管理 `ruralbot` 單一服務，Discord bot 預設為單實例部署，避免多副本重複登入。
- 建議 repo 路徑為 `/opt/ruralbot`，env 檔路徑為 `/etc/ruralbot/ruralbot.env`。
- PostgreSQL 在同一台 Ubuntu 主機本地自架，預設以 `localhost:5432` 連線。
- `DATABASE_URL` 與 `DIRECT_URL` 皆由環境變數提供，不在程式碼中寫死，範例：

```env
DATABASE_URL=postgresql://ruralbot:<password>@localhost:5432/ruralbot
DIRECT_URL=postgresql://ruralbot:<password>@localhost:5432/ruralbot
```

- 自動部署採 cron 輪詢 GitHub，使用 `git fetch` 與 `git pull --ff-only`，不得使用 destructive reset 作為預設流程。
- 部署流程依序執行：依賴安裝、Prisma generate、migrate deploy、build、systemd restart。
- 健康檢查應優先驗證 HTTP 存活與服務對外可用，不應把暫時性 Discord gateway reconnect 視為服務失敗。
- SmilePay callback URL、公開網域、env 變數與反向代理設定必須一致。
- 若使用 `http://211.22.158.125/api/payment/callback`，主機需將 80 port 反向代理至 dashboard 實際監聽 port。
- 轉移平台時，不保留與舊平台強綁定的設定命名，除非有相容性需求。

## 安全與設定

- 秘密資訊以 `.env`、systemd `EnvironmentFile` 或主機環境變數管理，不寫入版本控制。
- 不得提交 `.env`、資料庫密碼、Discord token、SmilePay key 或任何第三方服務密鑰。
- 修改資料庫、支付、Discord 或部署相關設定時，應同步檢查風險與回滾方式。
- migration 回滾需特別標記風險；若 schema 變更無法自動回滾，需提出手動還原方案。
- 變更後須執行必要驗證，更新 repo 文件與 Obsidian 筆記，再 commit 與 push。

## 例外與衝突處理

- 若使用者有明確新指示，優先以使用者當前指示為準。
- 若規則因工具、權限或環境限制無法完整執行，需明確回報阻塞點，再採用最接近規則的方案。

## Mindset

- 以企業級工程師標準工作，重視正確性、可維護性、可部署性與可驗證性。
