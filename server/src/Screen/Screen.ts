import {prepareData} from "Data/PrepareData.js";
import {PNGto1BIT} from "./PNGto1BIT.js";
import {ASSETS_FOLDER, SCREEN_THEME, TEMPLATE_FOLDER} from "Config.js";
import App from "Template/JSX/App.js";
import {renderToImage} from "./RenderHTML.js";
import {buildJSX} from "./BuildJSX.js";
import crypto from "crypto";
import {readFileSync} from "node:fs";
import path from "node:path";
import {PNGtoEPD} from "./PNGtoEPD.js";

const headerHtml=readFileSync(TEMPLATE_FOLDER+'/Header.html','utf8');
const qixiPreviewPath=path.join(ASSETS_FOLDER,'qixi-preview.png');
let epdCache:{signature:string;image:Buffer}|undefined;let epdInFlight:{signature:string;promise:Promise<Buffer>}|undefined;
function epdSignature(data:Awaited<ReturnType<typeof prepareData>>):string{return JSON.stringify({weekday:data.weekday,dateLabel:data.dateLabel,letterCount:data.letterCount,calendarEvents:data.calendarEvents,actionItems:data.actionItems,weather:data.weather,showWeather:data.showWeather,config:data.config})}
export async function buildScreen(){const templateData=await prepareData();const html=await buildJSX(App,templateData);const image=await renderToImage(headerHtml+html);return PNGto1BIT(image)}
export async function getScreenHash(){const image=await buildScreen();return crypto.createHash('sha256').update(image).digest('hex')}
export async function buildEpdScreen():Promise<Buffer>{
  if(SCREEN_THEME==='qixi-preview'){if(epdCache?.signature==='qixi-preview')return epdCache.image;const epdImage=await PNGtoEPD(readFileSync(qixiPreviewPath));epdCache={signature:'qixi-preview',image:epdImage};return epdImage;}
  const templateData=await prepareData();const signature=epdSignature(templateData);if(epdCache?.signature===signature)return epdCache.image;if(epdInFlight?.signature===signature)return epdInFlight.promise;
  const promise=(async()=>{const html=await buildJSX(App,templateData);const image=await renderToImage(headerHtml+html);const epdImage=await PNGtoEPD(image);epdCache={signature,image:epdImage};return epdImage})();epdInFlight={signature,promise};try{return await promise}finally{if(epdInFlight?.promise===promise)epdInFlight=undefined}
}
export async function getEpdScreenHash():Promise<string>{const image=await buildEpdScreen();return crypto.createHash('sha256').update(image).digest('hex')}
export async function checkImageUrl(url:string):Promise<boolean>{let response;try{response=await fetch(url)}catch(error:any){console.error(`Failed to check image ${url} - ${error.message}`);return false}if(!response.ok){console.error(`Failed to check image ${url} - got ${response.status} code`);return false}const data=await response.text();if(data.length<1000){console.error(`Failed to check image ${url} - no content`);return false}return true}
