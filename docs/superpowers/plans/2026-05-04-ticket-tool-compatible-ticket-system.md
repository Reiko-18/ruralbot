# 2026-05-04 Ticket Tool 相容票口系統（第一階段）

## 目標

把票口系統補齊到市面常見 Ticket Tool 等級的「可營運底座」：權限、限制、表單、命名規則。

## 變更摘要

- Prisma：
  - `TicketConfig` 新增 `maxOpenPerUser`、`openCooldownSeconds`、`channelNameFormat`、`supportRoleIds`
  - `TicketButtonType` 新增 `maxOpenPerUser`、`cooldownSeconds`、`questions`
  - `TicketInstance` 新增 `formAnswers`
  - migration：`20260504000000_ticket_tool_foundation`
- Discord：
  - 開票時若子票口有設定 questions，先顯示 modal 收集資料，再建立票口並把答案摘要寫入歡迎訊息與 DB。
  - 開票前檢查每人同時開啟上限與冷卻秒數（子票口優先，否則用全域）。
  - 支援角色可管理票口按鈕（原本限制 Administrator）。
  - 支援角色與 notify roles 都會加入票口頻道權限與 mention。
  - 頻道名稱改為可用 template 生成。
- Dashboard：
  - 主面板設定新增：每人上限、冷卻、頻道命名格式、支援角色 IDs。
  - 子票口新增：每人上限、冷卻、開票表單 questions JSON、notify roles。

## 驗證

- `npm run build`：通過。

## Obsidian

- 更新：`D:\\reiko's coding corner\\reiko's corner\\ruralbot\\2026-05-04 Ticket Tool 相容票口系統.md`
