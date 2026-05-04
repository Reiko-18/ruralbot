# 金流訊息 Emoji 裝飾設計

## 背景

金流機器人版面需要使用指定動態 emoji `<a:ZSz26520125622:1343576083617812502>`，並在 Discord Embed 中加入更多符號裝飾，使版面接近截圖中的「標題 emoji、菱形欄位、縮排行」風格。

## 設計

- 新增 `src/services/discord/emoji.ts` 作為共用 Discord emoji helper。
- helper 解析 `<:name:id>` 與 `<a:name:id>` 格式，支援一般與動態自訂 emoji。
- helper 會先從 `client.emojis.cache` 與所有 `client.guilds.cache` 的 emoji cache 尋找可用 emoji。
- 找到 guild emoji 時，Embed 文字使用 `GuildEmoji#toString()`，Button 使用 `{ id, name, animated }` 格式。
- 找不到時保留原始 Discord emoji 文字格式，讓 Discord 端仍有機會在 bot 具備權限時渲染。

## 金流版面規則

- `/rp` 初始頁、付款方式確認、購買人資訊確認、取號結果、私人訊息與 callback 成功通知皆套用指定動畫 emoji。
- Embed 欄位名稱以 `◇` 開頭，欄位值以 `└` 呈現下階資訊。
- 描述文字以 `◆` 呈現主要資訊，避免使用過長分隔線。
- 色彩維持既有淡紫主題 `0xb8a7ff`；付款完成狀態維持綠色成功色。

## 風險與限制

- Discord 是否顯示自訂 emoji 仍取決於 bot 是否能使用該 emoji、伺服器權限與 Discord 端渲染規則。
- 本次不修改 gateway intent，因現有 `Guilds` intent 已符合 emoji cache 需求。
- 本次不修改 SmilePay API、資料庫 schema、部署設定或 callback URL。

## 驗證

- `npm run build`：通過。
