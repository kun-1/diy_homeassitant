# 给她的一块小屏幕：Mac mini 服务

这是运行在 `ritamac-mini` 上的自托管 TRMNL 风格基础设施。官方 `byos_node_lite` 负责屏幕渲染、800×480 图像生成、JSX/HTML/Liquid 模板能力和设备 API；本项目在其上增加了面向礼物场景的消息管理页、持久化 JSON 数据和 mock 打印队列。

## 明天直接打开

- 管理页：`http://192.168.31.34:3000/admin`
- 预览图：管理页中的“刷新预览”按钮，或 `http://192.168.31.34:3000/admin/screen`
- 服务目录：`/Users/rita/working/eink-trmnl-display/server`

当前默认内容是一张温柔风格的中文卡片，目标尺寸为 800×480，输出会转换成电子墨水屏需要的黑白 BMP。

## 已有能力

- JSX + CSS + HTML 的屏幕模板：`src/Template/JSX/App.tsx`、`assets/screen.css`
- 管理页：创建消息、选择当前显示消息、刷新屏幕预览
- 消息持久化：`data/state.json`
- mock 打印：`POST /api/admin/messages/:id/print`，会在 `data/print-jobs/` 生成可审阅的 `.txt` 任务文件
- 消息 API：
  - `GET /api/admin/messages`
  - `POST /api/admin/messages`
  - `POST /api/admin/messages/:id/display`
  - `POST /api/admin/messages/:id/print`
  - `GET /api/admin/print-jobs`
- 官方 BYOS 设备接口仍保留：`/api/setup`、`/api/display`、`/api/log`

## 服务启动

在 Mac mini 上：

```bash
cd /Users/rita/working/eink-trmnl-display/server
PATH=/opt/homebrew/bin:$PATH npm start
```

环境配置保存在 `.env.local`，权限为仅用户可读；不要把它提交到 Git 或发到聊天里。

## ESP32 下一步

现有 `phase1-epd7in5-v2` 已验证官方屏幕驱动和接线。下一阶段把固件从“本地静态 demo”升级为 BYOS 客户端：

1. 启动时调用 `/api/setup` 获取设备配置。
2. 按刷新周期调用 `/api/display`。
3. 下载响应中的 BMP 图像并写入 E-ink。
4. 继续保留 GPIO21 的 PWR 控制和 GPIO18 的 BUSY 读取。

当前已验证的硬件映射：`MOSI=14`、`SCLK=13`、`CS=15`、`DC=17`、`RST=16`、`BUSY=18`、`PWR=21`。

## 未来扩展边界

- 手机输入：先把手机页面/轻量 API 接到消息 API，不让 ESP32 直接承载业务数据。
- 物理按钮：ESP32 上传一个“打印请求”或调用打印任务接口；Mac mini 负责排版和任务状态。
- 热敏打印机：把 mock `.txt` 替换为 ESC/POS 字节任务，保留同一个 job 状态接口。
- 内容插件：在 `PrepareData.ts` 增加天气、纪念日、照片或日历数据源；没有 API 时继续使用 mock 数据。

## 当前明确限制

`byos_node_lite` 官方项目本身没有数据库和完整管理后台。本项目目前使用本地 JSON，是适合单台 Mac mini 和礼物原型的最小方案；日后若需要手机公网访问，再单独增加鉴权、HTTPS 和数据库，不把端口直接暴露到公网。
