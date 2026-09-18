import { useEffect, useMemo, useRef, useState } from 'react';
import { SourceNavIcon, SourceScheduleIcon, SourceTodoIcon } from './reference-markup';
import { apiEnabled, BackendCalendarEvent, BackendTodo, createCalendarEvent, createTodo, deleteCalendarEvent, deleteTodo, listCalendarEvents, listTodos, updateTodo } from './api';
import { classifyTodo, type TodoKind } from './todo-classifier';

type View = 'month' | 'week';
type ItemType = 'schedule' | 'todo';
type IconId = 'shopping' | 'reading' | 'cooking' | 'social' | 'chores' | 'pet' | 'plants' | 'health' | 'family';
type CalendarItem = { id: string; type: ItemType; date?: string; dueDate?: string; startTime?: string; title: string; iconId: IconId; done?: boolean; note?: string; order: number };
const ymd = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const TODAY = ymd(new Date());
const STORAGE_KEY = 'guozi-items';
const defaultItems: CalendarItem[] = [
  { id: 'sch-1', type: 'schedule', date: TODAY, startTime: '09:30', title: '一起去超市采购', iconId: 'shopping', order: 0 },
  { id: 'sch-2', type: 'schedule', date: TODAY, startTime: '14:30', title: '整理书架 · 写读书笔记', iconId: 'reading', order: 1 },
  { id: 'sch-3', type: 'schedule', date: TODAY, startTime: '19:30', title: '晚餐:番茄牛肉汤', iconId: 'cooking', order: 2 },
  { id: 'sch-4', type: 'schedule', date: TODAY, startTime: '21:30', title: '给爸妈打个电话', iconId: 'social', order: 3 },
  { id: 'td-1', type: 'todo', dueDate: TODAY, title: '换洗床单', iconId: 'chores', done: false, order: 0 },
  { id: 'td-2', type: 'todo', dueDate: TODAY, title: '给 Guozi 加水', iconId: 'pet', done: false, order: 1 },
  { id: 'td-3', type: 'todo', dueDate: TODAY, title: '整理阳台植物', iconId: 'plants', done: false, order: 2 },
  { id: 'td-4', type: 'todo', dueDate: TODAY, title: '预约周末体检', iconId: 'health', done: false, order: 3 },
  { id: 'td-5', type: 'todo', dueDate: TODAY, title: '提醒爸妈吃药', iconId: 'family', done: false, order: 4 },
];
const iconOptions: Array<{ id: IconId; label: string }> = [
  { id: 'shopping', label: '购物' }, { id: 'reading', label: '阅读' }, { id: 'cooking', label: '烹饪' }, { id: 'social', label: '社交' },
  { id: 'chores', label: '家务' }, { id: 'pet', label: '宠物' }, { id: 'plants', label: '植物' }, { id: 'health', label: '医疗' }, { id: 'family', label: '家人' },
];
const scheduleIcons = { shopping: 'shopping', reading: 'reading', cooking: 'cooking', social: 'social' } as const;
const todoIcons = { chores: 'chores', pet: 'pet', plants: 'plants', health: 'health', family: 'family' } as const;
const todoOptions: Array<{ id: TodoKind; label: string }> = [
  { id: 'chores', label: '家务' }, { id: 'pet', label: '宠物' }, { id: 'plants', label: '植物' }, { id: 'health', label: '健康' }, { id: 'family', label: '家人' },
];
const dateFromYmd = (value: string) => { const [y, m, d] = value.split('-').map(Number); return new Date(y, m - 1, d); };
const dayTitle = (date: Date) => `${date.getMonth() + 1}月${date.getDate()}日 周${['日', '一', '二', '三', '四', '五', '六'][date.getDay()]}`;
const dateLabel = (value: string) => value ? dayTitle(dateFromYmd(value)) : '不设截止日期';
const itemsFor = (items: CalendarItem[], date: Date) => items.filter((item) => (item.type === 'schedule' ? item.date : item.dueDate) === ymd(date)).sort((a, b) => a.type === b.type ? a.order - b.order : a.type === 'schedule' ? -1 : 1);
const iconForTitle = (title: string, type: ItemType): IconId => {
  if (type === 'schedule') return title.includes('超市') ? 'shopping' : title.includes('书') ? 'reading' : title.includes('餐') ? 'cooking' : 'social';
  return classifyTodo(title).kind;
};
const fromBackendEvent = (event: BackendCalendarEvent, order: number): CalendarItem => {
  const start = new Date(event.startsAt);
  return { id: event.id, type: 'schedule', date: ymd(start), startTime: String(start.getHours()).padStart(2, '0') + ':' + String(start.getMinutes()).padStart(2, '0'), title: event.title, iconId: iconForTitle(event.title, 'schedule'), note: event.description ?? undefined, order };
};
const fromBackendTodo = (todo: BackendTodo, order: number): CalendarItem => ({ id: todo.id, type: 'todo', dueDate: todo.dueDate ?? undefined, title: todo.title, iconId: iconForTitle(todo.title, 'todo'), done: todo.completed, order });
function cellsFor(cursor: Date) { const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1); const count = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate(); const cells: Date[] = []; for (let i = first.getDay() - 1; i >= 0; i -= 1) cells.push(new Date(cursor.getFullYear(), cursor.getMonth(), -i)); for (let d = 1; d <= count; d += 1) cells.push(new Date(cursor.getFullYear(), cursor.getMonth(), d)); while (cells.length % 7) cells.push(new Date(cursor.getFullYear(), cursor.getMonth(), count + cells.length - first.getDay() + 1)); return cells; }
function loadItems() { try { const raw = localStorage.getItem(STORAGE_KEY); if (raw) return JSON.parse(raw) as CalendarItem[]; localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultItems)); } catch { /* Mock fallback */ } return structuredClone(defaultItems); }
function Icon({ item, className = 'icon' }: { item: CalendarItem; className?: string }) { return <span className={className}>{item.type === 'schedule' ? <SourceScheduleIcon kind={scheduleIcons[item.iconId as keyof typeof scheduleIcons] ?? 'social'} /> : <SourceTodoIcon kind={todoIcons[item.iconId as keyof typeof todoIcons] ?? 'family'} />}</span>; }

export function CalendarPage({ showToast }: { showToast: (message: string) => void }) {
  const [view, setView] = useState<View>('month'); const [cursor, setCursor] = useState(new Date()); const [selected, setSelected] = useState<Date | null>(null); const [items, setItems] = useState<CalendarItem[]>(() => apiEnabled() ? [] : loadItems());
  const [addType, setAddType] = useState<ItemType>('schedule'); const [addOpen, setAddOpen] = useState(false); const [formDate, setFormDate] = useState(TODAY); const [pickerOpen, setPickerOpen] = useState(false); const [pickerCursor, setPickerCursor] = useState(dateFromYmd(TODAY)); const [draftTitle, setDraftTitle] = useState(''); const [todoOverride, setTodoOverride] = useState<TodoKind | null>(null); const [todoTypePickerOpen, setTodoTypePickerOpen] = useState(false);
  const [draggedId, setDraggedId] = useState<string | null>(null); const [dropTarget, setDropTarget] = useState<{ id: string; position: 'above' | 'below' } | null>(null); const [formError, setFormError] = useState(''); const [dirty, setDirty] = useState(false); const [discardOpen, setDiscardOpen] = useState(false);
  const addTrigger = useRef<HTMLButtonElement | null>(null); const detailTrigger = useRef<HTMLButtonElement | null>(null); const dragTimer = useRef<number | null>(null); const apiHydrated = useRef(false); const apiSyncing = useRef(new Set<string>());
  useEffect(() => {
    if (apiEnabled()) {
      Promise.all([listCalendarEvents(), listTodos()]).then(([events, todos]) => { setItems([...events.map((event, index) => fromBackendEvent(event, index)), ...todos.map((todo, index) => fromBackendTodo(todo, index))]); apiHydrated.current = true; }).catch(() => showToast('日历读取失败'));
      return;
    }
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); } catch { /* Mock storage */ }
  }, []);
  useEffect(() => {
    if (!apiEnabled() || !apiHydrated.current) return;
    const pending = items.filter((item) => /^(schedule|todo)-[0-9]+$/.test(item.id) && !apiSyncing.current.has(item.id));
    pending.forEach((item) => {
      apiSyncing.current.add(item.id);
      const task = item.type === 'schedule'
        ? createCalendarEvent({ title: item.title, startsAt: new Date(item.date + 'T' + (item.startTime ?? '09:00') + ':00').toISOString(), endsAt: new Date(new Date(item.date + 'T' + (item.startTime ?? '09:00') + ':00').getTime() + 3600000).toISOString(), description: item.note ?? null, location: null })
        : createTodo({ title: item.title, completed: Boolean(item.done), dueDate: item.dueDate ?? null });
      task.then((created) => {
        setItems((current) => current.map((candidate) => candidate.id === item.id ? (item.type === 'schedule' ? fromBackendEvent(created as BackendCalendarEvent, candidate.order) : fromBackendTodo(created as BackendTodo, candidate.order)) : candidate));
      }).catch(() => { apiSyncing.current.delete(item.id); showToast('新增内容同步失败'); });
    });
  }, [items, showToast]);
  const closeDetail = () => { setSelected(null); detailTrigger.current?.focus(); };
  const closeAdd = () => { if (dirty) setDiscardOpen(true); else { setAddOpen(false); setPickerOpen(false); addTrigger.current?.focus(); } };
  useEffect(() => { const key = (event: KeyboardEvent) => { if (event.key !== 'Escape') return; if (pickerOpen) setPickerOpen(false); else if (discardOpen) setDiscardOpen(false); else if (addOpen) closeAdd(); else if (selected) closeDetail(); }; window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key); });
  const monthCells = useMemo(() => cellsFor(cursor), [cursor]); const pickerCells = useMemo(() => cellsFor(pickerCursor), [pickerCursor]); const weekDays = useMemo(() => { const start = new Date(cursor); start.setDate(cursor.getDate() - cursor.getDay()); return Array.from({ length: 7 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)); }, [cursor]); const todayItems = itemsFor(items, dateFromYmd(TODAY));
  const shift = (amount: number) => setCursor((date) => { const next = new Date(date); view === 'month' ? next.setMonth(next.getMonth() + amount) : next.setDate(next.getDate() + amount * 7); return next; });
  const openAdd = (date = selected ?? dateFromYmd(TODAY)) => { setFormDate(ymd(date)); setPickerCursor(date); setPickerOpen(false); setFormError(''); setDirty(false); setDraftTitle(''); setTodoOverride(null); setTodoTypePickerOpen(false); setAddType('schedule'); setAddOpen(true); };
  const toggleItem = async (item: CalendarItem) => {
    const done = !item.done;
    setItems((current) => current.map((candidate) => candidate.id === item.id ? { ...candidate, done } : candidate));
    if (!apiEnabled()) return;
    try { await updateTodo(item.id, { completed: done }); } catch { showToast('待办同步失败'); }
  };
  const deleteItem = async (item: CalendarItem) => {
    setItems((current) => current.filter((candidate) => candidate.id !== item.id));
    if (!apiEnabled()) return;
    try { if (item.type === 'schedule') await deleteCalendarEvent(item.id); else await deleteTodo(item.id); } catch { showToast('删除同步失败'); }
  };
  const chooseDate = (date: Date) => { setFormDate(ymd(date)); setPickerCursor(date); setPickerOpen(false); setDirty(true); };
  const autoTodo = classifyTodo(draftTitle);
  const effectiveTodoKind = todoOverride ?? autoTodo.kind;
  const effectiveTodoLabel = todoOverride ? todoOptions.find((option) => option.id === todoOverride)?.label ?? autoTodo.label : autoTodo.label;
  const reorder = (sourceId: string, targetId: string, above: boolean, date: Date) => setItems((current) => { const group = itemsFor(current, date); const source = group.findIndex((item) => item.id === sourceId); const target = group.findIndex((item) => item.id === targetId); if (source < 0 || target < 0 || group[source].type !== group[target].type) return current; const moved = group.splice(source, 1)[0]; const at = group.findIndex((item) => item.id === targetId); group.splice(above ? at : at + 1, 0, moved); const order = new Map(group.map((item, index) => [item.id, index])); return current.map((item) => order.has(item.id) ? { ...item, order: order.get(item.id)! } : item); });
  const pointerStart = (event: React.PointerEvent<HTMLDivElement>, item: CalendarItem) => {
    if (event.pointerType === 'mouse' || item.type !== 'todo') return;
    dragTimer.current = window.setTimeout(() => { setDraggedId(item.id); setDropTarget(null); showToast('拖动中 · 目标位置显示插入线'); }, 180);
  };
  const pointerEnd = () => { if (dragTimer.current) window.clearTimeout(dragTimer.current); dragTimer.current = null; if (draggedId) { if (dropTarget && selected) reorder(draggedId, dropTarget.id, dropTarget.position === 'above', selected); setDraggedId(null); setDropTarget(null); showToast(apiEnabled() ? '待办顺序已更新（当前页面）' : '待办顺序已更新'); } };
  useEffect(() => {
    if (!draggedId || !selected) return undefined;
    const source = items.find((item) => item.id === draggedId);
    if (!source || source.type !== 'todo') return undefined;

    const handleMove = (event: PointerEvent) => {
      if (event.pointerType === 'mouse') return;
      event.preventDefault();
      const element = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-calendar-item]');
      if (!element) { setDropTarget(null); return; }
      const targetId = element.dataset.calendarItem;
      const targetType = element.dataset.itemType;
      if (!targetId || targetId === draggedId || targetType !== source.type) { setDropTarget(null); return; }
      const rect = element.getBoundingClientRect();
      const position = event.clientY - rect.top < rect.height / 2 ? 'above' : 'below';
      setDropTarget((current) => current?.id === targetId && current.position === position ? current : { id: targetId, position });
    };
    const handleEnd = () => pointerEnd();
    window.addEventListener('pointermove', handleMove, { passive: false });
    window.addEventListener('pointerup', handleEnd);
    window.addEventListener('pointercancel', handleEnd);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleEnd);
      window.removeEventListener('pointercancel', handleEnd);
    };
  }, [draggedId, selected, items, dropTarget]);
  return <div className="calendar-page"><div className="calendar-scroll">
    <header className="cal-header"><div className="cal-title"><button className="chev" onClick={() => shift(-1)}>‹</button><h1>{cursor.getFullYear()} 年 {cursor.getMonth() + 1} 月</h1><button className="chev" onClick={() => shift(1)}>›</button></div><div className="seg"><button className={`seg-btn ${view === 'month' ? 'active' : ''}`} onClick={() => setView('month')}>月</button><button className={`seg-btn ${view === 'week' ? 'active' : ''}`} onClick={() => setView('week')}>周</button></div></header>
    {view === 'month' ? <><div className="weekday-row"><span className="sun">日</span><span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span className="sat">六</span></div><div className="month-grid">{monthCells.map((date) => { const list = itemsFor(items, date); return <button key={ymd(date)} className={`day-cell ${date.getMonth() !== cursor.getMonth() ? 'cross-month' : ''} ${ymd(date) === TODAY ? 'today' : ''}`} onClick={(event) => { detailTrigger.current = event.currentTarget; setSelected(date); }} onDoubleClick={() => openAdd(date)}><span className="num">{date.getDate()}</span><span className="markers">{list.slice(0, 3).map((item) => <i key={item.id} className={`marker ${item.type === 'schedule' ? 'sch' : 'todo'}`} />)}</span></button>; })}</div><button className="today-peek" onClick={() => setSelected(dateFromYmd(TODAY))}><div className="today-peek-head"><span className="t">今天 · {dateFromYmd(TODAY).getMonth() + 1}月{dateFromYmd(TODAY).getDate()}日</span><span className="n">{todayItems.length} 条</span></div>{todayItems.length ? todayItems.slice(0, 3).map((item) => <div className="peek-row" key={item.id}><Icon item={item} /><span className="time">{item.startTime ?? '待办'}</span><span className="text">{item.title}</span></div>) : <div className="calendar-empty-action">今天还没有安排，点这里添加一条</div>}</button></> : <div className="week-grid">{weekDays.map((date) => { const list = itemsFor(items, date); return <button className={`week-row ${ymd(date) === TODAY ? 'today-row' : ''}`} key={ymd(date)} onClick={() => setSelected(date)}><span className="week-day-label"><span className="day-name">周{['日', '一', '二', '三', '四', '五', '六'][date.getDay()]}</span><span className="date">{date.getMonth() + 1}/{date.getDate()}</span></span><span className="week-row-items">{list.map((item) => <span className="week-item" key={item.id}><Icon item={item} /><span className="time">{item.startTime ?? '待办'}</span><span className="text">{item.title}</span></span>)}{!list.length && <span className="week-empty">· 空 · 点击添加</span>}</span></button>; })}</div>}
    <button ref={addTrigger} className="fab" onClick={() => openAdd()} aria-label="记一条"><span>＋</span>记一条</button>
  </div>
    {selected && <div className="backdrop" onClick={closeDetail}><section className="day-detail" onClick={(event) => event.stopPropagation()}><div className="day-detail-header"><h2>{dayTitle(selected)}</h2><button className="close-btn" onClick={closeDetail}>×</button></div><ul className="day-items">{(['schedule', 'todo'] as ItemType[]).map((type) => { const group = itemsFor(items, selected).filter((item) => item.type === type); return <li key={type}><div className="section-head"><span>{type === 'schedule' ? '安排 · 到点发生' : '待办 · 做完才算'}</span><span className="count">{group.length ? `${group.length} 条` : '空'}</span></div>{group.map((item) => <div data-calendar-item={item.id} data-item-type={item.type} className={`item-row ${item.done ? 'done' : ''} ${draggedId === item.id ? 'dragging' : ''} ${dropTarget?.id === item.id ? `drop-${dropTarget.position}` : ''}`} key={item.id} draggable={item.type === 'todo'} onPointerDown={(event) => pointerStart(event, item)} onDragStart={() => { if (item.type === 'todo') setDraggedId(item.id); }} onDragOver={(event) => { event.preventDefault(); if (!draggedId || draggedId === item.id || items.find((candidate) => candidate.id === draggedId)?.type !== item.type) return; const rect = event.currentTarget.getBoundingClientRect(); setDropTarget({ id: item.id, position: event.clientY - rect.top < rect.height / 2 ? 'above' : 'below' }); }} onDrop={(event) => { event.preventDefault(); if (draggedId && dropTarget) reorder(draggedId, item.id, dropTarget.position === 'above', selected); setDraggedId(null); setDropTarget(null); }} onDragEnd={() => { setDraggedId(null); setDropTarget(null); }}><span className="handle">⋮⋮</span><Icon item={item} /><span className="time">{item.startTime ?? ''}</span><span className="text">{item.title}</span><span className="actions">{item.type === 'todo' && <button onClick={() => toggleItem(item)}>{item.done ? '✓' : '□'}</button>}<button onClick={() => deleteItem(item)}>×</button></span></div>)}</li>; })}</ul><button className="add-item-from-sheet" onClick={() => openAdd(selected)}>+ 加一条</button></section></div>}
    {addOpen && <div className="backdrop" onClick={closeAdd}><section className="add-sheet" onClick={(event) => event.stopPropagation()}><div className="add-tabs"><button type="button" className={`add-tab ${addType === 'schedule' ? 'active' : ''}`} onClick={() => { setAddType('schedule'); setPickerOpen(false); setTodoTypePickerOpen(false); }}>安排</button><button type="button" className={`add-tab ${addType === 'todo' ? 'active' : ''}`} onClick={() => { setAddType('todo'); setPickerOpen(false); setTodoOverride(null); setTodoTypePickerOpen(false); }}>待办</button></div><form className="add-form" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); const title = String(form.get('title') ?? '').trim(); const type = addType; const date = String(form.get('date') ?? formDate); const time = String(form.get('time') ?? ''); if (!title) { setFormError('请先写下标题'); return; } if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(dateFromYmd(date).getTime())) { setFormError('日期格式不正确'); return; } if (type === 'schedule' && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) { setFormError('请输入有效时间'); return; } const iconId = type === 'todo' ? (todoOverride ?? classifyTodo(title).kind) : String(form.get('iconId')) as IconId; const note = String(form.get('note') ?? '').trim(); setItems((current) => [...current, { id: `${type}-${Date.now()}`, type, title, iconId, order: itemsFor(current, dateFromYmd(date)).length, ...(type === 'schedule' ? { date, startTime: time } : { dueDate: date, done: false }), ...(note ? { note } : {}) }]); setAddOpen(false); setPickerOpen(false); setTodoTypePickerOpen(false); setDirty(false); setSelected(null); setFormError(''); showToast(apiEnabled() ? `已加入${type === 'schedule' ? '日历' : '待办'}，正在同步` : `已加入${type === 'schedule' ? '日历' : '待办'}`); }}><label>标题<input name="title" placeholder="比如:整理书架" autoFocus value={draftTitle} onChange={(event) => { setDraftTitle(event.target.value); setTodoOverride(null); setDirty(true); setFormError(''); }} />{formError && <small className="inline-error">{formError}</small>}</label>{addType === 'schedule' && <label className="date-field-label">日期与时间<div className="date-time-field"><button type="button" className={`date-field ${pickerOpen ? 'active' : ''}`} onClick={() => { setPickerCursor(dateFromYmd(formDate)); setPickerOpen(true); }}><span>{dateLabel(formDate)}</span><span>⌄</span></button><span className="date-time-divider">·</span><input name="time" type="time" defaultValue="09:00" required onChange={() => setDirty(true)} /></div></label>}<input name="date" type="hidden" value={formDate} readOnly />{pickerOpen && <div className="date-picker-overlay" onClick={() => setPickerOpen(false)}><div className="date-picker" role="dialog" aria-label="选择日期" onClick={(event) => event.stopPropagation()}><div className="date-picker-head"><button type="button" onClick={() => setPickerCursor((date) => new Date(date.getFullYear(), date.getMonth() - 1, 1))}>‹</button><strong>{pickerCursor.getFullYear()} 年 {pickerCursor.getMonth() + 1} 月</strong><button type="button" onClick={() => setPickerCursor((date) => new Date(date.getFullYear(), date.getMonth() + 1, 1))}>›</button></div><div className="date-picker-weekdays"><span className="sun">日</span><span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span className="sat">六</span></div><div className="date-picker-grid">{pickerCells.map((date) => <button type="button" key={ymd(date)} className={`date-picker-cell ${date.getMonth() !== pickerCursor.getMonth() ? 'cross-month' : ''} ${ymd(date) === formDate ? 'selected' : ''}`} onClick={() => chooseDate(date)}>{date.getDate()}</button>)}</div><button type="button" className="date-picker-clear" onClick={() => chooseDate(new Date())}>今天</button><button type="button" className="date-picker-close" onClick={() => setPickerOpen(false)}>关闭</button></div></div>}<label>备注<textarea name="note" rows={2} onChange={() => setDirty(true)} /></label>{addType === 'schedule' ? <label>图标<select name="iconId" defaultValue="shopping">{iconOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label> : <div className="auto-type-block"><div className="auto-type-row"><span className="auto-type-icon"><SourceTodoIcon kind={effectiveTodoKind} /></span><span className="auto-type-copy"><strong>{todoOverride ? `已选 · ${effectiveTodoLabel}` : `自动识别 · ${effectiveTodoLabel}`}</strong><small>{todoOverride ? '已按你的选择保存' : autoTodo.confidence === 'low' ? '我不太确定，可以改一下' : '会根据标题自动选择图标'}</small></span><button type="button" className="auto-type-edit" onClick={() => setTodoTypePickerOpen((open) => !open)}>{todoTypePickerOpen ? '收起' : '改分类'}</button></div>{todoTypePickerOpen && <div className="auto-type-options">{todoOptions.map((option) => <button type="button" key={option.id} className={effectiveTodoKind === option.id ? 'active' : ''} onClick={() => { setTodoOverride(option.id); setTodoTypePickerOpen(false); setDirty(true); }}>{option.label}</button>)}</div>}</div>}<div className="actions"><button type="button" onClick={closeAdd}>取消</button><button type="submit" className="primary">保存</button></div></form></section></div>}
  {discardOpen && <div className="confirm-backdrop" onClick={() => setDiscardOpen(false)}><section className="confirm-dialog" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}><h2>未保存的修改</h2><p>要丢弃还没保存的内容吗？</p><div className="actions"><button type="button" onClick={() => setDiscardOpen(false)}>继续编辑</button><button type="button" className="primary" onClick={() => { setDiscardOpen(false); setAddOpen(false); setDirty(false); setPickerOpen(false); addTrigger.current?.focus(); }}>丢弃</button></div></section></div>}
  </div>;
}
export function CalendarNavIcon({ kind }: { kind: 'home' | 'calendar' | 'we' | 'settings' }) { return <SourceNavIcon kind={kind} />; }
