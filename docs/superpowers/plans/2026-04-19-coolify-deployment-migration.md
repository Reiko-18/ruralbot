# Coolify 部署遷移紀錄（歷史文件）

## 狀態

本文件為歷史紀錄。RuralBot 現行正式部署已改為自架 Ubuntu 主機、systemd、本地 PostgreSQL 與 cron 輪詢 GitHub，不再使用 Coolify、Railway 或其他 PaaS 平台。

## 歷史摘要

先前曾評估以容器方式部署並調整健康檢查，但該路線已被替換。現行部署不依賴 Dockerfile 型部署，也不依賴平台 UI health check。

## 現行取代文件

- `docs/superpowers/specs/2026-04-19-ubuntu-systemd-postgresql-deployment-design.md`
- `docs/superpowers/plans/2026-04-19-ubuntu-systemd-postgresql-migration.md`

## 後續處理原則

- 不新增任何平台專屬設定。
- 不恢復容器部署設定，除非未來使用者明確要求 Docker 備援方案。
- 維運文件以 Ubuntu、systemd、本地 PostgreSQL 與 cron 自動部署為準。
