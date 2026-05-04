# Ticket Tool 相容票口系統設計

## 目標

建立一套原創的 Discord 票口系統，功能行為對齊 Ticket Tool 等市面常見票口 bot 的公開能力，但不複製其品牌、文案、介面素材或私有實作。

## 官方與市場功能審查

- Ticket Tool FAQ 公開說明常見能力包含 panel、button option、support team 權限、ping role、transcript channel、每人開票限制、分類、ticket permissions、add/remove users、claiming、backup/restore。
- Ticket Tool beta commands 文件公開列出 transcript、claim、close ask message 等指令能力。
- 同類 ticket bot 文件常見能力包含 button/select panel、表單、claim、lock、close/reopen/delete、transcripts、staff roles、使用者開票限制與 cooldown。

參考來源：

- https://docs.tickettool.xyz/general/faqs
- https://docs.tickettool.xyz/v/beta-docs/general/commands
- https://docs.tickettool.xyz/dashboard/panel-configs/transcript-options
- https://docs.tickettool.xyz/v/beta-docs/dashboard/panel-configs/messages-options

## 本階段落地能力

- 全域每人同時開啟上限：`TicketConfig.maxOpenPerUser`。
- 全域開票冷卻秒數：`TicketConfig.openCooldownSeconds`。
- 可設定頻道命名格式：`TicketConfig.channelNameFormat`，支援 `{type}`、`{number}`、`{username}`、`{userId}`、`{date}`。
- 支援角色：`TicketConfig.supportRoleIds`，會取得票口頻道可見/發言權限，並可操作票口管理按鈕。
- 子票口每人上限與冷卻覆蓋：`TicketButtonType.maxOpenPerUser`、`TicketButtonType.cooldownSeconds`。
- 子票口開票表單：`TicketButtonType.questions`，最多 5 題，支援 short / paragraph、必填、placeholder、maxLength。
- 表單答案保存：`TicketInstance.formAnswers`，並在票口歡迎訊息中摘要顯示。

## 保留不變

- 既有 close / reopen / delete / transcript / claim / lock / add user / remove user / rename workflow 保留。
- 既有 transcript 仍以 HTML 檔案發送到 Discord，不新增外部物件儲存。
- 既有單一 `TicketConfig` 架構保留；多 panel、多 guild scoped panel group 會是後續階段。

## 後續階段

- 多面板資料模型與 panel group。
- Canned responses / tags。
- Ticket log event feed 與 dashboard transcript 搜尋。
- Feedback / rating / CSAT。
- 優先級、SLA、升級提醒。
- Backup / restore 設定匯出匯入。

## 驗證

- `npm run build`：通過。
