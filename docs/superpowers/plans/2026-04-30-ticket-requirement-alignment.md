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

## 驗證

- 已執行 `npm run build`，通過 Prisma generate、TypeScript build、dashboard production build。
- `npm install --include=dev` 回報既有 3 個 npm audit 弱點，未在本次票口需求範圍內變更。
