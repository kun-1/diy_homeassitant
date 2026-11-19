export const DEBUG_PRINTER_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>384px 热敏小票零废纸调试台</title>
<style>
  :root {
    --bg: #0f172a;
    --panel: #1e293b;
    --border: #334155;
    --text: #f1f5f9;
    --muted: #94a3b8;
    --accent: #38bdf8;
    --ok: #4ade80;
    --warn: #fbbf24;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif;
    background: var(--bg);
    color: var(--text);
    display: grid;
    grid-template-columns: 400px 1fr;
    min-height: 100vh;
  }
  .sidebar {
    background: var(--panel);
    border-right: 1px solid var(--border);
    padding: 18px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    overflow-y: auto;
    max-height: 100vh;
  }
  h1 { font-size: 17px; margin: 0; }
  .subtitle { font-size: 12px; color: var(--muted); margin-top: 3px; }
  label { display: block; font-size: 12px; color: var(--muted); margin-bottom: 4px; }
  select, textarea, input[type="range"], input[type="file"] {
    width: 100%;
    background: #0f172a;
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 7px 9px;
    font-size: 13px;
  }
  textarea {
    min-height: 165px;
    font-family: "SF Mono", Menlo, monospace;
    font-size: 12px;
    line-height: 1.45;
    resize: vertical;
  }
  .row-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .range-head { display: flex; justify-content: space-between; font-size: 12px; color: var(--muted); }
  .section-box {
    background: #0f172a;
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 9px;
  }
  .section-title { font-size: 12px; font-weight: 700; color: var(--accent); }
  .check-line { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--text); cursor: pointer; }
  .check-line input { width: auto; }
  .btn {
    background: var(--accent);
    color: #082f49;
    border: none;
    border-radius: 8px;
    padding: 10px 14px;
    font-weight: 700;
    font-size: 14px;
    cursor: pointer;
  }
  .btn:disabled { opacity: 0.5; cursor: wait; }
  .btn-ghost {
    background: transparent;
    color: var(--muted);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 5px 8px;
    font-size: 12px;
    cursor: pointer;
  }
  .stats {
    font-size: 12px;
    color: var(--muted);
    background: #0f172a;
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 10px;
    line-height: 1.65;
  }
  .badge-ok { color: var(--ok); font-weight: 700; }
  .badge-warn { color: var(--warn); font-weight: 700; }
  .main {
    padding: 24px;
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 10px;
  }
  .zoom-group { display: flex; gap: 8px; }
  .zoom-btn {
    background: var(--panel);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 6px 12px;
    font-size: 12px;
    cursor: pointer;
  }
  .zoom-btn.active { border-color: var(--accent); color: var(--accent); }
  .preview-grid {
    display: flex;
    gap: 28px;
    align-items: flex-start;
    flex-wrap: wrap;
  }
  .gallery-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: 20px;
    align-items: start;
  }
  .gallery-card {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .gallery-card .paper-frame {
    width: 100%;
    text-align: center;
    padding: 4px;
  }
  .gallery-card .paper-frame img {
    width: 100%;
    max-width: 384px;
    margin: 0 auto;
  }
  .gallery-meta {
    font-size: 12px;
    color: var(--muted);
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .gallery-actions {
    display: flex;
    gap: 8px;
  }
  .gallery-actions button {
    flex: 1;
    padding: 7px 10px;
    font-size: 12px;
  }
  .card {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 14px;
  }
  .card-title {
    font-size: 13px;
    font-weight: 700;
    margin-bottom: 10px;
    color: var(--muted);
  }
  .paper-frame {
    background: #ffffff;
    display: inline-block;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.45);
  }
  .paper-frame img {
    display: block;
    width: 384px;
    height: auto;
    image-rendering: pixelated;
  }
  .zoom-2x .paper-frame img {
    width: 768px;
  }
  .error-box {
    color: #fecaca;
    background: #7f1d1d;
    border-radius: 8px;
    padding: 8px 10px;
    font-size: 12px;
    display: none;
  }
</style>
</head>
<body>
  <aside class="sidebar">
    <div>
      <h1>🖨️ 384px 热敏打印调试台 v2</h1>
      <div class="subtitle">思源黑体 / Fusion Pixel · 混合光栅化 · 行黑度检测</div>
    </div>

    <div>
      <label>打印格式（4 大核心场景 + 校准条）</label>
      <select id="template">
        <option value="todo">1. 每日 Todo 清单</option>
        <option value="focus">2. 单条专注工单 (Focus Ticket)</option>
        <option value="note">3. 对象留言纸条</option>
        <option value="photo">4. 拍立得 / 图片卡片</option>
        <option value="calibration">🔧 5cm 硬件校准条</option>
      </select>
    </div>

    <div class="row-2">
      <div>
        <label>排版风格</label>
        <select id="style">
          <option value="receipt">极客小票风</option>
          <option value="journal">手账便签风</option>
        </select>
      </div>
      <div>
        <label>字体方案（支持英中混合）</label>
        <select id="fontProfile">
          <option value="jetbrains-pixel">JetBrainsMono NF + Fusion Pixel（推荐混合）</option>
          <option value="jetbrains-sourcehan">JetBrainsMono NF + 思源黑体</option>
          <option value="hack-pixel">Hack NF + Fusion Pixel</option>
          <option value="pixel">纯 Fusion Pixel（像素体）</option>
          <option value="source-han">纯思源黑体 Bold</option>
          <option value="songti">宋体 Songti（复古报纸感）</option>
          <option value="heiti">冬青黑体 Hiragino</option>
          <option value="mono">SF Mono 等宽极客体</option>
        </select>
      </div>
    </div>

    <div>
      <div class="range-head"><span>字体大小缩放（已定稿：Fusion Pixel 1.35x = 24px）</span><span id="fontScaleVal">1.35x</span></div>
      <input id="fontScale" type="range" min="0.75" max="1.80" step="0.05" value="1.35" />
    </div>

    <div>
      <label>自定义混合字体（逗号分隔，如 JetBrainsMono Nerd Font, Songti SC）</label>
      <input id="customFont" type="text" placeholder="留空则使用上方预设字体" style="width:100%;background:#0f172a;color:var(--text);border:1px solid var(--border);border-radius:8px;padding:7px 9px;font-size:13px;" />
    </div>

    <div class="section-box" id="photoSection" style="display:none">
      <div class="section-title">🖼️ 图片区独立预处理（混合光栅化）</div>
      <label class="check-line">
        <input type="checkbox" id="hybridToggle" checked />
        <span>开启混合光栅化（图走抖动 + 字走锐利硬阈值）</span>
      </label>
      <div>
        <label>上传本地图片（JPG / PNG / WebP，留空用内置样图）</label>
        <input type="file" id="photoFile" accept="image/*" />
        <button type="button" class="btn-ghost" id="clearPhoto" style="margin-top:5px">清除已上传图片</button>
      </div>
      <div class="row-2">
        <div>
          <label>图片抖动算法</label>
          <select id="photoAlgo">
            <option value="atkinson">Atkinson（推荐）</option>
            <option value="floyd-steinberg">Floyd-Steinberg</option>
            <option value="bayer">Bayer 有序网点</option>
            <option value="threshold">硬阈值</option>
          </select>
        </div>
        <div style="display:flex;align-items:flex-end">
          <label class="check-line" style="margin-bottom:6px">
            <input type="checkbox" id="contrastStretch" checked />
            <span>自动对比度拉伸</span>
          </label>
        </div>
      </div>
      <div>
        <div class="range-head"><span>图片 Gamma 提亮</span><span id="photoGammaVal">1.8</span></div>
        <input id="photoGamma" type="range" min="0.8" max="2.6" step="0.1" value="1.8" />
      </div>
      <div>
        <div class="range-head"><span>图片亮度微调</span><span id="photoBrightVal">0</span></div>
        <input id="photoBright" type="range" min="-50" max="50" step="2" value="0" />
      </div>
    </div>

    <details class="section-box">
      <summary class="section-title" style="cursor:pointer;list-style:none">⚙️ 高级二值化参数（已设最佳默认，点此展开）</summary>
      <div style="margin-top:6px">
        <select id="algorithm">
          <option value="threshold">硬阈值（推荐纯文字 & 混合模式）</option>
          <option value="atkinson">全图 Atkinson 抖动</option>
          <option value="floyd-steinberg">全图 Floyd-Steinberg 抖动</option>
          <option value="bayer">全图 Bayer 有序网点</option>
        </select>
      </div>
      <div>
        <div class="range-head"><span>Gamma</span><span id="gammaVal">1.1</span></div>
        <input id="gamma" type="range" min="0.8" max="2.6" step="0.1" value="1.1" />
      </div>
      <div>
        <div class="range-head"><span>黑白判定阈值</span><span id="thresholdVal">120</span></div>
        <input id="threshold" type="range" min="60" max="220" step="2" value="120" />
      </div>
    </details>

    <div>
      <label>模板测试数据 (JSON)</label>
      <textarea id="jsonData"></textarea>
    </div>

    <div class="row-2">
      <button id="renderBtn" class="btn">刷新预览</button>
      <button id="printBtn" class="btn" style="background:#4ade80;color:#052e16">🖨️ 发送到打印机</button>
    </div>
    <div id="printMsg" class="stats" style="display:none;color:#bbf7d0;border-color:#166534"></div>
    <div id="errorBox" class="error-box"></div>
    <div id="stats" class="stats">等待渲染...</div>
    <div id="deviceStats" class="stats">正在查询硬件状态...</div>
  </aside>

  <main class="main" id="mainArea">
    <div class="toolbar">
      <div class="zoom-group">
        <button class="zoom-btn active" id="tabGallery">🖼️ 四种格式总览（1-bit 实拍）</button>
        <button class="zoom-btn" id="tabSingle">🎛️ 单张精调对比</button>
      </div>
      <div class="zoom-group" id="zoomControls" style="display:none">
        <button class="zoom-btn active" data-zoom="1">1x 真实像素 (384px)</button>
        <button class="zoom-btn" data-zoom="2">2x 放大检查像素</button>
      </div>
    </div>

    <div id="galleryView" class="gallery-grid">
      <div class="stats">正在渲染 4 种核心格式 1-bit 预览图...</div>
    </div>

    <div id="singleView" class="preview-grid" style="display:none">
      <div class="card">
        <div class="card-title">① HTML / Chrome 渲染原图</div>
        <div class="paper-frame"><img id="originalImg" alt="original" /></div>
      </div>
      <div class="card">
        <div class="card-title">② 最终 1-bit 点阵 (实际烧录效果)</div>
        <div class="paper-frame"><img id="ditheredImg" alt="dithered" /></div>
      </div>
    </div>
  </main>

<script>
const PRESETS = {
  todo: {
    date: "2026-11-19 周四",
    weather: "晴 18°C",
    owner: "今日待办",
    footerNote: "先做最难的一件",
    items: [
      { title: "完成 384px 浏览器调试台与混合光栅化", completed: true, priority: "normal" },
      { title: "确认 EM5823H 自检页波特率与独立供电", completed: false, priority: "high" },
      { title: "买一卷 58mm 无双酚 A 热敏纸", completed: false, tag: "采购" },
      { title: "晚上一起吃火锅", completed: false, priority: "normal" }
    ]
  },
  focus: {
    title: "跑通 ESP32-S3 屏蔽 E-ink 后的第一张真机测试小票",
    deadline: "今天 21:00 前",
    tag: "HARDWARE",
    priority: "high",
    estimatedMinutes: 30,
    subtasks: [
      "按打印机按键打出硬件自检页确认波特率",
      "确认 9V/2A 独立电源共地接线",
      "用 MacBook 下发 5cm 校准条"
    ],
    noteLines: 3
  },
  note: {
    to: "小宝",
    from: "Kun",
    timestamp: "2026-11-19 14:20",
    title: "记得喝水",
    body: "下午开会别忘了带保温杯，晚上我早点回去做饭，想吃什么直接跟 AI 说就行。"
  },
  photo: {
    caption: "今天的晚霞很好看，顺手打出来贴显示器旁边。",
    date: "2026.11.19",
    location: "HOME",
    tag: "POLAROID #01"
  },
  calibration: {}
};

const el = (id) => document.getElementById(id);
const templateEl = el("template");
const styleEl = el("style");
const fontEl = el("fontProfile");
const customFontEl = el("customFont");
const fontScaleEl = el("fontScale");
const getActiveFont = () => (customFontEl.value.trim() || fontEl.value);
const getFontScale = () => Number(fontScaleEl.value || 1.35);
fontEl.value = "pixel";
const algorithmEl = el("algorithm");
const gammaEl = el("gamma");
const thresholdEl = el("threshold");
const photoSection = el("photoSection");
const hybridEl = el("hybridToggle");
const photoFileEl = el("photoFile");
const photoAlgoEl = el("photoAlgo");
const contrastStretchEl = el("contrastStretch");
const photoGammaEl = el("photoGamma");
const photoBrightEl = el("photoBright");
const jsonEl = el("jsonData");
const renderBtn = el("renderBtn");
const errorBox = el("errorBox");
const statsEl = el("stats");

let uploadedImageDataUrl = "";

function updatePhotoSectionVisibility() {
  const show = templateEl.value === "photo" || templateEl.value === "note";
  photoSection.style.display = show ? "flex" : "none";
}

function loadPreset() {
  jsonEl.value = JSON.stringify(PRESETS[templateEl.value], null, 2);
  updatePhotoSectionVisibility();
  // Auto-select best algorithm per format
  if (templateEl.value === "calibration") {
    algorithmEl.value = "atkinson";
    gammaEl.value = "1.6";
    thresholdEl.value = "128";
  } else {
    algorithmEl.value = "threshold";
    gammaEl.value = "1.1";
    thresholdEl.value = "120";
  }
  el("gammaVal").textContent = gammaEl.value;
  el("thresholdVal").textContent = thresholdEl.value;
}

photoFileEl.addEventListener("change", () => {
  const file = photoFileEl.files && photoFileEl.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    uploadedImageDataUrl = String(reader.result || "");
    renderPreview();
  };
  reader.readAsDataURL(file);
});

el("clearPhoto").addEventListener("click", () => {
  uploadedImageDataUrl = "";
  photoFileEl.value = "";
  renderPreview();
});

async function renderPreview() {
  errorBox.style.display = "none";
  renderBtn.disabled = true;
  let parsed = {};
  try {
    parsed = jsonEl.value.trim() ? JSON.parse(jsonEl.value) : {};
  } catch (err) {
    errorBox.textContent = "JSON 格式有误: " + err.message;
    errorBox.style.display = "block";
    renderBtn.disabled = false;
    return;
  }

  if (uploadedImageDataUrl && (templateEl.value === "photo" || templateEl.value === "note")) {
    parsed.imageDataUrl = uploadedImageDataUrl;
  }

  try {
    const res = await fetch("/api/printer/preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        template: templateEl.value,
        style: styleEl.value,
        fontProfile: getActiveFont(),
        fontScale: getFontScale(),
        algorithm: algorithmEl.value,
        gamma: Number(gammaEl.value),
        threshold: Number(thresholdEl.value),
        hybrid: hybridEl.checked,
        photoOptions: {
          algorithm: photoAlgoEl.value,
          gamma: Number(photoGammaEl.value),
          contrastStretch: contrastStretchEl.checked,
          brightness: Number(photoBrightEl.value)
        },
        data: parsed
      })
    });
    const out = await res.json();
    if (!res.ok) throw new Error(out.error || "渲染失败");
    el("originalImg").src = out.originalPngDataUrl;
    el("ditheredImg").src = out.ditheredPngDataUrl;

    const s = out.stats || {};
    const heatBadge =
      s.hotRowCount > 0
        ? '<span class="badge-warn">⚠ ' + s.hotRowCount + ' 行黑度 > 65%（注意防晕染）</span>'
        : '<span class="badge-ok">✓ 行黑度健康（不易糊/不拉低电压）</span>';

    statsEl.innerHTML =
      "尺寸: <b>" + out.widthPx + " × " + out.heightPx + " px</b>（约 " + (out.heightPx / 8).toFixed(1) + " mm）<br>" +
      "点阵: <b>" + (out.byteLength / 1024).toFixed(2) + " KB</b> · 分片: <b>" + (s.estimatedBands || 1) + " 块</b> · 耗时 " + out.renderMs + " ms<br>" +
      "平均黑度: <b>" + s.avgBlackPct + "%</b> · 峰值行黑度: <b>" + s.maxRowBlackPct + "%</b><br>" +
      heatBadge;
  } catch (err) {
    errorBox.textContent = err.message;
    errorBox.style.display = "block";
  } finally {
    renderBtn.disabled = false;
  }
}

let activeTab = "gallery";
const rerenderActive = () => {
  renderPreview();
  if (activeTab === "gallery") renderGallery();
};

templateEl.addEventListener("change", () => { loadPreset(); renderPreview(); });
styleEl.addEventListener("change", rerenderActive);
fontEl.addEventListener("change", rerenderActive);
customFontEl.addEventListener("change", rerenderActive);
fontScaleEl.addEventListener("input", () => { el("fontScaleVal").textContent = Number(fontScaleEl.value).toFixed(2) + "x"; });
fontScaleEl.addEventListener("change", rerenderActive);
algorithmEl.addEventListener("change", rerenderActive);
hybridEl.addEventListener("change", rerenderActive);
photoAlgoEl.addEventListener("change", rerenderActive);
contrastStretchEl.addEventListener("change", rerenderActive);
gammaEl.addEventListener("input", () => { el("gammaVal").textContent = gammaEl.value; });
gammaEl.addEventListener("change", rerenderActive);
thresholdEl.addEventListener("input", () => { el("thresholdVal").textContent = thresholdEl.value; });
thresholdEl.addEventListener("change", rerenderActive);
photoGammaEl.addEventListener("input", () => { el("photoGammaVal").textContent = photoGammaEl.value; });
photoGammaEl.addEventListener("change", rerenderActive);
photoBrightEl.addEventListener("input", () => { el("photoBrightVal").textContent = photoBrightEl.value; });
photoBrightEl.addEventListener("change", rerenderActive);
renderBtn.addEventListener("click", rerenderActive);

async function enqueuePrintJob() {
  errorBox.style.display = "none";
  const printMsg = el("printMsg");
  printMsg.style.display = "none";
  let parsed = {};
  try {
    parsed = jsonEl.value.trim() ? JSON.parse(jsonEl.value) : {};
  } catch (err) {
    errorBox.textContent = "JSON 格式有误: " + err.message;
    errorBox.style.display = "block";
    return;
  }
  if (uploadedImageDataUrl && (templateEl.value === "photo" || templateEl.value === "note")) {
    parsed.imageDataUrl = uploadedImageDataUrl;
  }
  const btn = el("printBtn");
  btn.disabled = true;
  try {
    const res = await fetch("/api/print/jobs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        template: templateEl.value,
        style: styleEl.value,
        fontProfile: getActiveFont(),
        data: parsed,
        renderOptions: {
          algorithm: algorithmEl.value,
          gamma: Number(gammaEl.value),
          threshold: Number(thresholdEl.value),
          fontScale: getFontScale(),
          hybrid: hybridEl.checked,
          photoOptions: {
            algorithm: photoAlgoEl.value,
            gamma: Number(photoGammaEl.value),
            contrastStretch: contrastStretchEl.checked,
            brightness: Number(photoBrightEl.value)
          }
        }
      })
    });
    const out = await res.json();
    if (!res.ok) throw new Error(out.error || "入队失败");
    printMsg.innerHTML = "✅ 已加入打印队列：<b>" + out.id + "</b>（ESP32 在线后 5 秒内自动出纸）";
    printMsg.style.display = "block";
    refreshDeviceStats();
  } catch (err) {
    errorBox.textContent = err.message;
    errorBox.style.display = "block";
  } finally {
    btn.disabled = false;
  }
}

async function refreshDeviceStats() {
  try {
    const [devRes, healthRes] = await Promise.all([
      fetch("/api/devices"),
      fetch("/api/health")
    ]);
    const devices = await devRes.json();
    const health = await healthRes.json();
    const esp = devices.find((d) => d.id === "esp32-01");
    const prn = devices.find((d) => d.id === "printer-01");
    const bat = devices.find((d) => d.id === "powerbank-01");
    const batStr = bat && bat.batteryPct !== null ? bat.batteryPct + "%" : "未上报";
    const espStr = esp && esp.status === "online" ? '<span class="badge-ok">在线</span>' : '<span class="badge-warn">离线</span>';
    const prnStr = prn && prn.status === "online" ? '<span class="badge-ok">就绪 (' + (prn.paperStatus || "ok") + ')</span>' : '<span class="badge-warn">离线</span>';
    el("deviceStats").innerHTML =
      "ESP32: " + espStr + " · 打印机: " + prnStr + "<br>" +
      "电池电量: <b>" + batStr + "</b> · 待打印队列: <b>" + (health.queuedJobs ?? 0) + "</b>";
  } catch {
    el("deviceStats").textContent = "无法获取硬件状态";
  }
}

el("printBtn").addEventListener("click", enqueuePrintJob);
refreshDeviceStats();
setInterval(refreshDeviceStats, 5000);

document.querySelectorAll(".zoom-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".zoom-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    el("mainArea").classList.toggle("zoom-2x", btn.dataset.zoom === "2");
  });
});

const GALLERY_ITEMS = [
  {
    label: "1. 每日 Todo 清单（极客小票风 · 思源黑体）",
    template: "todo",
    style: "receipt",
    fontProfile: "source-han",
    algorithm: "threshold",
    gamma: 1.1,
    threshold: 150,
    hybrid: false,
    data: PRESETS.todo
  },
  {
    label: "2. 单条专注工单（极客小票风 · Fusion Pixel 像素体）",
    template: "focus",
    style: "receipt",
    fontProfile: "pixel",
    algorithm: "threshold",
    gamma: 1.1,
    threshold: 150,
    hybrid: false,
    data: PRESETS.focus
  },
  {
    label: "3. 对象留言纸条（手账便签风 · 思源黑体）",
    template: "note",
    style: "journal",
    fontProfile: "source-han",
    algorithm: "threshold",
    gamma: 1.1,
    threshold: 150,
    hybrid: false,
    data: PRESETS.note
  },
  {
    label: "4. 拍立得 / 图片卡片（手账风 · 混合光栅化 Atkinson）",
    template: "photo",
    style: "journal",
    fontProfile: "source-han",
    algorithm: "threshold",
    gamma: 1.1,
    threshold: 150,
    hybrid: true,
    photoOptions: { algorithm: "atkinson", gamma: 1.8, contrastStretch: true, brightness: 0 },
    data: PRESETS.photo
  }
];

function switchTab(mode) {
  activeTab = mode;
  const isGallery = mode === "gallery";
  el("tabGallery").classList.toggle("active", isGallery);
  el("tabSingle").classList.toggle("active", !isGallery);
  el("galleryView").style.display = isGallery ? "grid" : "none";
  el("singleView").style.display = isGallery ? "none" : "flex";
  el("zoomControls").style.display = isGallery ? "none" : "flex";
}

el("tabGallery").addEventListener("click", () => { switchTab("gallery"); renderGallery(); });
el("tabSingle").addEventListener("click", () => switchTab("single"));

async function renderGallery() {
  const container = el("galleryView");
  const curFont = getActiveFont();
  const curStyle = styleEl.value;
  const curAlgo = algorithmEl.value;
  const curGamma = Number(gammaEl.value);
  const curThreshold = Number(thresholdEl.value);
  container.innerHTML = '<div class="stats">正在使用字体 <b>' + curFont + '</b> 渲染 4 种核心格式...</div>';
  const cards = [];
  for (const item of GALLERY_ITEMS) {
    try {
      const res = await fetch("/api/printer/preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          template: item.template,
          style: curStyle,
          fontProfile: curFont,
          fontScale: getFontScale(),
          algorithm: curAlgo,
          gamma: curGamma,
          threshold: curThreshold,
          hybrid: item.hybrid,
          photoOptions: item.photoOptions,
          data: item.data
        })
      });
      const out = await res.json();
      if (!res.ok) throw new Error(out.error || "渲染失败");
      cards.push({ item, out });
    } catch (err) {
      cards.push({ item, error: err.message });
    }
  }

  container.innerHTML = "";
  for (const entry of cards) {
    const card = document.createElement("div");
    card.className = "gallery-card";
    if (entry.error) {
      card.innerHTML = '<div class="card-title">' + entry.item.label + '</div><div class="error-box" style="display:block">' + entry.error + '</div>';
      container.appendChild(card);
      continue;
    }
    const s = entry.out.stats || {};
    card.innerHTML =
      '<div class="card-title" style="margin-bottom:0;color:var(--text)">' + entry.item.label.split("（")[0] + '（' + curFont + '）</div>' +
      '<div class="gallery-meta"><span>' + entry.out.widthPx + '×' + entry.out.heightPx + 'px (' + (entry.out.heightPx / 8).toFixed(1) + 'mm)</span><span>黑度 ' + s.avgBlackPct + '% · ' + s.estimatedBands + '分片</span></div>' +
      '<div class="paper-frame"><img src="' + entry.out.ditheredPngDataUrl + '" alt="preview" /></div>' +
      '<div class="gallery-actions">' +
      '<button type="button" class="zoom-btn edit-btn">🎛️ 精调此格式</button>' +
      '<button type="button" class="btn print-one-btn" style="background:#4ade80;color:#052e16">🖨️ 直接打印</button>' +
      '</div>';

    card.querySelector(".edit-btn").addEventListener("click", () => {
      templateEl.value = entry.item.template;
      hybridEl.checked = Boolean(entry.item.hybrid);
      jsonEl.value = JSON.stringify(entry.item.data, null, 2);
      updatePhotoSectionVisibility();
      switchTab("single");
      renderPreview();
    });

    card.querySelector(".print-one-btn").addEventListener("click", async (ev) => {
      const btn = ev.currentTarget;
      btn.disabled = true;
      try {
        const res = await fetch("/api/print/jobs", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            template: entry.item.template,
            style: styleEl.value,
            fontProfile: getActiveFont(),
            data: entry.item.data,
            renderOptions: {
              algorithm: algorithmEl.value,
              gamma: Number(gammaEl.value),
              threshold: Number(thresholdEl.value),
              fontScale: getFontScale(),
              hybrid: entry.item.hybrid,
              photoOptions: entry.item.photoOptions
            }
          })
        });
        const out = await res.json();
        if (!res.ok) throw new Error(out.error || "入队失败");
        btn.textContent = "✅ 已入队";
        refreshDeviceStats();
        setTimeout(() => { btn.textContent = "🖨️ 直接打印"; }, 2500);
      } catch (err) {
        alert("入队失败: " + err.message);
      } finally {
        btn.disabled = false;
      }
    });

    container.appendChild(card);
  }
}

loadPreset();
renderPreview();
renderGallery();
</script>
</body>
</html>
`;
