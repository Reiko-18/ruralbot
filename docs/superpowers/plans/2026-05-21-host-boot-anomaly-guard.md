# 主機異常關機防護與稽核 - 2026-05-21

## 背景

5 月 20 日主機在早上 06:00 由 RTC 正常喚醒，但於 08:30:58 出現非預期中止，journal 未留下完整的正常關機流程。這代表問題不是 Discord gateway reconnect，而是主機層級的突然斷電、硬重啟或等效的非正常中止。

## 目標

1. 降低可避免的人為誤觸風險，先把電源鍵短按改成忽略。
2. 在 bot 啟動時自動檢查前一次開機是否為正常結束，若不是就以既有 logger 發出警示。
3. 保留原有每日 02:00 關機、06:00 RTC 喚醒流程不變。

## 實作

- 新增 `src/services/host/boot_audit.ts`，在 `ClientReady` 後檢查前一個 boot 的 journal。
- 若 journal 找不到 `daily-maintenance-poweroff.service`、`poweroff.target`、`reboot.target` 等正常結束標記，就記錄 `Detected unexpected previous host shutdown`。
- 新增 `ops/systemd-logind-powerkey-ignore.conf.example`，作為 Ubuntu 主機 `logind.conf.d` drop-in 範本。

## 驗證

- `npm run build`：待執行。
- 主機端 `systemd-logind` drop-in：待套用並驗證。

## 風險

- 外部斷電、UPS 故障、硬體電源中斷無法被單靠軟體完全避免。
- 本次處理能降低誤觸與提升可觀測性，但不能保證物理層電源事件永不再發生。
