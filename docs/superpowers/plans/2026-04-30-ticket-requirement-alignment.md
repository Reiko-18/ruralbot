# 2026-04-30 票口需求對齊紀錄

## 官方文件查證

- Discord 官方 Component Reference：Action Row 可包含最多 5 個 buttons，或單一 select component；String Select 互動會回傳 `custom_id` 與 `values`。
- Discord 官方 Channel Resource：文字頻道可建立 public thread；本專案票口紀錄維持以指定紀錄頻道的月份 thread 集中保存。
- 本次仍使用既有 discord.js v14 與 legacy embed + components 訊息格式；官方文件標示 legacy component 行為仍可用。

## 三輪審查結果

1. 版本相容性：現有 `discord.js ^14.25.1` 支援 `ButtonBuilder`、`StringSelectMenuBuilder`、`ActionRowBuilder`、thread 建立與 permission overwrite。
2. 程式碼與部署設定：票口後端已存在，但原本面板只支援按鈕、`TicketConfig` 缺少全域開啟/關閉分類、關閉票口允許通知角色，不符合「只有管理員」。
3. 專案慣例與維運：沿用 Prisma migration、`repo_*`、dashboard API 與既有 React 元件結構；不調整 systemd、cron、nginx 或 env 流程。

## 本次調整

- `TicketConfig` 新增 `categoryOpenId`、`categoryCloseId`、`panelComponentType`，支援主面板預設建立分類、關閉後分類，以及按鈕/下拉式選單模式。
- 面板部署改用 `buildPanelComponents`，依設定輸出按鈕或 String Select；按鈕與選單都限制在 Discord 元件上限 25 個選項內。
- 建立票口時，子票口分類優先，未設定時 fallback 到主面板分類。
- 關閉票口、重開票口、刪除票口、發送票口紀錄都只允許 Administrator。
- 關閉與自動超時關閉會優先使用子票口關閉分類，未設定時 fallback 到主面板關閉分類。
- Dashboard 主面板新增分類與互動元件設定，紀錄設定新增 `transcriptTarget` 發送範圍。

## 2026-04-30 追加市場常見票口功能

市場對照來源包含 Ticket Tool、TicketsBot 與 Discord ticket bot 常見功能頁，常見能力分成 staff workflow、transcript、dashboard、表單與使用者體驗。本次優先補上不需要重做大型資料模型、且能直接提升維運效率的功能：

- 認領 / 取消認領：管理員可在票口內認領案件，避免多人重複處理。
- 鎖定 / 解鎖：管理員可暫停或恢復客人發言權限。
- 加入 / 移除成員：管理員可輸入使用者 ID 或 mention，直接調整票口可見與發言權限。
- 重新命名：管理員可透過 modal 修改票口頻道名稱。
- 關閉原因：關閉票口改用 modal 填寫原因，寫入資料庫與 transcript 摘要。
- Transcript 摘要補上處理人員、關閉人員與關閉原因。
- Dashboard 關閉 / 重開 / 刪除 / 產生紀錄 API 改為同步操作 Discord 頻道，不再只改資料庫狀態。
- Dashboard 票口列表顯示處理人員、鎖定狀態與關閉原因。

### 尚未一次納入的較大型功能

以下屬於市場票口 bot 的進階功能，但需要新增設定頁、資料模型或全文索引，不適合混在本次低風險 workflow 修正內一次硬上：

- 開單前表單建構器：每個子票口自訂問題、必填欄位、附件欄位。
- 快捷回覆 / canned response / tag：需建立回覆模板 CRUD 與權限設定。
- 滿意度評分 / feedback：需新增評分資料表與統計圖。
- 每使用者開單上限、冷卻時間與同類型重複票口限制。
- Transcript 搜尋與永久檔案儲存：目前 transcript 仍以 Discord 附件與 thread 為主，若要搜尋需要 DB 或物件儲存。
- SLA / 優先級 / 升級通知：需新增優先級欄位、排程與 dashboard 指標。

## 驗證

- 已執行 `npm run build`，通過 Prisma generate、TypeScript build、dashboard production build。
- `npm install --include=dev` 回報既有 3 個 npm audit 弱點，未在本次票口需求範圍內變更。
