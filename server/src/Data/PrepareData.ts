import {TIMEZONE} from "Config.js";
import {HackerNewsData} from "Data/HackerNewsData.js";
import {getDisplayState, DisplayState, getReminder, listMessages, LoveMessage} from "Love/Store.js";
import {CalendarEvent, createScreenDataSource, EInkArrangement, ScreenSnapshot} from "Data/ScreenData.js";

export type TemplateDataType={time:string;hackerNews:HackerNewsData;message:LoveMessage|undefined;display:DisplayState;letterCount:number;weekday:string;dateLabel:string;calendarEvents:CalendarEvent[];actionItems:ScreenSnapshot['actionItems'];weather:ScreenSnapshot['weather'];showWeather:boolean;config:EInkArrangement};
const dataSource=createScreenDataSource();

export async function prepareData():Promise<TemplateDataType>{
  const now=new Date();const snapshot=await dataSource.getSnapshot(now);const reminder=getReminder();
  const reminderText=reminder.text.split('\n').map(part=>part.trim()).filter(Boolean);
  const reminderEvent:CalendarEvent|undefined=reminder.enabled?{id:'work-end-reminder',time:reminder.workEndTime,title:reminderText[0]??'下班提醒',detail:reminderText.slice(1).join(' '),kind:'work'}:undefined;
  const calendarEvents=reminderEvent?[reminderEvent,...snapshot.calendarEvents]:snapshot.calendarEvents;
  const messages=listMessages();const parts=new Intl.DateTimeFormat('zh-CN',{timeZone:TIMEZONE,month:'numeric',day:'numeric'}).formatToParts(now);
  const month=parts.find(part=>part.type==='month')?.value??'';const day=parts.find(part=>part.type==='day')?.value??'';
  return {time:now.toLocaleTimeString('zh-CN',{timeZone:TIMEZONE,hour:'2-digit',minute:'2-digit'}),hackerNews:[],message:messages[0],display:getDisplayState(),letterCount:messages.filter(message=>message.status==='waiting').length,weekday:new Intl.DateTimeFormat('zh-CN',{timeZone:TIMEZONE,weekday:'short'}).format(now),dateLabel:`${month}月${day}日`,calendarEvents,actionItems:snapshot.actionItems,weather:snapshot.weather,showWeather:Boolean(snapshot.weather),config:snapshot.config};
}
