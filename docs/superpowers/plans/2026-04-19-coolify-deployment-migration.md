# Coolify 部署遷移紀錄

## 背景

本次目標為將 RuralBot 從既有外部部署站點遷移至自有主機上的 Coolify，並修正先前部署後健康檢查失敗導致的回滾問題。

## 問題摘要

- Coolify 部署後容器曾成功啟動並登入 Discord。
- 部署最終失敗原因不是 Discord token，也不是 Supabase 連線失敗。
- 根本原因是 Coolify UI health check 在容器內執行時找不到 `curl`/`wget`，導致 container 被標記為 `unhealthy`。

## 本次調整

- 在 `Dockerfile` 安裝 `curl`。
- 在 `src/index.ts` 內將 dashboard 提前啟動。
- 在 `src/services/dashboard/server.ts` 新增 `/healthz`。
- 在 bot 啟動流程中加入 Discord shard disconnect / reconnect / resume 日誌。
- 在 repo 新增與 Coolify 相關的設計與遷移文件。
- 將 `*.log` 納入 `.gitignore` 與 `.dockerignore`，避免污染 build context。
- 重寫 `AGENTS.md`，正式整合繁中、三重審查、文件同步、commit/push 等規則。

## 驗證重點

- `npm run build`
- 本地啟動後確認 `/healthz` 可回應
- Coolify 使用 `Dockerfile` build pack
- Coolify health check 指向 `/healthz`

## 後續待辦

- 將 `RAILWAY_PUBLIC_URL` 收斂為通用平台變數。
- 若要正式切換自訂網域，需補齊 DNS。
- 視需要將 production 啟動改為 build 後產物。
