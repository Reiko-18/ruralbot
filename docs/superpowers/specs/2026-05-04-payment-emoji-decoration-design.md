# 金流訊息 Emoji 裝飾設計

## 背景

金流機器人版面需要使用指定動態 emoji `<a:ZSz26520125622:1343576083617812502>`，並在 Discord Embed 中加入更多符號裝飾，使版面接近截圖中的「標題 emoji、菱形欄位、縮排行」風格。

## 設計

- 新增 `src/services/discord/emoji.ts` 作為共用 Discord emoji helper。
- helper 解析 `<:name:id>` 與 `<a:name:id>` 格式，支援一般與動態自訂 emoji。
- helper 也支援將文字中的 `:emoji_name:` 依照 bot 所在伺服器 emoji cache 轉成 Discord 官方 `<:name:id>` 或 `<a:name:id>` 格式。
- helper 會修復前端預覽或複製造成的壞格式，例如 `<a✅140...>`、`<✅140...>`，轉回 Discord 可渲染的 `<a:emoji_id:id>` 或 `<:emoji_id:id>`。
- helper 解析 `<a:name:id>` / `<:name:id>` 時，若 ID 找不到但名稱找得到，會以名稱找到的可用 emoji 為準，修復舊 ID 或錯 ID。
- helper 會先從 `client.emojis.cache` 與所有 `client.guilds.cache` 的 emoji cache 尋找可用 emoji。
- 找到 guild emoji 時，Embed 文字使用 `GuildEmoji#toString()`，Button 使用 `{ id, name, animated }` 格式。
- 找不到時保留原始 Discord emoji 文字格式，讓 Discord 端仍有機會在 bot 具備權限時渲染。

## 金流版面規則

- `/rp` 初始頁、付款方式確認、購買人資訊確認、取號結果、私人訊息與 callback 成功通知皆套用指定動畫 emoji。
- 超商選擇與交易完成訊息使用店家專用 emoji：全家 `<:FamilyMart:1332695203735142440>`，7-11 `<:711:1332695189403336738>`。
- 取號成功訊息與私人訊息將「繳費位置」及「繳費代碼」放在描述區最前面，並以 Markdown 標題/粗體/code 樣式提高辨識度。
- 使用者可見欄位標籤維持「訂單編號」，但值只顯示簡化後的短編號；完整 `PAY-...` 訂單編號不可移除，需保留給 SmilePay callback、資料庫查詢與維運對帳。
- 金額語意需固定區分：
  - `訂單金額` / `訂單售價`：商品或服務原始售價，屬商家售價。
  - `SmilePay 代收手續費`：SmilePay/超商繳費流程要求的代收費用，不屬商家售價。
  - `客人應繳總額`：送給 SmilePay 取號的 `Amount`，等於訂單售價加上代收手續費。
- 統計介面不可把含手續費的 `amount` 直接標為營收；需分開顯示售價合計、代收手續費合計與客人應繳合計。
- Embed 欄位名稱以 `◇` 開頭，欄位值以 `└` 呈現下階資訊。
- 描述文字以 `◆` 呈現主要資訊，避免使用過長分隔線。
- 色彩維持既有淡紫主題 `0xb8a7ff`；付款完成狀態維持綠色成功色。

## 風險與限制

- Discord 是否顯示自訂 emoji 仍取決於 bot 是否能使用該 emoji、伺服器權限與 Discord 端渲染規則。
- 本次不修改 gateway intent，因現有 `Guilds` intent 已符合 emoji cache 需求。
- 本次不修改 SmilePay API、資料庫 schema、部署設定或 callback URL。

## 驗證

- `npm run build`：通過。
- 輕量驗證 `resolveEmojiText()`：`:ZSz26520125622:`、`:711:`、`:FamilyMart:` 可解析為 Discord 自訂 emoji 語法。
- 輕量驗證 `normalizeBrokenCustomEmojiText()`：壞掉的 `<a✅id>` 可轉回合法 Discord 自訂 emoji 語法。
- 輕量驗證錯 ID fallback：`<a:verifypurple:錯誤ID>` 可轉回 bot cache 中可用的正確 emoji ID。
