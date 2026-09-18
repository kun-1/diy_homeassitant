import {afterEach,describe,expect,it} from 'vitest';
import {openDb} from '../src/db.js';
import {CalendarProviderError,GoogleCalendarProvider,createCalendarProvider} from '../src/providers/calendar.js';
import {buildApp} from '../src/app.js';

const input={title:'一起吃饭',startsAt:'2026-08-17T18:00:00.000Z',endsAt:'2026-08-17T19:00:00.000Z',description:null,location:null};
const dbs:ReturnType<typeof openDb>[]=[];
afterEach(()=>dbs.splice(0).forEach((db)=>db.close()));

describe('CalendarProvider boundary',()=>{
  it('uses MockCalendarProvider by default and supports list/create/update/delete',()=>{
    const db=openDb(':memory:'); dbs.push(db);
    const provider=createCalendarProvider(db);
    expect(provider.status).toEqual({provider:'mock',enabled:true,mode:'mock'});
    const created=provider.create(input);
    expect(provider.list()).toEqual([created]);
    const updated=provider.update(created.id,{title:'一起吃晚饭'});
    expect(updated?.title).toBe('一起吃晚饭');
    expect(provider.update('missing',{title:'不存在'})).toBeNull();
    expect(provider.delete(created.id)).toBe(true);
    expect(provider.delete(created.id)).toBe(false);
    expect(provider.list()).toEqual([]);
  });

  it('keeps Google reserved and disabled without pretending to call OAuth/API',()=>{
    const provider=new GoogleCalendarProvider();
    expect(provider.status).toMatchObject({provider:'google',enabled:false,mode:'disabled'});
    for (const operation of [
      () => provider.list(),
      () => provider.create(input),
      () => provider.update('event-1',{title:'x'}),
      () => provider.delete('event-1'),
    ]) {
      expect(operation).toThrowError(CalendarProviderError);
      try { operation(); } catch (error) {
        expect(error).toMatchObject({code:'CALENDAR_PROVIDER_DISABLED',provider:'google'});
      }
    }
  });

  it('wires the provider selection into the HTTP boundary', async()=>{
    const mockApp=buildApp(':memory:','mock');
    const mockHealth=await mockApp.inject('/api/health');
    expect(mockHealth.json().calendarProvider).toEqual({provider:'mock',enabled:true,mode:'mock'});
    await mockApp.close();

    const googleApp=buildApp(':memory:','google');
    const googleHealth=await googleApp.inject('/api/health');
    expect(googleHealth.json().calendarProvider).toMatchObject({provider:'google',enabled:false,mode:'disabled'});
    const list=await googleApp.inject('/api/calendar/events');
    expect(list.statusCode).toBe(503);
    expect(list.json()).toMatchObject({code:'CALENDAR_PROVIDER_DISABLED',provider:'google'});
    await googleApp.close();
  });
});
