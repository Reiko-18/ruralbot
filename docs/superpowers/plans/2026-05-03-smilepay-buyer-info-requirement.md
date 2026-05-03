# 2026-05-03 SmilePay 買家資料必填調整

## 背景

SmilePay 官方 API 文件範例在自行撰寫收款頁面與背景取號流程中帶入 `Pur_name`、`Tel_number`、`Mobile_number`、`Email`、`Roturl`、`Pay_zg` 與 `Verify_key` 等參數。依目前營運要求，開立超商繳費代碼前必須取得買家真實姓名、電話與 Gmail。

## 調整內容

- 新增 `src/services/payment/buyer_info.ts`，集中正規化與驗證買家資料。
- Dashboard 建立付款視窗改為必填買家真實姓名、Gmail 與電話，送出前先做前端驗證，後端仍會再次驗證。
- `/rp` 互動式超商繳費流程改為在按下「確認付款」後跳出 Discord modal，買家填完資料才會向 SmilePay 背景取號。
- `/payment create` slash command 新增必填 `email` 與 `phone`，並把 `payer` 改為必填。
- SmilePay 出站參數會帶入 `Pur_name`、`Email`、`Tel_number`，並同步把電話帶到 `Mobile_number`。

## 驗證規則

- 姓名：必填，長度 2 到 50 字。
- Gmail：必填，必須為 `@gmail.com`。
- 電話：必填，去除非數字後需為 8 到 15 碼。

真實姓名無法由系統自動驗證身分真偽，因此目前採必填與合理格式檢查，實際真實性仍由營運端審核。

## 金流設定提醒

- `SMILEPAY_DCVC`：商家代號。
- `SMILEPAY_RVG2C`：商家參數碼。
- `SMILEPAY_VERIFY_KEY`：背景取號驗證用 key。
- `SMILEPAY_ROTURL`：SmilePay callback URL，正式環境目前建議與反向代理一致，例如 `http://211.22.158.125/api/payment/callback`。
- `SMILEPAY_ENV`：正式環境使用 `production`，測試階段可使用 `test`，但背景取號 API 依官方文件未提供測試連結。

若 callback URL 不含 port，Ubuntu 主機需確保 80 port 反向代理到 dashboard/Express 實際監聽 port，否則 SmilePay 回傳付款結果時會送不到。

## 驗證結果

- `npm run build`：通過。
- 建置期間 npm audit 回報既有 3 個弱點：1 moderate、2 high。本次未調整依賴版本。
