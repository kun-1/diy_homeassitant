import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, ReactNode } from "react";
import {
  DATA_CHANGED_EVENT,
  apiEnabled,
  createLetter,
  createPrintJob,
  deleteLetter,
  getSettings,
  listDevices,
  listLetters,
  listPrintJobs,
  notifyDataChanged,
  type BackendLetter,
  type BackendPrintJob,
} from "./api";
import { openDesignDefs, openDesignLetterDefs } from "./open-design-assets";
import "./letters-reference.css";

type Deco = "border" | "emoji" | "receipt" | "minimal";
type Content = "none" | "polaroid" | "coupon" | "ghost-stamp" | "prescription";
type Status = "queued" | "printing" | "done" | "failed";
type GhostFace = "idle" | "happy" | "sleepy" | "letter";
type CouponFields = {
  title: string;
  detail: string;
  expire: string;
  code: string;
  how: string;
};
type PrescriptionFields = { diagnosis: string; rp: string[]; advice: string };
type LetterFields = {
  coupon?: CouponFields;
  prescription?: PrescriptionFields;
};
type LetterImage = { src: string; dither: "atkinson" };
type PrintProfile = "pixel-hard" | "pixel-soft" | "thermal-sans";
type Letter = {
  id: string;
  no: number;
  decoration: Deco;
  content: Content;
  status: Status;
  ts: string;
  text: string;
  recipient?: string;
  signature?: string;
  image?: LetterImage;
  ghost?: GhostFace;
  fields?: LetterFields;
  unread?: boolean;
  archived?: boolean;
};

function readPrintProfile(): PrintProfile {
  try {
    const value = JSON.parse(
      localStorage.getItem("guozi-settings") || "{}",
    )?.printProfile;
    return value === "pixel-hard" ||
      value === "pixel-soft" ||
      value === "thermal-sans"
      ? value
      : "thermal-sans";
  } catch {
    return "thermal-sans";
  }
}

const decorations: Array<[Deco, string]> = [
  ["border", "边框花边"],
  ["emoji", "表情点缀"],
  ["receipt", "小票风"],
  ["minimal", "极简大字"],
];
const contents: Array<[Content, string]> = [
  ["none", "无"],
  ["polaroid", "拍立得"],
  ["coupon", "兑换券"],
  ["ghost-stamp", "ghost 邮戳"],
  ["prescription", "关心处方笺"],
];
const statusLabel: Record<Status, string> = {
  queued: "排队中",
  printing: "打印中",
  done: "已打印",
  failed: "打印失败",
};
const defaultCoupon: CouponFields = {
  title: "一次不问理由的拥抱",
  detail: "凭此券，可以兑换一个你现在最想要的小愿望。",
  expire: "长期有效",
  code: "GZ-000",
  how: "出示本券即可",
};
const defaultPrescription: PrescriptionFields = {
  diagnosis: "最近好像有点累",
  rp: ["早睡 一晚", "少看手机 两次", "抱一下 不限量"],
  advice: "不许硬撑",
};
const seed: Letter[] = [
  {
    id: "s3",
    no: 3,
    decoration: "receipt",
    content: "none",
    status: "done",
    ts: "2026-08-15T21:40:00",
    text: "今晚我下厨,你负责夸我。\n夸得不走心要重夸。",
  },
  {
    id: "s2",
    no: 2,
    decoration: "border",
    content: "none",
    status: "done",
    ts: "2026-08-14T08:12:00",
    text: "早安。\n今天也要记得喝水,记得想我,\n记得晚上一起看那部拖了很久的电影。",
  },
  {
    id: "s1",
    no: 1,
    decoration: "emoji",
    content: "none",
    status: "done",
    ts: "2026-08-12T23:05:00",
    text: "第一次用这台小打印机给你写信。\n以后它就是我们家的情书专线了。",
  },
];

function fmtTs(value: string) {
  const d = new Date(value);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getMonth() + 1}月${d.getDate()}日 ${p(d.getHours())}:${p(d.getMinutes())}`;
}
function fmtNo(no: number) {
  return `NO.${String(no).padStart(3, "0")}`;
}
function paperName(decoration: Deco, content: Content) {
  return `${decorations.find(([id]) => id === decoration)?.[1] || "边框花边"}${content === "none" ? "" : ` · ${contents.find(([id]) => id === content)?.[1] || ""}`}`;
}
function readSettingsValue(
  key: "myName" | "signature" | "recipient",
  fallback: string,
) {
  try {
    const s = JSON.parse(localStorage.getItem("guozi-settings") || "{}");
    const value = key === "myName" ? (s?.signature ?? s?.myName) : s?.[key];
    return typeof value === "string" && value.trim() ? value.trim() : fallback;
  } catch {
    return fallback;
  }
}
function readMyName() {
  return readSettingsValue("signature", "我们的小日常");
}
function readRecipient() {
  return readSettingsValue("recipient", "Rita");
}

function normalize(
  raw: Partial<Letter> & {
    paper?: string;
    photoData?: string;
    fields?: Record<string, unknown>;
  },
  index: number,
): Letter {
  const oldContent =
    raw.content && contents.some(([id]) => id === raw.content)
      ? raw.content
      : "none";
  const oldDecoration =
    raw.decoration && decorations.some(([id]) => id === raw.decoration)
      ? raw.decoration
      : ["border", "emoji", "receipt", "minimal"].includes(raw.paper || "")
        ? (raw.paper as Deco)
        : "border";
  const oldFields = raw.fields || {};
  const fields: LetterFields | undefined =
    oldFields.coupon || oldFields.prescription
      ? {
          coupon: oldFields.coupon as CouponFields | undefined,
          prescription: oldFields.prescription as
            PrescriptionFields | undefined,
        }
      : oldFields.title || oldFields.diagnosis
        ? {
            coupon: {
              title: String(oldFields.title || defaultCoupon.title),
              detail: String(oldFields.detail || defaultCoupon.detail),
              expire: String(oldFields.expire || defaultCoupon.expire),
              code: String(oldFields.code || defaultCoupon.code),
              how: String(oldFields.how || defaultCoupon.how),
            },
            prescription: {
              diagnosis: String(
                oldFields.diagnosis || defaultPrescription.diagnosis,
              ),
              rp: String(
                oldFields.rp || defaultPrescription.rp.join("|"),
              ).split("|"),
              advice: String(oldFields.advice || defaultPrescription.advice),
            },
          }
        : undefined;
  return {
    id: raw.id || `l-${index}`,
    no: raw.no || index + 1,
    decoration: oldDecoration,
    content: oldContent as Content,
    status: raw.status || "done",
    ts: raw.ts || new Date().toISOString(),
    text: raw.text || "",
    recipient:
      typeof raw.recipient === "string" && raw.recipient.trim()
        ? raw.recipient.trim()
        : "Rita",
    signature: raw.signature,
    image:
      raw.image ||
      (raw.photoData ? { src: raw.photoData, dither: "atkinson" } : undefined),
    ghost: raw.ghost,
    fields,
    unread: raw.unread,
  };
}
function fromBackend(
  x: BackendLetter,
  index: number,
  job?: BackendPrintJob,
): Letter {
  const metadata = x.metadata || {};
  const content = (
    ["none", "polaroid", "coupon", "ghost-stamp", "prescription"].includes(
      String(metadata.content),
    )
      ? metadata.content
      : "none"
  ) as Content;
  const decoration = (
    ["border", "emoji", "receipt", "minimal"].includes(String(x.paper))
      ? x.paper
      : "border"
  ) as Deco;
  const coupon =
    metadata.coupon && typeof metadata.coupon === "object"
      ? (metadata.coupon as Record<string, unknown>)
      : undefined;
  const prescriptionMetadata = metadata.prescription;
  const prescriptionItems = Array.isArray(prescriptionMetadata)
    ? prescriptionMetadata.filter(
        (item): item is string => typeof item === "string",
      )
    : prescriptionMetadata && typeof prescriptionMetadata === "object"
      ? Array.isArray((prescriptionMetadata as Record<string, unknown>).rp)
        ? ((prescriptionMetadata as Record<string, unknown>).rp as unknown[]).filter(
            (item): item is string => typeof item === "string",
          )
        : undefined
      : undefined;
  const prescriptionFields =
    prescriptionMetadata && typeof prescriptionMetadata === "object" && !Array.isArray(prescriptionMetadata)
      ? prescriptionMetadata as Record<string, unknown>
      : undefined;
  const fields: LetterFields | undefined =
    coupon || prescriptionItems
      ? {
          coupon: coupon
            ? {
                ...defaultCoupon,
                title: String(coupon.name || defaultCoupon.title),
                expire: String(coupon.expiry || defaultCoupon.expire),
                code: String(coupon.code || defaultCoupon.code),
                detail: x.body,
              }
            : undefined,
          prescription: prescriptionItems
            ? {
                ...defaultPrescription,
                diagnosis: String(
                  prescriptionFields?.diagnosis || (Array.isArray(prescriptionMetadata) ? x.body : defaultPrescription.diagnosis),
                ),
                rp: prescriptionItems,
                advice: String(prescriptionFields?.advice || defaultPrescription.advice),
              }
            : undefined,
        }
      : undefined;
  const image =
    typeof metadata.imageData === "string"
      ? { src: metadata.imageData, dither: "atkinson" as const }
      : undefined;
  const ghost = ["idle", "happy", "sleepy", "letter"].includes(
    String(metadata.ghostEmoji),
  )
    ? (metadata.ghostEmoji as GhostFace)
    : undefined;
  const status: Status =
    job?.status === "printing"
      ? "printing"
      : job?.status === "failed"
        ? "failed"
        : job?.status === "completed"
          ? "done"
          : x.unread
            ? "queued"
            : "done";
  return {
    id: x.id,
    no: index + 1,
    decoration,
    content,
    status,
    ts: x.createdAt,
    text: x.body,
    recipient: "Rita",
    signature: x.signature,
    image,
    ghost,
    fields,
    unread: x.unread,
    archived: x.archived,
  };
}

function GhostCanvas({ face }: { face: GhostFace }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const faceAtom =
      face === "happy"
        ? "#face-happy"
        : face === "sleepy"
          ? "#face-sleepy"
          : "#face-idle";
    const envelope = face === "letter" ? '<use href="#envelope"/>' : "";
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 660"><defs>${openDesignDefs()}</defs><use href="#ghost-body"/><use href="${faceAtom}"/>${envelope}</svg>`;
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    const image = new Image();
    image.onload = () => {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
      for (let i = 0; i < data.data.length; i += 4) {
        const lum =
          data.data[i] * 0.299 +
          data.data[i + 1] * 0.587 +
          data.data[i + 2] * 0.114;
        const v = lum < 128 ? 0 : 255;
        data.data[i] = v;
        data.data[i + 1] = v;
        data.data[i + 2] = v;
        data.data[i + 3] = 255;
      }
      ctx.putImageData(data, 0, 0);
      URL.revokeObjectURL(url);
    };
    image.onerror = () => URL.revokeObjectURL(url);
    image.src = url;
    return () => URL.revokeObjectURL(url);
  }, [face]);
  return <canvas className="r-ghost" width="100" height="100" ref={ref} />;
}

function Receipt({ letter, id }: { letter: Letter; id?: string }) {
  const coupon = { ...defaultCoupon, ...letter.fields?.coupon };
  const prescription = {
    ...defaultPrescription,
    ...letter.fields?.prescription,
  };
  const body: ReactNode = letter.text.trim() ? (
    letter.text.trim()
  ) : (
    <span className="r-empty">(写点什么,这里会实时长出来)</span>
  );
  let contentBody: ReactNode;
  if (letter.content === "polaroid")
    contentBody = (
      <>
        <div className="r-image">
          {letter.image?.src ? (
            <img alt="" src={letter.image.src} />
          ) : (
            <div className="placeholder">点下面选一张图,会变成 1-bit 抖动</div>
          )}
        </div>
        <div className="r-body">{body}</div>
        <div className="r-sep" />
      </>
    );
  else if (letter.content === "coupon")
    contentBody = (
      <>
        <div className="r-head">果 子 兑 换 券</div>
        <div className="r-sep" />
        <div className="r-body">{coupon.title}</div>
        <div className="r-coupon-detail">{coupon.detail}</div>
        <div className="r-fields">
          <div className="row">
            <b>有效期</b>
            <span>{coupon.expire}</span>
          </div>
          <div className="row">
            <b>券 码</b>
            <span>{coupon.code}</span>
          </div>
          <div className="row">
            <b>使用方式</b>
            <span>{coupon.how}</span>
          </div>
        </div>
        <div className="r-tear">✂ - - - - - - - - - -</div>
      </>
    );
  else if (letter.content === "ghost-stamp")
    contentBody = (
      <>
        <div className="r-ghost-wrap">
          <GhostCanvas face={letter.ghost || "letter"} />
        </div>
        <div className="r-body">{body}</div>
        <div className="r-sep" />
      </>
    );
  else if (letter.content === "prescription")
    contentBody = (
      <>
        <div className="r-sep-heavy" />
        <div className="rx-head">今 日 份 关 心 处 方</div>
        <div className="r-sep-heavy" />
        <div className="r-info">
          <span>姓名 {letter.recipient || "Rita"}</span>
          <span>日期 {fmtTs(letter.ts).slice(0, 5)}</span>
        </div>
        <div className="r-info">
          <span>诊断 {prescription.diagnosis}</span>
          <span />
        </div>
        <div className="r-sep-light" />
        <div className="r-rp">Rp.</div>
        <ol className="r-list">
          {prescription.rp.map((item, index) => {
            const parts = item.split(" ");
            return (
              <li key={`${item}-${index}`}>
                {parts[0]}
                <b>{parts.slice(1).join(" ")}</b>
              </li>
            );
          })}
        </ol>
        <div className="r-info">
          <span>医嘱</span>
          <span>{prescription.advice}</span>
        </div>
        <div className="r-sep-light" />
        <div className="r-sig">
          <span>医师签名</span>
          <span>{letter.signature || ""}</span>
        </div>
        <div className="r-sep-heavy" />
      </>
    );
  else contentBody = <div className="r-body">{body}</div>;
  const header =
    letter.decoration === "border" ? (
      <div className="r-head">给 {letter.recipient || "Rita"}</div>
    ) : letter.decoration === "emoji" ? (
      <div className="r-head">♡ ✿ ♡</div>
    ) : letter.decoration === "receipt" ? (
      <>
        <div className="r-head">LOVE LETTER</div>
        <div className="r-sep" />
      </>
    ) : null;
  const signature = letter.signature ? `— ${letter.signature}` : "";
  const footer =
    letter.decoration === "border" ? (
      <>
        <div className="r-foot">{signature}</div>
        <div className="r-foot" style={{ marginTop: 2 }}>
          {fmtNo(letter.no)} · {fmtTs(letter.ts)}
        </div>
      </>
    ) : letter.decoration === "emoji" ? (
      <>
        <div className="r-foot">{signature}</div>
        <div className="r-foot" style={{ marginTop: 2 }}>
          ☺ {fmtTs(letter.ts)} ☺
        </div>
      </>
    ) : letter.decoration === "receipt" ? (
      <>
        <div className="r-foot" style={{ textAlign: "left" }}>
          {fmtNo(letter.no)} · {fmtTs(letter.ts)}
        </div>
        <div className="r-sep" />
      </>
    ) : (
      <div className="r-foot">— {fmtTs(letter.ts)} —</div>
    );
  const inner = (
    <>
      {header}
      {contentBody}
      {footer}
    </>
  );
  return (
    <div
      id={id}
      className={`receipt paper-${letter.decoration} content-${letter.content}`}
    >
      {letter.decoration === "border" ? (
        <div className="r-frame">{inner}</div>
      ) : (
        inner
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  maxLength = 20,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  maxLength?: number;
}) {
  return (
    <div className="mod-row">
      <label>{label}</label>
      <input
        value={value}
        maxLength={maxLength}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
function DitherImage({
  file,
  onDone,
}: {
  file: File;
  onDone: (image: LetterImage) => void;
}) {
  useEffect(() => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const w = 192;
      const h = Math.max(
        1,
        Math.round((w * image.naturalHeight) / image.naturalWidth),
      );
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(image, 0, 0, w, h);
      const data = ctx.getImageData(0, 0, w, h);
      const gray = new Float32Array(w * h);
      for (let i = 0; i < gray.length; i++) {
        const o = i * 4;
        gray[i] =
          data.data[o] * 0.299 +
          data.data[o + 1] * 0.587 +
          data.data[o + 2] * 0.114;
      }
      const add = (x: number, y: number, v: number) => {
        if (x >= 0 && x < w && y >= 0 && y < h) gray[y * w + x] += v;
      };
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const i = y * w + x;
          const old = gray[i];
          const next = old < 128 ? 0 : 255;
          const error = (old - next) / 8;
          gray[i] = next;
          add(x + 1, y, error);
          add(x + 2, y, error);
          add(x - 1, y + 1, error);
          add(x, y + 1, error);
          add(x + 1, y + 1, error);
          add(x, y + 2, error);
          const o = i * 4;
          data.data[o] = data.data[o + 1] = data.data[o + 2] = next;
          data.data[o + 3] = 255;
        }
      ctx.putImageData(data, 0, 0);
      onDone({ src: canvas.toDataURL("image/png"), dither: "atkinson" });
    };
    image.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file, onDone]);
  return null;
}

export function LettersPage({
  onCountChange,
  showToast: _showToast,
}: {
  count: number;
  onCountChange: (count: number) => void;
  showToast: (message: string) => void;
}) {
  const [letters, setLetters] = useState<Letter[]>(() =>
    apiEnabled()
      ? []
      : JSON.parse(
          localStorage.getItem("guozi-letters") || JSON.stringify(seed),
        ).map((item: Partial<Letter> & { paper?: string }) =>
          normalize(item, 0),
        ),
  );
  const [pane, setPane] = useState<"compose" | "records">("compose");
  const [decoration, setDecoration] = useState<Deco>("border");
  const [content, setContent] = useState<Content>("none");
  const [text, setText] = useState("");
  const [recipient, setRecipient] = useState(readRecipient());
  const [signature, setSignature] = useState(readMyName());
  const [coupon, setCoupon] = useState<CouponFields>({ ...defaultCoupon });
  const [prescription, setPrescription] = useState<PrescriptionFields>({
    ...defaultPrescription,
    rp: [...defaultPrescription.rp],
  });
  const [ghost, setGhost] = useState<GhostFace>("letter");
  const [image, setImage] = useState<LetterImage | undefined>();
  const [viewing, setViewing] = useState<Letter | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const confirmTimers = useRef<Record<string, number>>({});
  const [collapsed, setCollapsed] = useState({ deco: false, content: false });
  const [toast, setToast] = useState("");
  const [companionState, setCompanionState] = useState<
    "idle" | "attentive" | "letter" | "happy"
  >("idle");
  const [companionBubble, setCompanionBubble] = useState("");
  const [companionBubbleShown, setCompanionBubbleShown] = useState(false);
  const [companionMorphing, setCompanionMorphing] = useState(false);
  const companionTimer = useRef<number | undefined>(undefined);
  const companionDecayTimer = useRef<number | undefined>(undefined);
  const toastTimer = useRef<number | undefined>(undefined);
  const viewTrigger = useRef<HTMLButtonElement>(null);
  const current = useMemo<Letter>(
    () => ({
      id: "preview",
      no: Math.max(0, ...letters.map((item) => item.no)) + 1,
      decoration,
      content,
      status: "queued",
      ts: new Date().toISOString(),
      text,
      recipient,
      signature,
      ghost,
      image,
      fields: { coupon, prescription },
    }),
    [
      letters,
      decoration,
      content,
      text,
      recipient,
      signature,
      ghost,
      image,
      coupon,
      prescription,
    ],
  );
  const viewingIndex = viewing ? letters.findIndex((item) => item.id === viewing.id) : -1;
  const moveViewing = (delta: number) => {
    if (viewingIndex < 0) return;
    const nextIndex = viewingIndex + delta;
    if (nextIndex >= 0 && nextIndex < letters.length) setViewing(letters[nextIndex]);
  };
  const say = (message: string) => {
    setToast(message);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(""), 2400);
  };
  const companionSay = (message: string) => {
    setCompanionBubble(message);
    setCompanionBubbleShown(false);
    window.clearTimeout(companionTimer.current);
    window.requestAnimationFrame(() => setCompanionBubbleShown(true));
    companionTimer.current = window.setTimeout(
      () => setCompanionBubbleShown(false),
      3400,
    );
  };
  const companionSetState = (
    next: "idle" | "attentive" | "letter" | "happy",
  ) => {
    if (next === companionState) return;
    setCompanionMorphing(true);
    window.setTimeout(() => {
      setCompanionState(next);
      setCompanionMorphing(false);
    }, 160);
  };
  useEffect(() => {
    if (!text.trim()) {
      if (companionState === "attentive") companionSetState("idle");
      return;
    }
    if (companionState === "idle") companionSetState("attentive");
  }, [text]);
  useEffect(
    () => () => {
      window.clearTimeout(companionTimer.current);
      window.clearTimeout(companionDecayTimer.current);
      Object.values(confirmTimers.current).forEach((timer) =>
        window.clearTimeout(timer),
      );
    },
    [],
  );
  useEffect(() => {
    const sheet = document.getElementById("letter-view");
    if (!sheet || !viewing) return;
    const nav = document.querySelector(".source-phone-nav, .phone-nav");
    sheet.style.bottom = `${nav instanceof HTMLElement ? nav.offsetHeight : 56}px`;
    return () => {
      sheet.style.removeProperty("bottom");
    };
  }, [viewing]);
  useEffect(() => {
    if (!apiEnabled()) return;
    const refresh = () =>
      Promise.all([listLetters(), listPrintJobs()])
        .then(([items, jobs]) => {
          const byLetter = new Map(jobs.map((job) => [job.letterId, job]));
          setLetters(
            items.map((item, index) =>
              fromBackend(item, index, byLetter.get(item.id)),
            ),
          );
        })
        .catch(() => say("信件读取失败"));
    refresh();
    window.addEventListener(DATA_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(DATA_CHANGED_EVENT, refresh);
  }, []);
  useEffect(() => {
    if (!apiEnabled()) return;
    getSettings()
      .then((settings) => {
        if (typeof settings.recipient === "string" && settings.recipient.trim())
          setRecipient(settings.recipient.trim());
        if (
          !signature &&
          typeof settings.myName === "string" &&
          settings.myName
        )
          setSignature(settings.myName);
      })
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    if (!apiEnabled() || signature) return;
    getSettings()
      .then((settings) => {
        if (typeof settings.myName === "string" && settings.myName)
          setSignature(settings.myName);
      })
      .catch(() => undefined);
  }, [signature]);
  useEffect(() => {
    if (!apiEnabled())
      localStorage.setItem("guozi-letters", JSON.stringify(letters));
    onCountChange(letters.length);
  }, [letters, onCountChange]);
  useEffect(() => () => window.clearTimeout(toastTimer.current), []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && viewing) setViewing(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [viewing]);
  const updateCoupon = (key: keyof CouponFields, value: string) =>
    setCoupon((old) => ({ ...old, [key]: value }));
  const updateRx = (
    key: keyof PrescriptionFields,
    value: string,
    index?: number,
  ) =>
    setPrescription((old) =>
      key === "rp" && index !== undefined
        ? { ...old, rp: old.rp.map((item, i) => (i === index ? value : item)) }
        : { ...old, [key]: value },
    );
  const send = async () => {
    if (!text.trim() && content !== "coupon" && content !== "prescription")
      return;
    const no = Math.max(0, ...letters.map((item) => item.no)) + 1;
    const localLetter: Letter = {
      ...current,
      id: `l-${Date.now()}`,
      no,
      text: text.trim(),
      status: "queued",
    };
    companionSetState("letter");
    companionSay("拿去打印咯～");
    if (apiEnabled()) {
      try {
        const target = recipient.trim() || "Rita";
        const safeSignature = signature.trim() || "我们的小日常";
        const metadata = {
          content,
          fontProfile: readPrintProfile(),
          ...(content === "coupon"
            ? {
                coupon: {
                  name: coupon.title,
                  detail: coupon.detail,
                  code: coupon.code,
                  expiry: coupon.expire,
                  how: coupon.how,
                },
              }
            : {}),
          ...(content === "ghost-stamp" ? { ghostEmoji: ghost } : {}),
          ...(content === "prescription"
            ? {
                prescription: {
                  diagnosis: prescription.diagnosis.trim(),
                  rp: prescription.rp.filter(Boolean),
                  advice: prescription.advice.trim(),
                },
              }
            : {}),
          ...(content === "polaroid" && image?.src
            ? { imageData: image.src }
            : {}),
        };
        const backend = await createLetter({
          title: target,
          body: localLetter.text || `${coupon.title}：${coupon.detail}`,
          signature: safeSignature,
          paper: decoration,
          metadata,
        });
        await createPrintJob(backend.id);
        const devices = await listDevices();
        const printerOnline = devices.some(
          (device) => device.kind === "printer" && device.status === "online",
        );
        setLetters((old) => [
          {
            ...localLetter,
            id: backend.id,
            recipient: target,
            signature: safeSignature,
          },
          ...old,
        ]);
        notifyDataChanged();
        say(
          printerOnline ? "已加入打印队列 ♡" : "打印机未连接，信件已保留在队列",
        );
      } catch {
        say("信件创建失败，请检查 Mac mini 服务");
        return;
      }
    } else {
      setLetters((old) => [localLetter, ...old]);
      say(`已发往打印机 ♡ ${fmtNo(no)}`);
      window.setTimeout(
        () =>
          setLetters((old) =>
            old.map((item) =>
              item.id === localLetter.id
                ? { ...item, status: "printing" }
                : item,
            ),
          ),
        1200,
      );
      window.setTimeout(
        () =>
          setLetters((old) =>
            old.map((item) =>
              item.id === localLetter.id ? { ...item, status: "done" } : item,
            ),
          ),
        3400,
      );
    }
    setText("");
    setImage(undefined);
    setPane("records");
    window.clearTimeout(companionDecayTimer.current);
    companionDecayTimer.current = window.setTimeout(() => {
      companionSetState("happy");
      companionSay("寄出去啦 ♡");
      companionDecayTimer.current = window.setTimeout(
        () => companionSetState("idle"),
        6000,
      );
    }, 3400);
  };
  const remove = async (id: string) => {
    if (confirming !== id) {
      setConfirming(id);
      window.clearTimeout(confirmTimers.current[id]);
      confirmTimers.current[id] = window.setTimeout(() => {
        setConfirming((current) => (current === id ? null : current));
        delete confirmTimers.current[id];
      }, 2500);
      return;
    }
    window.clearTimeout(confirmTimers.current[id]);
    delete confirmTimers.current[id];
    const previous = letters;
    setLetters((old) => old.filter((item) => item.id !== id));
    setConfirming(null);
    try {
      if (apiEnabled()) await deleteLetter(id);
      notifyDataChanged();
      say("已删除这封信");
    } catch {
      setLetters(previous);
      say("删除失败，请稍后再试");
    }
  };
  const onImage = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) setImage(undefined);
    if (file) setImageFile(file);
  };
  const [imageFile, setImageFile] = useState<File | undefined>();
  useEffect(() => {
    if (imageFile) return;
  }, [imageFile]);
  return (
    <div className="page-content letters-page">
      <svg
        width="0"
        height="0"
        style={{ position: "absolute", pointerEvents: "none" }}
        aria-hidden="true"
        dangerouslySetInnerHTML={{ __html: openDesignLetterDefs }}
      />
      <header className="letter-header" data-od-id="letter-header" />
      <div
        className="letter-tabs"
        id="letter-tabs"
        data-od-id="letter-tabs"
        role="tablist"
      >
        <button
          className={`letter-tab ${pane === "compose" ? "active" : ""}`}
          data-pane="compose"
          onClick={() => setPane("compose")}
        >
          写信
        </button>
        <button
          className={`letter-tab ${pane === "records" ? "active" : ""}`}
          data-pane="records"
          onClick={() => setPane("records")}
        >
          记录{" "}
          <span className="cnt" id="records-cnt">
            {letters.length ? `(${letters.length})` : ""}
          </span>
        </button>
      </div>
      <section
        className="pane"
        id="pane-compose"
        data-od-id="pane-compose"
        hidden={pane !== "compose"}
      >
        <div
          className={`letter-companion is-${companionState} ${companionMorphing ? "morphing" : ""} ${companionMorphing ? "morph-in" : ""}`}
          data-od-id="letter-companion"
        >
          <div
            className={`lc-bubble ${companionBubbleShown ? "show" : "hide"}`}
            data-od-id="companion-bubble"
          >
            <span className="lc-bubble-text">{companionBubble}</span>
          </div>
          <svg viewBox="0 0 420 660" aria-label="陪伴小 ghost">
            <g className="lc-squash">
              <use href="#ghost-body" />
              <use
                className="lc-face"
                href={companionState === "happy" ? "#face-happy" : "#face-idle"}
              />
              <use
                className="lc-env"
                href="#envelope"
                visibility={companionState === "letter" ? "visible" : "hidden"}
              />
            </g>
          </svg>
        </div>
        <div className="field-label" id="input-section-label">
          想说的话
        </div>
        <div
          className="input-section"
          id="input-section"
          data-od-id="input-section"
        >
          <textarea
            className="letter-input"
            id="letter-input"
            data-od-id="letter-input"
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={
              content === "polaroid"
                ? "一句话配这张照片…"
                : content === "ghost-stamp"
                  ? "让 ghost 替你带一句话…"
                  : "比如:今天路过花店,想起你笑起来的样子…"
            }
            maxLength={500}
            style={{
              display:
                content === "coupon" || content === "prescription"
                  ? "none"
                  : "",
            }}
          />
          <div
            className="content-extras"
            id="content-extras"
            data-od-id="content-extras"
          >
            {content === "polaroid" && (
              <div className="mod-row">
                <label>
                  照片 <span className="polaroid-stamp">拍立得</span>
                </label>
                <div className="img-picker">
                  <div className="img-thumb">
                    {image?.src ? <img alt="" src={image.src} /> : null}
                  </div>
                  <label className="img-pick-btn">
                    选一张
                    <input
                      type="file"
                      id="mod-img"
                      accept="image/*"
                      onChange={onImage}
                    />
                  </label>
                </div>
                {imageFile && (
                  <DitherImage
                    file={imageFile}
                    onDone={(next) => {
                      setImage(next);
                      setImageFile(undefined);
                    }}
                  />
                )}
              </div>
            )}
            {content === "coupon" && (
              <>
                <Field
                  label="标题"
                  value={coupon.title}
                  onChange={(value) => updateCoupon("title", value)}
                  maxLength={16}
                />
                <Field
                  label="具体内容"
                  value={coupon.detail}
                  onChange={(value) => updateCoupon("detail", value)}
                  maxLength={40}
                />
                <Field
                  label="有效期"
                  value={coupon.expire}
                  onChange={(value) => updateCoupon("expire", value)}
                  maxLength={12}
                />
                <Field
                  label="券  码"
                  value={coupon.code}
                  onChange={(value) => updateCoupon("code", value)}
                  maxLength={12}
                />
                <Field
                  label="使用方式"
                  value={coupon.how}
                  onChange={(value) => updateCoupon("how", value)}
                  maxLength={20}
                />
              </>
            )}
            {content === "ghost-stamp" && (
              <div className="mod-row">
                <label>
                  表情 <span className="ghost-stamp">ghost 邮戳</span>
                </label>
                <div className="ghost-picker" id="ghost-picker">
                  {(["idle", "happy", "sleepy", "letter"] as GhostFace[]).map(
                    (face) => (
                      <button
                        type="button"
                        className={`ghost-pick ${ghost === face ? "sel" : ""}`}
                        data-g={face}
                        key={face}
                        onClick={() => setGhost(face)}
                      >
                        <svg viewBox="0 0 32 32" aria-hidden="true">
                          <use href="#ghost-body" />
                          <use
                            href={
                              face === "happy"
                                ? "#face-happy"
                                : face === "sleepy"
                                  ? "#face-sleepy"
                                  : "#face-idle"
                            }
                          />
                          {face === "letter" && <use href="#envelope" />}
                        </svg>
                      </button>
                    ),
                  )}
                </div>
              </div>
            )}
            {content === "prescription" && (
              <>
                <Field
                  label="诊断"
                  value={prescription.diagnosis}
                  onChange={(value) => updateRx("diagnosis", value)}
                  maxLength={16}
                />
                <div
                  className="mod-row rp-list"
                  style={{ alignItems: "flex-start", flexDirection: "column" }}
                >
                  <label>
                    <span className="rp-stamp">Rp.</span>
                  </label>
                  {prescription.rp.map((item, index) => (
                    <div
                      className="mod-row"
                      style={{ paddingLeft: 0 }}
                      key={index}
                    >
                      <label>{["I", "II", "III", "IV", "V"][index]}.</label>
                      <input
                        value={item}
                        maxLength={20}
                        onChange={(event) =>
                          updateRx("rp", event.target.value, index)
                        }
                      />
                    </div>
                  ))}
                  {prescription.rp.length < 5 && (
                    <button
                      type="button"
                      className="rp-add"
                      onClick={() =>
                        setPrescription((old) => ({
                          ...old,
                          rp: [...old.rp, "新的一项"],
                        }))
                      }
                    >
                      + 加一项
                    </button>
                  )}
                </div>
                <Field
                  label="医嘱"
                  value={prescription.advice}
                  onChange={(value) => updateRx("advice", value)}
                  maxLength={20}
                />
              </>
            )}
          </div>
          <div
            className="deco-extras"
            id="deco-extras"
            data-od-id="deco-extras"
          >
            {decoration === "border" && (
              <div className="mod-row">
                <label>给谁</label>
                <input
                  required
                  value={recipient}
                  maxLength={12}
                  onChange={(event) => setRecipient(event.target.value)}
                  onBlur={() => setRecipient((value) => value.trim() || "Rita")}
                />
              </div>
            )}
            {(decoration === "border" || decoration === "emoji") && (
              <Field
                label="署名"
                value={signature}
                onChange={setSignature}
                maxLength={12}
              />
            )}
          </div>
        </div>
        <div
          className={`paper-segment-header ${collapsed.deco ? "collapsed" : ""}`}
          data-od-id="picker-deco-header"
          onClick={() => setCollapsed((old) => ({ ...old, deco: !old.deco }))}
        >
          装饰风格 <span className="chev">▾</span>
        </div>
        <div
          className="paper-segment"
          id="picker-deco-list"
          data-od-id="picker-deco-list"
          hidden={collapsed.deco}
        >
          {decorations.map(([id, label]) => (
            <button
              type="button"
              className={`paper-card ${decoration === id ? "sel" : ""}`}
              data-axis="deco"
              data-value={id}
              data-od-id={`deco-card-${id}`}
              key={id}
              onClick={() => setDecoration(id)}
            >
              <span className={`mini mini-${id}`}>
                {id === "border" ? (
                  "✽"
                ) : id === "emoji" ? (
                  "♡ ✿ ☺"
                ) : id === "receipt" ? (
                  <>
                    <span>- - - -</span>
                    <span>NO.001</span>
                    <span>- - - -</span>
                  </>
                ) : (
                  "字"
                )}
              </span>
              <span className="nm">{label}</span>
            </button>
          ))}
        </div>
        <div
          className={`paper-segment-header ${collapsed.content ? "collapsed" : ""}`}
          data-od-id="picker-content-header"
          onClick={() =>
            setCollapsed((old) => ({ ...old, content: !old.content }))
          }
        >
          加点内容 <span className="chev">▾</span>
        </div>
        <div
          className="paper-segment-chips"
          id="picker-content-list"
          data-od-id="picker-content-list"
          hidden={collapsed.content}
        >
          <button
            type="button"
            className={`paper-chip ${content === "none" ? "sel" : ""}`}
            data-axis="content"
            data-value="none"
            data-od-id="content-chip-none"
            onClick={() => setContent("none")}
          >
            <span className="ico" aria-hidden="true">
              <svg viewBox="0 0 16 16">
                <rect
                  x="2"
                  y="3"
                  width="12"
                  height="10"
                  rx="1"
                  fill="none"
                  stroke="#2f2a23"
                  strokeWidth="1"
                />
                <path
                  d="M5 8 L11 8"
                  stroke="#2f2a23"
                  strokeWidth="1"
                  fill="none"
                />
              </svg>
            </span>
            无
          </button>
          <button
            type="button"
            className={`paper-chip ${content === "polaroid" ? "sel" : ""}`}
            data-axis="content"
            data-value="polaroid"
            data-od-id="content-chip-polaroid"
            onClick={() => setContent("polaroid")}
          >
            <span className="ico" aria-hidden="true">
              <svg viewBox="0 0 16 16">
                <rect
                  x="1.5"
                  y="2.5"
                  width="13"
                  height="9"
                  rx="1"
                  fill="#fffdf6"
                  stroke="#2f2a23"
                  strokeWidth="1"
                />
                <circle cx="5" cy="6" r="1" fill="#2f2a23" />
              </svg>
            </span>
            拍立得
          </button>
          <button
            type="button"
            className={`paper-chip ${content === "coupon" ? "sel" : ""}`}
            data-axis="content"
            data-value="coupon"
            data-od-id="content-chip-coupon"
            onClick={() => setContent("coupon")}
          >
            <span className="ico" aria-hidden="true">
              <svg viewBox="0 0 16 16">
                <rect
                  x="1.5"
                  y="3"
                  width="13"
                  height="10"
                  rx="1"
                  fill="#fffdf6"
                  stroke="#2f2a23"
                  strokeWidth="1"
                />
                <path
                  d="M3 7 L13 7"
                  stroke="#2f2a23"
                  strokeWidth="1"
                  fill="none"
                />
              </svg>
            </span>
            兑换券
          </button>
          <button
            type="button"
            className={`paper-chip ${content === "ghost-stamp" ? "sel" : ""}`}
            data-axis="content"
            data-value="ghost-stamp"
            data-od-id="content-chip-ghost-stamp"
            onClick={() => setContent("ghost-stamp")}
          >
            <span className="ico" aria-hidden="true">
              <svg viewBox="0 0 16 16">
                <circle
                  cx="8"
                  cy="6.5"
                  r="4.5"
                  fill="#5a5347"
                  stroke="#2f2a23"
                  strokeWidth="1"
                />
                <circle cx="6.5" cy="6.5" r=".7" fill="#2f2a23" />
                <circle cx="9.5" cy="6.5" r=".7" fill="#2f2a23" />
              </svg>
            </span>
            ghost 邮戳
          </button>
          <button
            type="button"
            className={`paper-chip ${content === "prescription" ? "sel" : ""}`}
            data-axis="content"
            data-value="prescription"
            data-od-id="content-chip-prescription"
            onClick={() => setContent("prescription")}
          >
            <span className="ico" aria-hidden="true">
              <svg viewBox="0 0 16 16">
                <rect
                  x="2"
                  y="2"
                  width="12"
                  height="12"
                  rx="1"
                  fill="#fffdf6"
                  stroke="#2f2a23"
                  strokeWidth="1"
                />
                <path
                  d="M4 5 L12 5 M4 8 L10 8 M4 11 L8 11"
                  stroke="#2f2a23"
                  strokeWidth=".7"
                />
              </svg>
            </span>
            关心处方笺
          </button>
        </div>
        <div className="field-label">打印预览</div>
        <div className="preview-wrap">
          <div
            className="preview-meta"
            id="preview-meta-left"
            data-od-id="preview-meta-left"
          >
            <span className="label">行数</span>
            <span id="pm-lines">5</span>
            <span className="label">行</span>
          </div>
          <Receipt letter={current} id="print-preview" />
          <div
            className="preview-meta"
            id="preview-meta-right"
            data-od-id="preview-meta-right"
          >
            <span className="label">约</span>
            <span id="pm-cm">1.8</span>
            <span className="label">cm 纸</span>
          </div>
        </div>
        <button
          type="button"
          className="send-btn"
          id="send-btn"
          data-od-id="send-btn"
          disabled={
            !text.trim() && content !== "coupon" && content !== "prescription"
          }
          onClick={send}
        >
          打印寄出 ♡
        </button>
      </section>
      <section
        className="pane"
        id="pane-records"
        data-od-id="pane-records"
        hidden={pane !== "records"}
      >
        <div className="record-list" id="record-list" data-od-id="record-list">
          {letters.length ? (
            letters.map((letter) => (
              <div className="record-row" data-id={letter.id} key={letter.id}>
                <div className="record-top">
                  <span className="no">{fmtNo(letter.no)}</span>
                  <span>{fmtTs(letter.ts)}</span>
                  <span>· {paperName(letter.decoration, letter.content)}</span>
                  <span className={`st st-${letter.status}`}>
                    {statusLabel[letter.status]}
                  </span>
                </div>
                <div className="record-snippet">
                  {letter.text.split("\n")[0] || "(空)"}
                </div>
                <div className="record-acts">
                  <button
                    type="button"
                    className="view"
                    data-act="view"
                    ref={viewTrigger}
                    onClick={() => setViewing(letter)}
                  >
                    查看全文
                  </button>
                  <button
                    type="button"
                    className={`del ${confirming === letter.id ? "confirm" : ""}`}
                    data-act="del"
                    onClick={() => remove(letter.id)}
                  >
                    {confirming === letter.id ? "确认删除?" : "删除"}
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="records-empty">
              还没有寄出过信 —— 去「写信」写第一封吧 ♡
            </div>
          )}
        </div>
      </section>
      <div
        className="backdrop letters-backdrop"
        id="backdrop"
        hidden={!viewing}
        onClick={() => setViewing(null)}
      />
      <div
        className="letter-view"
        id="letter-view"
        data-od-id="letter-view-sheet"
        hidden={!viewing}
      >
        <div className="letter-view-head">
          <h2 id="letter-view-title">信的原件</h2>
          <button
            type="button"
            className="close-btn"
            id="letter-view-close"
            aria-label="关闭"
            onClick={() => {
              setViewing(null);
              viewTrigger.current?.focus();
            }}
          >
            ×
          </button>
        </div>
        <div className="letter-view-body" id="letter-view-body">
          {viewing && <Receipt letter={viewing} />}
        </div>
        <div className="letter-view-controls" aria-label="切换信件">
          <button type="button" onClick={() => moveViewing(-1)} disabled={viewingIndex <= 0}>
            ‹ 上一封
          </button>
          <span>
            {viewingIndex + 1} / {letters.length}
          </span>
          <button
            type="button"
            onClick={() => moveViewing(1)}
            disabled={viewingIndex < 0 || viewingIndex >= letters.length - 1}
          >
            下一封 ›
          </button>
        </div>
        <div className="letter-view-meta" id="letter-view-meta">
          {viewing &&
            `${fmtNo(viewing.no)} · ${fmtTs(viewing.ts)} · ${paperName(viewing.decoration, viewing.content)} · ${statusLabel[viewing.status]}`}
        </div>
      </div>
      <div
        className={`send-toast ${toast ? "show" : ""}`}
        id="send-toast"
        data-od-id="send-toast"
        role="status"
      >
        {toast}
      </div>
    </div>
  );
}
