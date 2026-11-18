# ESP32-S3 TRMNL 物联网客户端

这是电子墨水屏的联网固件，和第一阶段的 `phase1-epd7in5-v2` 静态官方 demo 分开保存。

## Wi-Fi provisioning（最小可靠方案）

固件不包含真实家庭 Wi-Fi 凭据。启动时先尝试 NVS 中已保存的 STA 配置，连接失败（超时 20 秒）后进入 SoftAP 配置状态。

串口日志会打印一次性可观察的热点信息，例如：

```text
PROVISIONING_STATE=SOFTAP ap=Eink-Setup-a10af6e8 password=Guozi-a10af6e8
SETUP_URL=http://192.168.4.1/
```

手动连接该热点后，在浏览器打开 `http://192.168.4.1/`，填写：

- 家里的 2.4GHz Wi-Fi 名称和密码
- E-ink 渲染地址，例如 `http://192.168.31.34:3000`
- 业务 API 地址，例如 `http://192.168.31.34:3100`

保存入口会校验 SSID、密码长度和两个服务地址格式，不会在页面回显旧 Wi-Fi 密码。三项配置写入 ESP32 NVS 后自动重启，再次尝试连接；仍失败时会重新进入 SoftAP。渲染地址和业务 API 地址均可更换，不再需要为新的局域网重新编译固件。

这是本地 HTTP 配置页，不是完整 captive portal：手机不会保证自动弹出配置页，需要手动访问 `192.168.4.1`。SoftAP 密码由芯片 MAC 后缀派生，只通过串口日志显示，不是家庭 Wi-Fi 密码。

## 正常数据流

```text
ESP32 -> GET /api/display -> Mac mini
ESP32 <- image_url + refresh_rate
ESP32 -> GET /image?secret_key=... -> BMP
ESP32 -> BMP 转 1-bit buffer -> E-ink SPI 刷新
```

设备身份和 BYOS token 位于 `include/trmnl_secrets.h`，该文件只存在于 Mac mini，不提交到 Git。

## 设备心跳与 UPS 电量

ESP32 每 30 秒向 Mac mini Office API 的 `/api/devices/esp32-01/heartbeat` 上报一次。微雪 UPS Module 3S 的 INA219 通过 I2C 读取，默认使用 ESP32-S3 的 GPIO8（SDA）和 GPIO9（SCL），INA219 地址优先扫描 `0x40`–`0x43`（官方 3S 示例使用 `0x42`）。心跳中的 `powerBankPct` 会同步到后端的 UPS 设备状态；读取失败时该字段为 `null`，不会伪造电量。heartbeat 不触发 E-ink 重刷。

接线前确认 UPS 的 I2C 电平选择为 3.3V，并连接：UPS `SDA` → ESP32 GPIO8、UPS `SCL` → ESP32 GPIO9、UPS `GND` → ESP32 `GND`。UPS 的 `5V` 只用于给 ESP32/屏幕供电，不要把电池串联端或 12.6V 端接到 ESP32 GPIO。电量百分比按 3S 电池约 9.3V（空）到 12.6V（满）线性估算，是用于界面显示的近似值，不是电池管理芯片的精确 SOC。

## EM5823H 打印机 UART 测试

当前固件已初始化 UART1：`GPIO4 (TX) -> 打印机 RX`、`GPIO5 (RX) <- 打印机 TX`、`GPIO6 <- 打印机 RTS`，参数为 `115200 8N1`。向 ESP32 的 115200 调试串口发送 ASCII 字符 `p` 会打印一张最小测试页；发送 `c` 会用分段 `GS v 0` 打印一张仅 96 点高的光栅校准条（内置字体、1/2/4 点线、网格和小面积实心块），发送 `x` 会用同为 203×203 DPI 的 `ESC * 33` 打印相同图案做 A/B；发送 `n` 会用官方 PC936/24×24 内置中文字库分别打印宋体与黑体，用于判断模糊来自位图渲染还是纸张/打印头；发送 `s` 只读打印 `DLE EOT 1..4` 与 `GS r 1` 的原始状态字节。固件启动时不会自动打印。发送 `d` 只读查询打印浓度、最高速度、电流等级、打印模式、打印头电压和温度；发送 `q` 设置质量优先位图档（低峰值电流等级 9、宽电压模式 4、浓度 36、最高速度 1）并回读确认；发送 `b` 可恢复已验证基线（电流等级 6、宽电压模式 4、浓度 30、最高速度 3）。

测试前确认打印机由独立的 5–9V 电源供电，且与 ESP32 共地；不要从 GPIO 或 3.3V 给打印机供电。正式信件由 Mac mini 渲染成 384px 宽的 `MONO_1BPP_MSB_FIRST` 位图，ESP32 使用光栅指令发送，从而绕过中文编码问题。长卡片会按 48 行拆成连续的 `GS v 0` 小帧，每帧发送完等待 80ms 和 RTS 恢复，降低持续满负载导致的电压下陷与浅色、空心笔画风险；帧之间不会主动插入空白行。缺纸检测同时使用 `DLE EOT 2` bit 5 和 `GS r 1` bits 2-3；任一来源报告缺纸都停止领取任务。状态查询失败、未知、上盖打开或打印机异常时也一律不出队。`DLE EOT 3` 用于读取切刀、不可恢复错误以及打印头温度或电压异常。

位图发送前会严格校验宽度必须为 48 字节，且 Base64 解码长度必须等于 `widthBytes * height`，畸形数据不会向打印机发送任何命令。密集图像打印时允许 RTS 最长暂停 30 秒；如果光栅帧发送中途仍然断开，该任务会直接进入不可自动重试的失败状态。此时应先关闭再打开打印机，再创建新的打印任务，避免下一条指令被当作上一张图片的剩余数据而产生乱码或连续走纸。

## 编译

从仓库根目录运行以下命令，创建本地配置文件。

```bash
cd firmware
cp include/trmnl_secrets.h.example include/trmnl_secrets.h
```

在本地副本填写设备 ID、BYOS token 和显示服务地址。Wi-Fi 配置留空时，可通过设备热点完成配网。Git 已忽略本地配置文件。

配置后，在 `firmware/` 下运行 `pio run`。

## 人工验证步骤

1. 准备本地 `include/trmnl_secrets.h`，只填入设备实际需要的本地配置。
2. 执行 `pio run`，确认 PlatformIO compile 成功。
3. 使用明确的 USB 端口刷写并打开 115200 串口监视器，确认 STA、heartbeat 和显示日志；不要把密码或 token 复制到公共记录。
4. 使用错误或空的 STA 配置，确认出现 `PROVISIONING_STATE=SOFTAP`、热点名、临时 AP 密码和 `192.168.4.1` 地址。
5. 手机手动连接热点并打开配置页，提交 2.4GHz Wi-Fi；确认保存后重启并重新尝试 STA。确认不会自动弹出 captive portal 属于预期行为。
6. 在真实网络中确认显示服务使用默认 `http://192.168.31.34:3000`，heartbeat 使用业务 API `http://192.168.31.34:3100`，并确认 `/api/display` 与 E-ink 刷新逻辑未被 provisioning 阻塞路径破坏。

## 当前边界与未实现

- 未实现 captive portal DNS 劫持或手机自动弹窗。
- 未实现扫描附近 Wi-Fi、HTTPS 配置页、AP 超时自动退出或远程重置凭据。
- SoftAP/NVS 表单仍需在真正换网时做一次手机端物理验收；当前家中网络、heartbeat、`/api/display` 和 E-ink 实机数据流已经验证。
- heartbeat 路径、`/api/display` 数据流和 E-ink SPI 引脚保持不变；渲染与业务 API 地址均可通过本地配网入口修改。
