# 独立 iOS 视觉探索包

这是一组只用于产品讨论的高保真 iPhone UI 概念图，基于项目中的 `PRODUCT.md`、`DESIGN.md`、`docs/ios-product-skeleton.md` 以及 Impeccable 的 iOS / craft-floor 约束生成。

## 画面

1. `01-home-overview-healthy.png` — 家庭总览：健康状态
2. `02-home-overview-alert.png` — 家庭总览：设备异常待确认
3. `03-mailbox.png` — 信箱：混合事件 + 分类筛选
4. `04-devices.png` — 设备中心：Mac mini / ESP32 / 打印机 / E-ink / UPS 层级
5. `05-write-print-preview.png` — 写信 / 纸张预览 / 确认打印

## 阅读提醒

- 这些 PNG 是视觉方向探索，不是可运行的 iOS 实现，也没有接入当前 PWA、后端或固件。
- 画面中的时间、队列、revision、未读数和设备状态均为示意内容，用于展示信息层级；不能当作后端协议或真实阈值。
- 最终实现应继续使用 SwiftUI 原生 `TabView`、`NavigationStack`、`Sheet`、Dynamic Type、语义颜色、SF Symbols、系统返回手势和至少 44pt 触控目标。
- ImageGen 生成的中文文案需要在工程实现时由真实产品文案和系统数据重新绑定。
