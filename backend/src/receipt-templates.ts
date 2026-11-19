export type ReceiptTemplateKind = 'todo' | 'focus' | 'note' | 'photo' | 'calibration';
export type ReceiptStyle = 'receipt' | 'journal';
export type ReceiptFontProfile = string;

export interface TodoReceiptItem {
  title: string;
  completed?: boolean;
  priority?: 'high' | 'normal' | 'low';
  tag?: string;
}

export interface TodoReceiptData {
  date?: string;
  weather?: string;
  owner?: string;
  items: TodoReceiptItem[];
  footerNote?: string;
}

export interface FocusTicketData {
  title: string;
  deadline?: string;
  tag?: string;
  priority?: 'high' | 'normal';
  subtasks?: string[];
  estimatedMinutes?: number;
  noteLines?: number;
}

export interface NoteReceiptData {
  to?: string;
  from?: string;
  timestamp?: string;
  title?: string;
  body: string;
  imageDataUrl?: string;
}

export interface PhotoReceiptData {
  imageDataUrl?: string;
  caption?: string;
  date?: string;
  location?: string;
  tag?: string;
}

const escapeHtml = (input: string): string =>
  input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const FONT_FACE_CSS = `
  @font-face {
    font-family: "SourceHanThermal";
    src: url("http://local.fonts/SourceHanSansCN-Medium.otf") format("opentype");
    font-weight: 500;
    font-style: normal;
  }
  @font-face {
    font-family: "SourceHanThermal";
    src: url("http://local.fonts/SourceHanSansCN-Bold.otf") format("opentype");
    font-weight: 700 900;
    font-style: normal;
  }
  @font-face {
    font-family: "FusionPixelThermal";
    src: url("http://local.fonts/fusion-pixel-12px-monospaced-zh_hans.otf") format("opentype");
    font-weight: 400 900;
    font-style: normal;
  }
`;

const sanitizeFontList = (input: string): string =>
  input
    .split(',')
    .map((part) => part.replace(/["';{}<>\\]/g, '').trim())
    .filter(Boolean)
    .map((name) => `"${name}"`)
    .join(', ');

function resolveFontStacks(fontProfile: ReceiptFontProfile): {
  mainFont: string;
  monoFont: string;
  isPixel: boolean;
} {
  switch (fontProfile) {
    case 'jetbrains-pixel':
      return {
        mainFont: '"JetBrainsMono Nerd Font", "FusionPixelThermal", "SourceHanThermal", monospace',
        monoFont: '"JetBrainsMono Nerd Font", "FusionPixelThermal", monospace',
        isPixel: true,
      };
    case 'jetbrains-sourcehan':
      return {
        mainFont: '"JetBrainsMono Nerd Font", "SourceHanThermal", "PingFang SC", sans-serif',
        monoFont: '"JetBrainsMono Nerd Font", "SourceHanThermal", monospace',
        isPixel: false,
      };
    case 'hack-pixel':
      return {
        mainFont: '"Hack Nerd Font", "FusionPixelThermal", "SourceHanThermal", monospace',
        monoFont: '"Hack Nerd Font", "FusionPixelThermal", monospace',
        isPixel: true,
      };
    case 'pixel':
      return {
        mainFont: '"FusionPixelThermal", "SourceHanThermal", monospace',
        monoFont: '"FusionPixelThermal", monospace',
        isPixel: true,
      };
    case 'source-han':
      return {
        mainFont: '"SourceHanThermal", "PingFang SC", "Hiragino Sans GB", sans-serif',
        monoFont: '"SF Mono", "Menlo", "SourceHanThermal", monospace',
        isPixel: false,
      };
    case 'songti':
      return {
        mainFont: '"Songti SC", "STSong", "SourceHanThermal", serif',
        monoFont: '"SF Mono", "Songti SC", monospace',
        isPixel: false,
      };
    case 'heiti':
      return {
        mainFont: '"Hiragino Sans GB", "Heiti SC", "SourceHanThermal", sans-serif',
        monoFont: '"SF Mono", "Hiragino Sans GB", monospace',
        isPixel: false,
      };
    case 'mono':
      return {
        mainFont: '"SF Mono", "Menlo", "Monaco", "SourceHanThermal", monospace',
        monoFont: '"SF Mono", "Menlo", "Monaco", "SourceHanThermal", monospace',
        isPixel: false,
      };
    default: {
      const custom = sanitizeFontList(fontProfile);
      const fallback = '"FusionPixelThermal", "SourceHanThermal", "PingFang SC", sans-serif';
      return {
        mainFont: custom ? `${custom}, ${fallback}` : fallback,
        monoFont: custom ? `${custom}, "SF Mono", monospace` : '"SF Mono", monospace',
        isPixel: fontProfile.toLowerCase().includes('pixel'),
      };
    }
  }
}

function baseCss(fontProfile: ReceiptFontProfile): string {
  const { mainFont, monoFont, isPixel } = resolveFontStacks(fontProfile);

  return `
    ${FONT_FACE_CSS}
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      width: 384px;
      background: #ffffff;
      color: #000000;
    }
    body {
      padding: 14px 12px 0 12px;
      font-family: ${mainFont};
      font-weight: 500;
    }
    .mono { font-family: ${monoFont}; }
    .hatch-bar {
      height: 10px;
      border-top: 2px solid #000;
      border-bottom: 2px solid #000;
      background: repeating-linear-gradient(
        -45deg,
        #000 0px,
        #000 2px,
        #fff 2px,
        #fff 6px
      );
    }
    .dither-img {
      display: block;
      width: 100%;
      height: auto;
      image-rendering: pixelated;
    }
    .tear-footer {
      margin-top: 20px;
      padding-top: 10px;
      border-top: 2px dashed #000;
      text-align: center;
      font-size: ${isPixel ? '12px' : '13px'};
      font-weight: 700;
      letter-spacing: 2px;
      padding-bottom: 52px; /* Clear manual tear bar below thermal head */
    }
  `;
}

function wrapHtml(
  bodyHtml: string,
  fontProfile: ReceiptFontProfile,
  extraCss = '',
): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8" />
<style>${baseCss(fontProfile)}\n${extraCss}</style>
</head>
<body>
${bodyHtml}
<div class="tear-footer"></div>
</body>
</html>`;
}

export function renderCalibrationHtml(
  style: ReceiptStyle,
  fontProfile: ReceiptFontProfile,
): string {
  const isReceipt = style === 'receipt';
  const css = `
    .cal-head { border-bottom: 3px solid #000; padding-bottom: 8px; margin-bottom: 10px; }
    .cal-title { font-size: 24px; font-weight: 800; }
    .cal-sub { font-size: 12px; font-weight: 700; margin-top: 4px; }
    .sec { margin: 12px 0; }
    .sec-label { font-size: 12px; font-weight: 800; border: 2px solid #000; display: inline-block; padding: 1px 7px; margin-bottom: 6px; }
    .grad-bar { display: flex; height: 28px; border: 2px solid #000; }
    .grad-step { flex: 1; }
    .lines div { background: #000; margin: 6px 0; }
    .check-row { font-size: 16px; font-weight: 700; display: flex; align-items: center; gap: 8px; margin: 5px 0; }
    .box { width: 18px; height: 18px; border: 2px solid #000; display: inline-flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 900; }
    .done-strike { text-decoration: line-through; text-decoration-thickness: 2px; }
  `;

  const steps = [0, 32, 64, 96, 128, 160, 192, 224, 255]
    .map((v) => `<div class="grad-step" style="background:rgb(${v},${v},${v})"></div>`)
    .join('');

  return wrapHtml(
    `<div class="cal-head ${isReceipt ? 'mono' : ''}">
      <div class="cal-title">EM5823H 5cm 校准条</div>
      <div class="cal-sub">384px | ${style.toUpperCase()} | FONT: ${fontProfile.toUpperCase()}</div>
    </div>
    <div class="sec">
      <div class="sec-label">1. 字号与笔画清晰度</div>
      <div style="font-size:12px">12px 像素基准中文 English 123456</div>
      <div style="font-size:16px;font-weight:700">16px 正文字号测试 繁餐赢 ★ ☑</div>
      <div style="font-size:24px;font-weight:800">24px 粗体大标题</div>
    </div>
    <div class="sec">
      <div class="sec-label">2. 灰度抖动色阶 (0 → 255)</div>
      <div class="grad-bar">${steps}</div>
    </div>
    <div class="sec">
      <div class="sec-label">3. 线宽、网纹与删除线</div>
      <div class="hatch-bar" style="margin-bottom:6px"></div>
      <div class="lines">
        <div style="height:1px"></div>
        <div style="height:2px"></div>
        <div style="height:4px"></div>
      </div>
      <div class="check-row"><span class="box"></span> 未完成任务示例</div>
      <div class="check-row"><span class="box">✓</span> <span class="done-strike">已完成删除线示例</span></div>
    </div>`,
    fontProfile,
    css,
  );
}

function tomorrowLabel(now = new Date()): string {
  const t = new Date(now.getTime() + 24 * 3600 * 1000);
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
  }).formatToParts(t);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('month')}月${get('day')}日 ${get('weekday').replace('星期', '周')}`;
}

const scalePx = (base: number, scale: number): string =>
  `${Math.max(10, Math.round(base * scale))}px`;

export function renderTodoHtml(
  data: TodoReceiptData,
  _style: ReceiptStyle,
  fontProfile: ReceiptFontProfile,
  fontScale = 1,
): string {
  const date = escapeHtml(data.date || tomorrowLabel());
  const items = data.items || [];
  const { isPixel } = resolveFontStacks(fontProfile);
  const css = `
    .t-date { font-size: ${scalePx(isPixel ? 24 : 28, fontScale)}; font-weight: 800; padding-bottom: 10px; border-bottom: 3px solid #000; }
    .t-item { display: flex; align-items: flex-start; gap: 12px; padding: 12px 0; border-bottom: 1.5px dashed #000; font-size: ${scalePx(isPixel ? 18 : 19, fontScale)}; line-height: ${isPixel ? '1.55' : '1.4'}; }
    .t-box { width: 22px; height: 22px; border: 2.5px solid #000; flex-shrink: 0; margin-top: 3px; }
    .t-text { flex: 1; font-weight: 700; word-break: break-word; }
    .t-high .t-text { font-weight: 900; text-decoration: underline; text-decoration-thickness: 2px; text-underline-offset: 4px; }
  `;
  const rows = items
    .map(
      (i) => `<div class="t-item ${i.priority === 'high' ? 't-high' : ''}">
        <div class="t-box"></div><div class="t-text">${escapeHtml(i.title)}</div></div>`,
    )
    .join('');
  return wrapHtml(
    `${date ? `<div class="t-date">${date}</div>` : ''}<div>${rows}</div>`,
    fontProfile,
    css,
  );
}

export function renderFocusHtml(
  data: FocusTicketData,
  _style: ReceiptStyle,
  fontProfile: ReceiptFontProfile,
  fontScale = 1,
): string {
  const title = escapeHtml(data.title || '');
  const deadline = data.deadline ? escapeHtml(data.deadline) : '';
  const subtasks = data.subtasks ?? [];
  const noteLines = Math.max(0, Math.min(6, data.noteLines ?? 3));
  const { isPixel } = resolveFontStacks(fontProfile);
  const css = `
    .f-title { font-size: ${scalePx(isPixel ? 24 : 30, fontScale)}; font-weight: 900; line-height: 1.3; word-break: break-word; padding: 6px 0 12px; border-bottom: 3px solid #000; }
    .f-due { font-size: ${scalePx(isPixel ? 16 : 16, fontScale)}; font-weight: 700; padding: 8px 0; }
    .f-sub { display: flex; align-items: flex-start; gap: 10px; font-size: ${scalePx(isPixel ? 18 : 17, fontScale)}; font-weight: 700; margin-top: 10px; }
    .f-box { width: 18px; height: 18px; border: 2.5px solid #000; flex-shrink: 0; margin-top: 3px; }
    .f-line { height: 32px; border-bottom: 1.5px dashed #000; }
    .f-lines { margin-top: 12px; }
  `;
  const subs = subtasks
    .map(
      (s) =>
        `<div class="f-sub"><span class="f-box"></span><span>${escapeHtml(s)}</span></div>`,
    )
    .join('');
  const lines = Array.from({ length: noteLines })
    .map(() => '<div class="f-line"></div>')
    .join('');
  return wrapHtml(
    `<div class="f-title">${title}</div>
     ${deadline ? `<div class="f-due">${deadline}</div>` : ''}
     ${subs}
     ${lines ? `<div class="f-lines">${lines}</div>` : ''}`,
    fontProfile,
    css,
  );
}

export function renderNoteHtml(
  data: NoteReceiptData,
  _style: ReceiptStyle,
  fontProfile: ReceiptFontProfile,
  fontScale = 1,
): string {
  const title = data.title ? escapeHtml(data.title) : '';
  const from = data.from ? escapeHtml(data.from) : '';
  const body = escapeHtml(data.body || '').replace(/\n/g, '<br/>');
  const { isPixel } = resolveFontStacks(fontProfile);
  const imgBlock = data.imageDataUrl
    ? `<div class="note-img-wrap"><img class="dither-img" src="${data.imageDataUrl}" /></div>`
    : '';
  const css = `
    .n-title { font-size: ${scalePx(isPixel ? 24 : 26, fontScale)}; font-weight: 800; padding-bottom: 8px; border-bottom: 3px solid #000; margin-bottom: 12px; }
    .n-body { font-size: ${scalePx(isPixel ? 18 : 22, fontScale)}; line-height: 1.6; font-weight: 700; word-break: break-word; }
    .note-img-wrap { margin: 12px 0; border: 2px solid #000; padding: 4px; }
    .n-from { margin-top: 14px; text-align: right; font-size: ${scalePx(isPixel ? 16 : 16, fontScale)}; font-weight: 800; }
  `;
  return wrapHtml(
    `${title ? `<div class="n-title">${title}</div>` : ''}
     <div class="n-body">${body}</div>
     ${imgBlock}
     ${from ? `<div class="n-from">— ${from}</div>` : ''}`,
    fontProfile,
    css,
  );
}


/**
 * Built-in scenic grayscale SVG fallback when no user photo is uploaded yet,
 * so the user can immediately inspect Hybrid Rasterization (dithered photo + crisp caption).
 */
export const DEFAULT_DEMO_PHOTO_SVG_DATA_URL =
  'data:image/svg+xml;base64,' +
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="340" height="240" viewBox="0 0 340 240">
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#3a3a3a"/>
          <stop offset="55%" stop-color="#bdbdbd"/>
          <stop offset="100%" stop-color="#f2f2f2"/>
        </linearGradient>
        <radialGradient id="sun" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#ffffff"/>
          <stop offset="70%" stop-color="#eeeeee"/>
          <stop offset="100%" stop-color="#cccccc" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <rect width="340" height="240" fill="url(#sky)"/>
      <circle cx="250" cy="64" r="38" fill="url(#sun)"/>
      <circle cx="250" cy="64" r="20" fill="#ffffff"/>
      <path d="M0 175 L82 96 L152 156 L220 108 L340 185 L340 240 L0 240 Z" fill="#555555"/>
      <path d="M0 205 L110 142 L195 190 L275 152 L340 198 L340 240 L0 240 Z" fill="#222222"/>
      <rect x="20" y="198" width="120" height="22" rx="4" fill="#ffffff" fill-opacity="0.85"/>
      <text x="30" y="214" font-family="sans-serif" font-size="13" font-weight="bold" fill="#111111">DEMO PHOTO</text>
    </svg>`,
  ).toString('base64');

export function renderPhotoHtml(
  data: PhotoReceiptData,
  _style: ReceiptStyle,
  fontProfile: ReceiptFontProfile,
  fontScale = 1,
): string {
  const imgSrc = data.imageDataUrl || DEFAULT_DEMO_PHOTO_SVG_DATA_URL;
  const caption = data.caption ? escapeHtml(data.caption) : '';
  const date = data.date ? escapeHtml(data.date) : '';
  const { isPixel } = resolveFontStacks(fontProfile);
  const css = `
    .p-box { border: 3px solid #000; padding: 6px 6px 0; }
    .p-cap { padding: 12px 4px 14px; font-size: ${scalePx(isPixel ? 18 : 18, fontScale)}; font-weight: 700; line-height: 1.5; word-break: break-word; }
    .p-date { text-align: right; font-size: ${scalePx(14, fontScale)}; font-weight: 700; margin-top: 6px; }
  `;
  return wrapHtml(
    `<div class="p-box"><img class="dither-img" src="${imgSrc}" />
       <div class="p-cap">${caption}</div></div>
     ${date ? `<div class="p-date">${date}</div>` : ''}`,
    fontProfile,
    css,
  );
}


export function buildReceiptHtml(
  template: ReceiptTemplateKind,
  style: ReceiptStyle,
  data: unknown,
  fontProfile: ReceiptFontProfile = 'jetbrains-pixel',
  fontScale = 1,
): string {
  switch (template) {
    case 'calibration':
      return renderCalibrationHtml(style, fontProfile);
    case 'todo':
      return renderTodoHtml(
        (data as TodoReceiptData) ?? { items: [] },
        style,
        fontProfile,
        fontScale,
      );
    case 'focus':
      return renderFocusHtml(
        (data as FocusTicketData) ?? { title: '' },
        style,
        fontProfile,
        fontScale,
      );
    case 'photo':
      return renderPhotoHtml(
        (data as PhotoReceiptData) ?? {},
        style,
        fontProfile,
        fontScale,
      );
    case 'note':
    default:
      return renderNoteHtml(
        (data as NoteReceiptData) ?? { body: '' },
        style,
        fontProfile,
        fontScale,
      );
  }
}
