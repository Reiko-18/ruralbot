# Coolify 部署修整設計（歷史文件）

## 狀態

本文件為歷史紀錄。RuralBot 現行正式部署已改為自架 Ubuntu 主機、systemd、本地 PostgreSQL 與 cron 輪詢 GitHub，不再使用 Coolify、Railway 或其他 PaaS 平台。

## 歷史背景

此文件曾用於記錄容器部署與健康檢查修整，包含 dashboard 提前啟動、`/healthz` 端點與容器健康檢查需求。

## 現行取代文件

- `docs/superpowers/specs/2026-04-19-ubuntu-systemd-postgresql-deployment-design.md`
- `docs/superpowers/plans/2026-04-19-ubuntu-systemd-postgresql-migration.md`

## 保留原因

保留本文件是為了追蹤平台遷移脈絡與先前健康檢查問題，不應再作為現行部署指南。
