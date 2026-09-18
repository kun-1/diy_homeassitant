import { TemplateDataType } from "Data/PrepareData.js";
import { LocalImage } from "./LocalImage.js";

const BIRD_ASSETS = "/Users/rita/working/eink-trmnl-display/server/assets/fugleramme/birds";
const SETS = [
  ["alcedo-atthis-small.png", "parus-major-2-small.png", "hirundo-rustica-2-small.png"],
  ["bubo-bubo-3-small.png", "dendrocopos-major-3-small.png", "columba-oenas-small.png"],
  ["pyrrhula-pyrrhula-2-small.png", "bucephala-clangula-small.png", "alcedo-atthis-small.png"],
] as const;

function dayIndex(data: TemplateDataType) {
  const digits = `${data.dateLabel}${data.weekday}`.replace(/\D/g, "");
  return digits ? Number(digits) % SETS.length : 0;
}

export default function BirdFrame(data: TemplateDataType) {
  const birds = SETS[dayIndex(data)];
  return <main className="bird-frame" aria-label="Fugleramme 鸟类画框">
    <div className="bird-frame__top"><span>FUGLERAMME</span><span>{data.weekday} · {data.dateLabel}</span></div>
    <div className="bird-frame__rule" />
    <div className="bird-frame__scene">
      <div className="bird-frame__sun" />
      {birds.map((bird, index) => <div className={`bird-frame__bird bird-frame__bird--${index + 1}`} key={bird}><LocalImage file={`${BIRD_ASSETS}/${bird}`} /></div>)}
      <div className="bird-frame__branch"><span /></div>
    </div>
    <div className="bird-frame__caption">今日来客 · 安静地陪你一会儿</div>
  </main>;
}
