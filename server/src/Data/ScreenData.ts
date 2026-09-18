export type CalendarEvent = {id:string;time:string;title:string;detail?:string;kind?:'work'|'personal'};
export type ActionCategory = 'todo'|'grocery';
export type ActionItem = {id:string;text:string;category:ActionCategory;completed:boolean};
export type WeatherSnapshot = {temperature:string;label:string};
export type EInkArrangement = {mode:'birds'|'summary'|'schedule'|'todo'|'letters';content:{schedule:boolean;todo:boolean;letters:boolean}};
export type ScreenSnapshot = {calendarEvents:CalendarEvent[];actionItems:ActionItem[];weather?:WeatherSnapshot;config:EInkArrangement};
export interface ScreenDataSource {getSnapshot(now:Date):Promise<ScreenSnapshot>}

const fallbackConfig:EInkArrangement={mode:'birds',content:{schedule:false,todo:false,letters:false}};
const groceryPattern=/牛奶|鸡蛋|面包|蔬菜|水果|买菜|采购|超市|米|油|盐|肉|鱼|纸巾|洗衣液/i;
let cached:ScreenSnapshot|undefined;
type TodayPayload={date:string;config?:EInkArrangement;calendarEvents:Array<{id:string;title:string;startsAt:string;description:string|null;location:string|null}>;todos:Array<{id:string;title:string;completed:boolean;dueDate:string|null}>;weather?:{temperatureC:number;label:string}|null};

function dayInShanghai(value:Date){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(value)}
function timeInShanghai(value:string){return new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(value))}

export class OfficeApiScreenDataSource implements ScreenDataSource {
  private origin:string;
  constructor(origin=process.env['OFFICE_API_ORIGIN']??'http://127.0.0.1:3100'){this.origin=origin}
  async getSnapshot(_now:Date):Promise<ScreenSnapshot>{
    try{
      const response=await fetch(`${this.origin}/api/today`,{signal:AbortSignal.timeout(5000)});
      if(!response.ok)throw new Error(`office api ${response.status}`);
      const payload=await response.json() as TodayPayload;
      const snapshot:ScreenSnapshot={
        config:payload.config??fallbackConfig,
        calendarEvents:payload.calendarEvents.filter(event=>dayInShanghai(new Date(event.startsAt))===payload.date).map(event=>({id:event.id,time:timeInShanghai(event.startsAt),title:event.title,...(event.description||event.location?{detail:[event.description,event.location].filter(Boolean).join(' · ')}:{}),kind:/下班|工作|会议/.test(event.title)?'work':'personal'})),
        actionItems:payload.todos.filter(todo=>todo.dueDate===null||todo.dueDate===payload.date).map(todo=>({id:todo.id,text:todo.title,category:groceryPattern.test(todo.title)?'grocery':'todo',completed:todo.completed})),
        ...(payload.weather?{weather:{temperature:`${Math.round(payload.weather.temperatureC)}°C`,label:payload.weather.label}}:{}),
      };
      cached=snapshot;return snapshot;
    }catch(error){console.error('Office API screen data unavailable',error);return cached??{calendarEvents:[],actionItems:[],config:fallbackConfig};}
  }
}
export function createScreenDataSource():ScreenDataSource{return new OfficeApiScreenDataSource()}
