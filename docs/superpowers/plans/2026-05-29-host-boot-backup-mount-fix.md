# 主機開機卡住與備份碟掛載修正 - 2026-05-29

## 背景

使用者回報 Discord 機器人斷線後，本機一開始無法連線 `192.168.254.84`，`ping` 顯示本機閘道端回報 `Destination host unreachable`。使用者手動重開主機後，內網、SSH 與 HTTP 恢復。

## 根因

檢查前一次 boot journal 後確認，主機在 `2026-05-29 06:01` 自動開機後，`/mnt/backup` 對應的磁碟 UUID `0ADA6F6DDA6F53CB` 等待逾時：

- `Timed out waiting for device ... UUID=0ADA6F6DDA6F53CB`
- `Dependency failed for mnt-backup.mount`
- `Dependency failed for local-fs.target`
- 進入 `emergency.target`

因此主機不是單純 bot 掛掉，而是開機流程被非必要備份碟掛載卡住，導致服務沒有完整起來。

另外本次 reboot 後 `smartd` 回報 `/dev/sdc` 有：

- `49 Currently unreadable (pending) sectors`
- `49 Offline uncorrectable sectors`

`/dev/sdc1` 即 `/mnt/backup`，表示備份碟已有壞軌或不穩定風險。

## 修正

遠端主機已備份並修改：

- `/etc/fstab`
- `/etc/systemd/system/ruralbot.service`

`/mnt/backup` 從一般 `defaults` 改為：

```fstab
defaults,nofail,x-systemd.device-timeout=10s,x-systemd.mount-timeout=10s,uid=33,gid=33,umask=0007
```

效果：

- 備份碟缺席或慢啟動時不再阻塞 `local-fs.target`。
- device / mount 最多等待 10 秒。
- 避免同樣原因再次把主機送進 emergency mode。

`ruralbot.service` 也補上：

```ini
StartLimitIntervalSec=300
StartLimitBurst=10
RestartSteps=3
RestartMaxDelaySec=60
```

## 驗證

已執行一次正式 reboot 測試：

- `2026-05-29 17:48:37`：下達 `systemctl reboot`
- `2026-05-29 17:49:34`：ping / SSH / HTTP 均恢復
- `systemctl is-system-running`：`running`
- `systemctl --failed`：`0 loaded units listed`
- `ruralbot.service`：`enabled` / `active`
- `/healthz`：`{"ok":true,"discordReady":true}`
- bot journal 顯示 `Previous boot ended orderly`

## 後續建議

`/dev/sdc` 備份碟已有 SMART 壞區警告，建議安排更換或重新建立備份媒體。這次修正可避免它拖垮開機，但不能修復磁碟硬體風險。
