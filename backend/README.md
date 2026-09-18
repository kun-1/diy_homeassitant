# Office Companion backend

Node.js + TypeScript 后端，默认 `127.0.0.1:3100`。Calendar 默认使用 Mock Provider，但 repository 真实写入 SQLite；ESP32 已使用这里的设备心跳、E-ink state 和打印队列 API。当前不连接 Google Calendar、账号、密码、API Key 或公网。

## 天气与设备边界

/api/today.weather 使用 Open-Meteo 的上海浦东近似坐标（31.22, 121.54），服务端缓存 10 分钟；上游不可用时返回最近缓存或 null。设备登记包含 Mac mini、ESP32-S3、E-ink、EM5823H 和 Waveshare UPS 3S；在硬件未连接或未上报心跳前，它们保持 `offline`。

设备状态的语义是：`macmini`、`esp32`、`printer`、`powerBank` 使用直接心跳，心跳在 90 秒内为 `online`，超时为 `offline`；`eink` 没有独立心跳，始终使用 `statusSource: "derived"`，其状态和 `lastSeenAt` 来自 ESP32。`statusReason` 会明确标记 `heartbeat_missing`、`heartbeat_expired`、`direct_heartbeat` 或 `derived_from_esp32`。打印机在没有新鲜心跳时是不可用/disabled 语义：`status=offline` 且 `paperStatus`、`coverOpen`、`printerError` 为 `null`；在线但设备没有报告某字段时，该字段为 `unknown`（纸张）或 `null`（布尔状态）。电量是设备实际上报值；没有上报时为 `null`，API 不生成默认百分比。

EM5823H 的传感器只能判断打印头纸路是否被纸覆盖，不能可靠判断纸卷是否已经耗尽；最后一段纸尾仍压着传感器时，硬件可能继续报告 `ok`。`PATCH /api/devices/printer-01/paper` 接受 `{ "paperStatus": "out" }` 或 `near_end` 建立人工锁定，后续 ESP32 心跳不会覆盖它，打印任务保持 queued；换好新纸后发送 `{ "paperStatus": null }` 解除锁定并重新信任硬件传感器。接口不允许人工强制 `ok`，避免绕过真实缺纸告警。

## 运行

```bash
cp .env.example .env
npm install
npm run db:init && npm run seed
npm start
```

验证：`curl -i http://127.0.0.1:3100/api/health`。测试：`npm test`、`npm run typecheck`、`npm run format:check`、`npm run lint`。

## E-ink contract

`GET /api/eink/state` 返回稳定 JSON 和 `ETag: "eink-{revision}"`；带相同 `If-None-Match` 返回 `304`，ESP32 不应重刷。新信件会同时增加 `unreadLetterCount` 和 revision，避免 ESP32 因 304 错过通知；打印完成（Mock 专用 `POST /api/print/jobs/:id/complete`）清除对应 unread 并增加 revision。设备 heartbeat 只有在线状态或电量真正变化时才增加 revision，普通心跳不会触发 E-ink 刷屏；TTL 过期导致的在线→离线变化也会增加 revision。E-ink 心跳请求返回 `409 EINK_HEARTBEAT_NOT_SUPPORTED`。`printing/printed` 只存在 PrintJob，不进入 E-ink state。

## Print queue and bitmap contract

PrintJob 只允许 `queued -> printing -> completed` 或 `queued -> printing -> queued`（可重试故障）-> `failed`。领取使用 SQLite 事务和条件更新，同一个 queued job 只能被一个领取请求推进到 `printing`；完成/失败必须来自 `printing`，否则返回 `409 PRINT_JOB_INVALID_TRANSITION`。每个任务最多 3 次尝试；普通故障前两次回到 `queued`，第三次进入终态 `failed`。若 ESP32 已开始发送 `GS v 0` 位图后链路中断，会以 `retryable:false` 直接终止任务，避免下一条命令被当成上一张图片的数据而产生乱码或连续走纸。终态任务不能再次 retry，返回 `409 PRINT_JOB_RETRY_EXHAUSTED`。

`GET /api/print/jobs/next` 返回 `{ job, letter, printer }`。`printer` 是供 ESP32 直接发送给 EM5823H 的 384px 黑白位图合同：`format=MONO_1BPP_MSB_FIRST`、`widthPx=384`、`bytesPerRow=48`，`bitmapB64` 解码后必须等于 `heightPx * 48` 字节。Swift 渲染器支持 4 种信纸和普通文字、照片、兑换券、Ghost 印章、关心处方笺 5 种内容；这些选择保存在 `letters.metadata_json`。文字 GBK 字段只作旧版降级路径，特殊字符无法转换时返回空字段，不会阻断主位图任务。`src/printer-protocol.ts` 的 `MockSerialTransport` 仅用于单元测试；真实串口发送由 ESP32 固件执行。

`metadata.fontProfile` 提供热敏字体实验边界：`system` 为原有苹方，`thermal-sans` 使用随服务打包的思源黑体 CN Medium/Bold，`pixel` 使用 Fusion Pixel 12px 简体中文并只建议按 24/36px 整数倍输出，`comparison` 生成一张同文实物对照条。默认仍为 `system`，在实物验收前不会静默改变现有信件外观。字体文件及 OFL 许可位于 `assets/fonts/`。

## API examples

```bash
curl http://127.0.0.1:3100/api/today
curl -X POST http://127.0.0.1:3100/api/todos -H 'content-type: application/json' -d '{"title":"买牛奶"}'
curl -X POST http://127.0.0.1:3100/api/letters -H 'content-type: application/json' -d '{"title":"你好","body":"今天也要开心","signature":"我","paper":"border","metadata":{"content":"coupon","coupon":{"name":"晚餐券","code":"LOVE-01","expiry":"2026-12-31"}}}'
curl -i http://127.0.0.1:3100/api/eink/state
curl -i -H 'If-None-Match: "eink-1"' http://127.0.0.1:3100/api/eink/state
curl -X POST http://127.0.0.1:3100/api/devices/esp32-01/heartbeat -H 'content-type: application/json' -d '{"batteryPct":null}'
curl -X POST http://127.0.0.1:3100/api/devices/powerbank-01/heartbeat -H 'content-type: application/json' -d '{"batteryPct":42}'
```

完整 JSON 字段与路由以 `src/types.ts`、`src/schemas.ts`、`src/app.ts` 为契约源；`GET /api/print/jobs` 为便于 PWA 调试补充的列表接口，完成/失败/重试接口仅为 Mock 边界。

## Task 7 · Calendar Provider boundary

`src/providers/calendar.ts` 定义可替换的 `CalendarProvider` 契约，覆盖 `list/create/update/delete`。默认工厂 `createCalendarProvider(db)` 返回 `MockCalendarProvider`，它使用现有 SQLite `calendar_events` 表；缺失事件的 update/delete 分别稳定返回 `null/false`。

`GoogleCalendarProvider` 仅作为预留边界：当前状态是 `enabled: false, mode: "disabled"`，没有 OAuth、token 或 API key，也不会发出网络请求。调用四个方法都会抛出 `CalendarProviderError`，错误码为 `CALENDAR_PROVIDER_DISABLED`。使用 `CALENDAR_PROVIDER=mock` 选择当前实现；旧版 `PROVIDER_MODE` 仍兼容。将来只需在 provider 选择处接入真正的 Google 实现，不改变 API/PWA 侧的 CalendarProvider 契约。`src/schemas.ts` 的 `calendarProviderSelection` 目前只允许 `mock/google` 选择，不接受或保存任何凭据。
