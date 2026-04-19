# AGENTS.md

本檔案定義本專案中所有代理在工作時必須遵守的規則。

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
- 若無法使用 subagent，改以三輪獨立審查流程替代，仍需先完成審查再修改。

## 信心門檻

- 僅套用信心值超過 90% 的技術、修正與部署操作。
- 若無法達到此門檻，先提出阻塞點與替代方案，不直接落地。

## 專案結構

- `src/`：Discord bot 與後端服務。
- `src/commands/`：Slash commands。
- `src/events/`：事件處理。
- `src/services/`：領域邏輯、資料存取與整合服務。
- `src/core/`：共用基礎設施。
- `src/prisma/`：Prisma schema 與相關設定。
- `dashboard/`：Vite + React 管理介面。
- `docs/superpowers/specs/`：設計規格文件。
- `docs/superpowers/plans/`：實作計畫與變更紀錄。

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
- 前端介面必須使用 responsive 寫法，不寫死尺寸。
- 變更部署、啟動與健康檢查時，同步檢查 `Dockerfile`、`railway.json`、`deploy-commands.mjs` 與相關 env 流程。
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

- Coolify 的 Dockerfile 型部署使用 UI health check 時，image 內必須具備 `curl` 或 `wget`。
- Discord bot 預設為單實例部署，避免多副本重複登入。
- 健康檢查應優先驗證 HTTP 存活與服務對外可用，不應把暫時性 gateway reconnect 視為容器失敗。
- callback URL、公開網域、env 變數與部署平台設定必須一致。
- 轉移平台時，不保留與舊平台強綁定的設定命名，除非有相容性需求。

## 安全與設定

- 秘密資訊以 `.env` 或部署平台 env 管理，不寫入版本控制。
- 修改資料庫、支付、Discord 或部署相關設定時，應同步檢查風險與回滾方式。

## 例外與衝突處理

- 若使用者有明確新指示，優先以使用者當前指示為準。
- 若規則因工具、權限或環境限制無法完整執行，需明確回報阻塞點，再採用最接近規則的方案。

## Mindset

- 以企業級工程師標準工作，重視正確性、可維護性、可部署性與可驗證性。
