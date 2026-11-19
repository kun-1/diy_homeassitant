# Mac mini 常驻部署

`launchd/com.guozai.office-backend.plist` 用于在 Mac mini 上开机自启 `backend/`（端口 `3100`，负责 SQLite、渲染引擎、打印队列与后续 MCP 接入）。

部署时请按实际路径修改 plist 中的 `WorkingDirectory` 与环境变量（`HOST=0.0.0.0`、`PORT=3100`），复制到 `~/Library/LaunchAgents/` 后执行：

```bash
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.guozai.office-backend.plist
```
