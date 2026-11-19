# MCP 接入指南（Claude / Codex / Gemini）

后端在 `POST /mcp` 提供 **Streamable HTTP MCP**（无状态，Bearer Token 鉴权，默认每分钟最多 5 次打印）。

## 1. 启动

```bash
# 终端 1：后端（从 backend/.env.local 读取 MCP_TOKEN）
cd backend && npm start

# 终端 2：Cloudflare 临时隧道（每次启动域名都会变）
cloudflared tunnel --no-autoupdate --url http://127.0.0.1:3100
```

隧道日志里会出现 `https://xxxx.trycloudflare.com`，MCP 地址就是它加 `/mcp`。
临时域名**重启隧道就会变**；迁到 Mac mini 后改用 Named Tunnel + 固定域名，客户端只需改一次 URL。

> 公网只应该暴露 `/mcp`。`/debug/printer` 和 `/api/*` 目前没有鉴权，隧道会把整个 3100 端口一起暴露，
> 迁移前请先用 Cloudflare Access / WAF 规则或反向代理只放行 `/mcp`（见下方「已知风险」）。

## 2. 工具

| 工具 | 作用 |
| :--- | :--- |
| `print_daily_todo` | 打印每日清单（不传 `items` 则读数据库里未完成的待办，可按 `owner` 过滤） |
| `add_and_print_todo` | 新增待办，可选同时打一张专注工单 |
| `print_couple_note` | 打印留言小纸条 |
| `print_photo_card` | 打印图片卡片（`imageUrl` 或 `imageBase64` + 配文） |
| `get_printer_status` | 在线状态、纸张、电池电量、队列长度 |

## 3. 客户端配置（把 `<URL>` 和 `<TOKEN>` 替换掉）

**Claude Code**

```bash
claude mcp add --transport http printer <URL>/mcp --header "Authorization: Bearer <TOKEN>"
```

Claude Desktop / claude.ai 的「自定义连接器」走 OAuth，不支持固定 Bearer Token；
桌面端可改用 `npx mcp-remote <URL>/mcp --header "Authorization: Bearer <TOKEN>"` 作为 stdio 桥接。

**Codex**（`~/.codex/config.toml`）

```toml
[mcp_servers.printer]
url = "<URL>/mcp"
bearer_token_env_var = "PRINTER_MCP_TOKEN"
```

并在 shell 里 `export PRINTER_MCP_TOKEN=<TOKEN>`。

**Gemini CLI**（`~/.gemini/settings.json`）

```json
{
  "mcpServers": {
    "printer": {
      "httpUrl": "<URL>/mcp",
      "headers": { "Authorization": "Bearer <TOKEN>" }
    }
  }
}
```

## 4. 已知风险

- `/api/*`、`/debug/printer` 无鉴权；隧道不做路径过滤。
- `print_photo_card` 会由服务器下载 `imageUrl`；已拒绝 localhost / 内网地址，但未处理 DNS 解析到内网的情况。
- Token 只存在于 `backend/.env.local`（已被 `.gitignore` 忽略）。泄露后改掉它并重启后端即可。
