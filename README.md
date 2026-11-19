# Printer Todo（无线电池热敏打印机 + AI MCP）

基于 **ESP32-S3（带电池供电 + INA219 电量监控）** + **优库 EM5823H（58mm / 384px 热敏打印机）** + **Mac 后端（Fastify + SQLite + Puppeteer + `canvas-dither`）** 的无线热敏打印项目。

打印机内置电池，可随意摆放在家里任何有 Wi‑Fi 的位置；Mac 端负责全部排版、混合光栅化与队列调度，ESP32-S3 仅作为纯无线出纸管道。

---

## 目录结构

```text
.
├── backend/          # Mac 后端（3100 端口）：Todo、打印队列、HTML 渲染、浏览器零废纸调试台
├── firmware/         # ESP32-S3 纯打印固件（已移除 E-ink，保留 Wi-Fi、GS v 0 分片、INA219 电池监控）
├── docs/             # 开发者 Q&A 与架构记录
└── ops/              # Mac mini launchd 常驻配置
```

---

## 核心技术方案

* **全光栅化 + 混合光栅化（Hybrid Rasterization）**：
  * 全部内容在 Mac 端用 Chrome（`puppeteer-core`）按 `384px, deviceScaleFactor: 1` 渲染；
  * 内置两套开源中文字体：**思源黑体 Bold/Medium** 与 **Fusion Pixel 12px 像素等宽体**；
  * 使用开源库 **`canvas-dither`** 实现 `threshold` / `atkinson` / `floyd-steinberg` / `bayer` 二值化；
  * 图文混排（拍立得 / 带图留言）时，图片区独立做自动对比度拉伸 + Gamma + Atkinson 抖动，文字与边框统一走锐利硬阈值。
* **底部防撕烂留白**：所有模板底部统一附带 `✂ - - - - TEAR HERE - - - -` 与 `52px` 纯白留白，适配无自动切刀的手动锯齿撕纸。
* **无线电池节点**：ESP32-S3 每 30 秒上报自身状态、EM5823H 纸张/开盖状态及 INA219 电池电量，每 5 秒轮询 `/api/print/jobs/next` 并以 `GS v 0`（48 行/片 + `RTS` 流控）稳定出纸。

---

## 四种核心打印格式

1. **每日 Todo 清单 (`todo`)**：大号手写复选框、2px 删除线、块状进度条，支持极客小票风 / 手账便签风。
2. **单条专注工单 (`focus`)**：超大标题 + 截止时间/时长 + 子步骤 + 底部手写速记虚线区，撕下来贴显示器边。
3. **对象留言纸条 (`note`)**：大字号传话卡片，支持附带本地图片（混合光栅化）。
4. **拍立得 / 图片卡片 (`photo`)**：上传任意 JPG/PNG/WebP 照片，独立抖动 + 底部锐利配文 + 拍立得相框。
*(另附 `calibration` 5cm 硬件校准条，用于真机一次性校准。)*

---

## 项目实施计划

- [x] **阶段一：仓库清理、后端重构与 4 种格式浏览器零废纸调试台**
  - 清理 E-ink、PWA、旧 Swift 渲染脚本等无关代码
  - 重构 `backend/`（`todos` / `print_jobs` / `devices`）并接入 `canvas-dither` + 双字体 + 混合光栅化
  - 调试台 `/debug/printer` 支持 1x/2x 预览、行黑度检测及一键「发送到打印机」
- [x] **阶段二：4 种格式样式精细打磨 + ESP32-S3 真机出纸测试**
  - 默认样式已定稿：纯 Fusion Pixel · 1.35x（24px）· 硬阈值 120
  - 无线电池供电真机出纸已跑通
- [x] **阶段三：开发远程 Streamable HTTP MCP 服务**（已实现并实测通过，见 [docs/mcp-setup.md](docs/mcp-setup.md)）
  - 工具：`print_daily_todo`、`add_and_print_todo`、`print_couple_note`、`print_photo_card`、`get_printer_status`
  - Bearer Token + OAuth 2.0（PKCE）双模式鉴权 + 每分钟打印限流；Cloudflare 隧道对外提供 HTTPS
- [ ] **阶段四：迁移至 Mac mini + Tailscale 长期常驻**
  - 通过 `ops/launchd/` 在 Mac mini 开机自启 `backend` + MCP
  - ESP32 指向 Mac mini 局域网 IP，通过 Tailscale 分享给对象使用

---

## 快速启动（MacBook 本地调试）

```bash
cd backend
npm install
npm start
```

打开浏览器访问调试台：**`http://127.0.0.1:3100/debug/printer`**
（更多技术原理见 [docs/printer-qa.md](file:///Users/zhuanzmima0000/tinkering/printer_todo/docs/printer-qa.md)）
