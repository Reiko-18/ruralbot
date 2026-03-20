# Ticket System Design Spec

## Overview

進階票口系統，分為 Discord 交互層與 Web 管理層。支援多按鈕分流、黑名單、自動超時、Discord 風格 HTML 存檔、跨伺服器集中存檔、會計模組雙向連結，以及 Dashboard 完整管理與數據分析。

## Data Models (Prisma)

> **Convention**: 所有模型遵循現有 `@@map("snake_case")` 命名規範。`guildId` 為 plain String，不建立外鍵（與 `AccountingConfig` 一致，因 Guild 記錄非必要前提）。

### TicketConfig (每個伺服器一個)

```prisma
model TicketConfig {
  id                String   @id @default(cuid())
  guildId           String   @unique @map("guild_id")
  panelChannelId    String?  @map("panel_channel_id")
  panelMessageId    String?  @map("panel_message_id")
  categoryOpenId    String?  @map("category_open_id")
  categoryCloseId   String?  @map("category_close_id")
  logChannelId      String?  @map("log_channel_id")
  panelEmbed        String?  @db.Text @map("panel_embed")      // JSON string (與 PriceNode.embedSettings 一致)
  defaultMessage    String?  @db.Text @map("default_message")
  lastTicketNum     Int      @default(0) @map("last_ticket_num")
  autoRemindHours   Int?     @map("auto_remind_hours")
  autoCloseHours    Int?     @map("auto_close_hours")
  blacklistMode     String   @default("ephemeral") @map("blacklist_mode") // silent|dm|ephemeral
  blacklistMessage  String?  @db.Text @map("blacklist_message")
  transcriptTarget  String   @default("both") @map("transcript_target") // local|primary|both
  createdAt         DateTime @default(now()) @map("created_at")
  updatedAt         DateTime @updatedAt @map("updated_at")

  buttonTypes       TicketButtonType[]
  blacklist         TicketBlacklist[]
  instances         TicketInstance[]

  @@map("ticket_configs")
}
```

### TicketButtonType (分流按鈕)

```prisma
model TicketButtonType {
  id                String   @id @default(cuid())
  configId          String   @map("config_id")
  label             String
  emoji             String?
  style             String   @default("PRIMARY") // PRIMARY|SECONDARY|SUCCESS|DANGER
  categoryOpenId    String?  @map("category_open_id")
  welcomeMessage    String?  @db.Text @map("welcome_message")
  embedSettings     String?  @db.Text @map("embed_settings")   // JSON string
  notifyRoleIds     String?  @db.Text @map("notify_role_ids")  // JSON string array
  autoRemindHours   Int?     @map("auto_remind_hours")
  autoCloseHours    Int?     @map("auto_close_hours")
  order             Int      @default(0)
  createdAt         DateTime @default(now()) @map("created_at")
  updatedAt         DateTime @updatedAt @map("updated_at")

  config            TicketConfig @relation(fields: [configId], references: [id], onDelete: Cascade)
  instances         TicketInstance[]

  @@map("ticket_button_types")
}
```

### TicketBlacklist

```prisma
model TicketBlacklist {
  id        String   @id @default(cuid())
  configId  String   @map("config_id")
  userId    String   @map("user_id")
  reason    String?
  addedBy   String   @map("added_by")
  createdAt DateTime @default(now()) @map("created_at")

  config    TicketConfig @relation(fields: [configId], references: [id], onDelete: Cascade)

  @@unique([configId, userId])
  @@map("ticket_blacklists")
}
```

### TicketInstance (票口實例)

```prisma
model TicketInstance {
  id             String    @id @default(cuid())
  configId       String    @map("config_id")
  buttonTypeId   String?   @map("button_type_id")
  channelId      String    @unique @map("channel_id")
  creatorId      String    @map("creator_id")
  ticketNum      Int       @map("ticket_num")
  status         String    @default("OPEN") // OPEN|CLOSED|ARCHIVED
  orderId        String?   @map("order_id")
  lastActivityAt DateTime  @default(now()) @map("last_activity_at")
  reminded       Boolean   @default(false) // 已發送超時提醒
  createdAt      DateTime  @default(now()) @map("created_at")
  closedAt       DateTime? @map("closed_at")

  config         TicketConfig      @relation(fields: [configId], references: [id])
  buttonType     TicketButtonType? @relation(fields: [buttonTypeId], references: [id], onDelete: SetNull)
  order          Order?            @relation(fields: [orderId], references: [id], onDelete: SetNull)

  @@index([configId, status])
  @@index([creatorId])
  @@map("ticket_instances")
}
```

### Order 模型擴展

```prisma
// 在現有 Order model 新增反向關聯
tickets  TicketInstance[]
```

### BotConfig 擴展

```prisma
// 新增欄位
ticketLogChannelId  String?  @map("ticket_log_channel_id")  // 主伺服器集中存檔頻道
```

## File Structure

```
src/commands/ticket/
  ticket-setup.cmd.ts         # /ticket-setup — 初始化票口系統（建立 TicketConfig、設定頻道與分類）
  ticket-panel.cmd.ts         # /ticket-panel — 在指定頻道部署/更新面板訊息

src/events/ticket/
  ticket-button.event.ts      # 面板按鈕點擊（開單）
  ticket-manage.event.ts      # 票口內管理按鈕（關閉/重開/刪除/存檔/連結訂單/建立訂單）
  ticket-activity.event.ts    # 監聽訊息更新 lastActivityAt + 重置 reminded

src/services/ticket/
  repo_ticket_config.ts       # TicketConfig CRUD
  repo_ticket_instance.ts     # TicketInstance CRUD + 查詢 + 統計
  repo_ticket_blacklist.ts    # 黑名單 CRUD
  repo_ticket_button_type.ts  # ButtonType CRUD
  ticket_transcript.ts        # 生成 Discord 風格 HTML 存檔（分頁抓取訊息，上限 500 則）
  ticket_timeout.ts           # 自動超時檢查 (setInterval, 每 15 分鐘)
  ticket_panel_builder.ts     # 建構面板 Embed + 按鈕元件

src/types/ticket.type.ts      # 型別定義

dashboard/src/components/
  TicketDashboard.tsx          # 主元件（子頁面切換）
  TicketSettings.tsx           # 全局設定頁
  TicketButtonTypes.tsx        # 按鈕類型管理
  TicketBlacklist.tsx          # 黑名單管理
  TicketOverview.tsx           # 總覽 & 分析
```

## Discord Interaction Flow

### Command Definitions

**`/ticket-setup`** — 初始化票口系統
- 選項：panel-channel、open-category、close-category、log-channel
- 行為：建立或更新該 guild 的 TicketConfig 記錄
- 不部署面板（由 `/ticket-panel` 負責）

**`/ticket-panel`** — 部署面板
- 無選項（使用 TicketConfig 中的設定）
- 行為：在 panelChannelId 發送面板 Embed + 按鈕，儲存 panelMessageId
- 如已有 panelMessageId，嘗試編輯現有訊息；失敗則發送新訊息

### Ticket Creation

1. 使用者點擊面板按鈕
2. 檢查 TicketBlacklist → 在黑名單則依 blacklistMode 回應 (silent/dm/ephemeral + 自訂訊息)
3. 原子遞增 `lastTicketNum`：`prisma.ticketConfig.update({ data: { lastTicketNum: { increment: 1 } } })`
4. 在 categoryOpenId 下建立頻道 `ticket-XXXX`（buttonType 優先，fallback TicketConfig）
5. 設定權限覆蓋：
   - `@everyone`: ViewChannel=false
   - Creator: ViewChannel=true, SendMessages=true, AttachFiles=true
   - notifyRoleIds[]: ViewChannel=true, SendMessages=true
6. 發送歡迎 Embed + 管理按鈕列 (🔒 關閉 | 🔗 連結訂單 | 🛒 建立訂單 | 📜 存檔)
7. 建立 TicketInstance 記錄
8. @ 創建者 + 通知角色
9. Ephemeral 回覆使用者「票口已建立」

**Error Handling:**
- 分類頻道數達上限（50）：回覆錯誤訊息，不建立票口
- Bot 缺少權限：回覆具體缺少的權限名稱
- logChannel 已刪除：跳過存檔發送，記錄 logger 警告

### Ticket Management Buttons

**開啟狀態按鈕列：**
| 按鈕 | 權限 | 行為 |
|------|------|------|
| 🔒 關閉票口 | 管理員/通知角色 | 移除 Creator 權限、移至 closeCategory、status=CLOSED |
| 🔗 連結訂單 | 管理員 | Modal 輸入訂單編號 → 驗證存在 → 綁定 orderId → 更新 Embed |
| 🛒 建立訂單 | 管理員 | Modal：選擇商品（autocomplete）+ 輸入數量 → 透過 profit_engine 計算價格 → repo_order 建立 → 自動綁定 orderId |
| 📜 存檔紀錄 | 管理員 | 生成 HTML → 依 transcriptTarget 發送 |

**關閉狀態按鈕列：**
| 按鈕 | 權限 | 行為 |
|------|------|------|
| 🔓 重新開啟 | 管理員 | 恢復 Creator 權限、移回 openCategory、status=OPEN |
| ⛔ 刪除票口 | 管理員 | 確認對話框 → 刪除頻道、status=ARCHIVED |
| 📜 存檔紀錄 | 管理員 | 同上 |

### Transcript System

1. 分頁抓取訊息（每次 100 則，使用 `before` 參數），上限 500 則
2. 依時間排序，生成 Discord 風格 HTML：
   - 深色背景 (#36393f)
   - 每則訊息：頭像、用戶名、時間戳、內容
   - 支援：圖片附件、Embed、回覆引用
3. 建立 AttachmentBuilder (.html)
4. 私訊 Creator：「您的票口紀錄」+ .html 附件
5. 依 `transcriptTarget` 設定：
   - `local`: 只發到本地 logChannelId 的 Thread「票口紀錄-YYYY-MM」
   - `primary`: 只發到 BotConfig.ticketLogChannelId 的 Thread
   - `both`: 兩邊都發
6. Thread 發送摘要 Embed：票口編號、創建者、開單時間、關閉時間、訊息數量、HTML 附件

### Auto-Timeout Service

- 啟動時 `setInterval`（每 15 分鐘檢查）
- 查詢所有 `status=OPEN` 的 TicketInstance（含 config 和 buttonType）
- 取得有效超時設定（buttonType 優先，fallback TicketConfig）
- `now - lastActivityAt` 超過 `autoRemindHours` 且 `reminded=false`：
  - 發送提醒 Embed 到票口頻道
  - 設定 `reminded=true`
- 超過 `autoCloseHours` → 自動執行關閉流程
- 頻道已被手動刪除：標記 status=ARCHIVED，記錄 logger 警告
- `ticket-activity.event.ts` 監聽訊息時重置 `reminded=false` 和更新 `lastActivityAt`

## Accounting Integration (Bidirectional)

### Ticket → Accounting

- **連結現有訂單**: Modal 輸入訂單編號 → 驗證存在 → 綁定 orderId → 更新 Embed 顯示訂單資訊
- **建立新訂單**: Modal：商品選擇（autocomplete 從 Product 列表）+ 數量輸入 → `profit_engine.ts` 計算 actualPrice/actualCost/profit → `repo_order.createOrder()` → 自動綁定 orderId
- **查看訂單**: 顯示已綁定訂單的詳細資訊 Embed

### Accounting → Ticket

- Dashboard 會計頁訂單列表：訂單如有關聯票口，顯示「📩 ticket-XXXX」徽章
- Dashboard 票口頁列表：票口如有關聯訂單，顯示「🛒 ORD-XXXX」徽章
- Discord 訂單記錄 Embed：如有關聯票口，附帶票口頻道連結

## Dashboard Design

### Tab Structure

主分頁「票口」下有四個子頁面：

1. **設定** — 全局配置：頻道、分類、歡迎詞、超時時間、黑名單回應方式/訊息、存檔目標 (local/primary/both)、面板 Embed 編輯器（復用 EmbedSettingsEditor）
2. **按鈕類型** — 分流按鈕 CRUD：每個按鈕獨立設定 label、emoji、style、categoryOpenId、welcomeMessage、embedSettings、notifyRoleIds、autoRemindHours、autoCloseHours。底部面板即時預覽。
3. **黑名單** — 新增/移除使用者、顯示原因與加入者
4. **總覽 & 分析** — KPI 卡片（開啟中、已關閉、已存檔、平均處理時間）、類型分布條狀圖、每日開單量趨勢圖、票口列表（篩選 status、搜尋、操作按鈕：關閉/重開/刪除/存檔）

### Dashboard API Endpoints

```
# TicketConfig
GET    /api/ticket/config/:guildId
PUT    /api/ticket/config/:guildId

# ButtonTypes
GET    /api/ticket/button-types?configId=xxx
POST   /api/ticket/button-types
PUT    /api/ticket/button-types/:id
DELETE /api/ticket/button-types/:id
PUT    /api/ticket/reorder-button-types

# Blacklist
GET    /api/ticket/blacklist?configId=xxx
POST   /api/ticket/blacklist
DELETE /api/ticket/blacklist/:id

# Instances
GET    /api/ticket/instances?configId=&status=&search=&limit=50&offset=0
GET    /api/ticket/instances/:id
POST   /api/ticket/instances/:id/close
POST   /api/ticket/instances/:id/reopen
DELETE /api/ticket/instances/:id
POST   /api/ticket/instances/:id/transcript

# Analytics
GET    /api/ticket/stats/:configId      # KPI + 分布 + 趨勢
```

> **Note**: 使用 query params 進行篩選，path params 僅用於唯一資源識別。reorder 使用獨立路徑避免與 `:id` 衝突。instances 支援 `limit`/`offset` 分頁。

## Styling

Dashboard 延續現有紫色 glow 主題 (#f9b4fe)，使用現有的 `.glow-card`、`.glow-input`、`.btn-accent` 等 CSS class。復用 `EmbedSettingsEditor` 元件處理 Embed 設定。JSON 設定欄位使用 `String? @db.Text`（stringified JSON）與現有 `PriceNode.embedSettings` 一致。
