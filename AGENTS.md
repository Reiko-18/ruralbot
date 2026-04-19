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
- 若因工具或上層規則無法使用 subagent，改以三輪獨立審查流程替代，仍需先完成審查再修改。

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
- `ops/`：Ubuntu systemd 與 cron 自動部署範本。
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
- PostgreSQL 在同一台 Ubuntu 主機本地自架，預設以 `localhost:5432` 連線。
- `DATABASE_URL` 與 `DIRECT_URL` 皆由環境變數提供，不在程式碼中寫死。
- 自動部署採 cron 輪詢 GitHub，使用 `git fetch` 與 `git pull --ff-only`，不得使用 destructive reset 作為預設流程。
- 健康檢查應優先驗證 HTTP 存活與服務對外可用，不應把暫時性 Discord gateway reconnect 視為服務失敗。
- SmilePay callback URL、公開網域、env 變數與反向代理設定必須一致。
- 若使用 `http://211.22.158.125/api/payment/callback`，主機需將 80 port 反向代理至 dashboard 實際監聽 port。
- 轉移平台時，不保留與舊平台強綁定的設定命名，除非有相容性需求。

## 安全與設定

- 秘密資訊以 `.env`、systemd `EnvironmentFile` 或主機環境變數管理，不寫入版本控制。
- 不得提交資料庫密碼、Discord token、SmilePay key 或任何第三方服務密鑰。
- 需要透過 SSH 連線 Ubuntu 主機時，應優先使用本機 SSH config、環境變數或執行期提供的憑證，不得將 SSH host、帳號、密碼、私鑰或 token 寫入 repo、文件或 Obsidian 筆記。
- 若使用者已在當前對話中提供 Ubuntu 主機的有效 SSH 憑證，代理可在該次工作期間直接使用該憑證進行遠端操作。
- 若使用者已明確允許，代理可在 Ubuntu 主機上使用 `sudo` 執行必要的檢查、部署、維運與修復指令，但仍不得把密碼寫入任何版本控制檔案。
- 若使用者已明確授權 Ubuntu 主機 SSH 與 `sudo`，且工作屬於例行性的部署落差修補、檔案權限修正、service 重載、build 產物修復、cron 與反向代理配置等低歧義維運操作，代理可在同一次任務中直接連續執行，不需在每個可預期的修正點再次詢問。
- 遠端操作若遇到明確可判定的權限/擁有者錯誤、既有目錄不存在、build 產物權限錯誤、systemd 舊設定殘留等常見阻塞，代理應優先嘗試安全修復後再繼續；僅在高風險操作、資料不可逆變更或需求不明確時才中止回問。
- 修改資料庫、支付、Discord 或部署相關設定時，應同步檢查風險與回滾方式。
- migration 回滾需特別標記風險；若 schema 變更無法自動回滾，需提出手動還原方案。

## 例外與衝突處理

- 若使用者有明確新指示，優先以使用者當前指示為準。
- 若規則因工具、權限或環境限制無法完整執行，需明確回報阻塞點，再採用最接近規則的方案。

## Mindset

- 以企業級工程師標準工作，重視正確性、可維護性、可部署性與可驗證性。
