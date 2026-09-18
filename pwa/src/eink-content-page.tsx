import { useEffect, useMemo, useState } from 'react';
import { apiEnabled, loadEInkState, updateEInkConfig, type EInkState } from './api';
import { arrangementLabel, defaultEInkArrangement, normalizeEInkArrangement, visibleEInkContent, type EInkArrangement, type EInkContentKey, type EInkDisplayMode } from './eink-content-model';

const arrangementStorageKey = 'guozi-eink-arrangement';
const modeOptions: Array<{ id: EInkDisplayMode; label: string }> = [
  { id: 'birds', label: '鸟类画框' }, { id: 'summary', label: '今日摘要' }, { id: 'schedule', label: '只看日程' }, { id: 'todo', label: '只看待办' }, { id: 'letters', label: '只看信件' },
];
const contentOptions: Array<{ id: EInkContentKey; label: string }> = [
  { id: 'schedule', label: '日程' }, { id: 'todo', label: '待办' }, { id: 'letters', label: '信件提醒' },
];

function readArrangement(): EInkArrangement {
  try { return normalizeEInkArrangement(JSON.parse(localStorage.getItem(arrangementStorageKey) || 'null')); } catch { return defaultEInkArrangement; }
}

export function EInkContentPage({ showToast }: { showToast: (message: string) => void }) {
  const [arrangement, setArrangement] = useState(readArrangement);
  const [state, setState] = useState<EInkState | null>(null);
  const [etag, setEtag] = useState<string | undefined>();
  const [lastResult, setLastResult] = useState<'updated' | 'unchanged' | 'error'>('updated');
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const result = await loadEInkState(etag);
      if (result.state) {
        setState(result.state);
        if (result.state.config) {
          setArrangement(result.state.config);
          localStorage.setItem(arrangementStorageKey, JSON.stringify(result.state.config));
        }
      }
      if (result.etag) setEtag(result.etag);
      setLastResult(result.unchanged ? 'unchanged' : 'updated');
    } catch {
      setLastResult('error');
    } finally { setLoading(false); }
  };
  useEffect(() => { void refresh(); }, []);

  const visible = visibleEInkContent(arrangement);
  const eink = state?.devices.find((device) => device.kind === 'eink');
  const esp32 = state?.devices.find((device) => device.kind === 'esp32');
  const deviceOffline = Boolean(eink && eink.status !== 'online') || Boolean(esp32 && esp32.status !== 'online');
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  const saveArrangement = (next: EInkArrangement) => {
    setArrangement(next);
    localStorage.setItem(arrangementStorageKey, JSON.stringify(next));
    if (!apiEnabled()) { showToast('编排偏好已保存在本机'); return; }
    void updateEInkConfig(next).then((saved) => {
      setArrangement(saved);
      localStorage.setItem(arrangementStorageKey, JSON.stringify(saved));
      setEtag(undefined);
      showToast('已下发到 Mac mini，屏幕将在下一次拉取时更新');
    }).catch(() => {
      setLastResult('error');
      showToast('下发失败，已保留本机编辑');
    });
  };
  const previewState = state ?? { revision: 0, generatedAt: '', unreadLetterCount: 0, calendarEvents: [], todos: [], devices: [] };
  const previewEvents = useMemo(() => previewState.calendarEvents.slice(0, 3), [previewState.calendarEvents]);
  const previewTodos = useMemo(() => previewState.todos.slice(0, 4), [previewState.todos]);

  return <section className="settings-card eink-content-card" aria-labelledby="eink-content-title">
    <div className="settings-card-head eink-content-head"><span className="source-svg settings-card-icon eink-mark" aria-hidden="true">▧</span><span className="settings-card-label" id="eink-content-title">E-ink 内容</span><span className={`settings-chip ${deviceOffline || offline ? 'off' : 'on'}`}>{deviceOffline || offline ? '暂不可达' : '状态可读'}</span></div>
    {(offline || deviceOffline) && <p className="eink-warning" role="status">{offline ? '当前网络离线，下面保留最近一次预览；无法读取设备最新状态。' : 'E-ink/ESP32 当前离线，仍可编辑本机编排和预览，设备恢复后再读取。'}</p>}
    <div className="eink-section-label">显示模式</div>
    <div className="settings-seg eink-mode-seg" role="group" aria-label="E-ink 显示模式">{modeOptions.map((option) => <button type="button" key={option.id} className={arrangement.mode === option.id ? 'on' : ''} aria-pressed={arrangement.mode === option.id} onClick={() => saveArrangement({ ...arrangement, mode: option.id })}>{option.label}</button>)}</div>
    {arrangement.mode !== 'birds' && <><div className="eink-section-label">内容选择 <small>摘要模式可多选</small></div>
    <div className="eink-content-checks">{contentOptions.map((option) => <label key={option.id} className={arrangement.mode !== 'summary' ? 'disabled' : ''}><input type="checkbox" checked={arrangement.content[option.id]} disabled={arrangement.mode !== 'summary'} onChange={(event) => saveArrangement({ ...arrangement, content: { ...arrangement.content, [option.id]: event.target.checked } })} />{option.label}</label>)}</div></>}
    <div className="eink-preview-label"><span>预览 · {arrangementLabel(arrangement.mode)}</span><span>{state ? `revision ${state.revision}` : '尚未读取'}</span></div>
    <div className={`eink-paper ${arrangement.mode === 'birds' ? 'eink-paper--birds' : ''}`} aria-label="E-ink 内容预览">
      <div className="eink-paper-head"><strong>GUOZI</strong><span>{state ? new Date(state.generatedAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '预览'}</span></div>
      {arrangement.mode === 'birds' && <div className="eink-bird-preview"><img src={`/api/eink/preview?revision=${state?.revision ?? 0}`} alt="实际 E-ink 鸟类画框预览" /><strong>与实体屏幕同源预览</strong><small>日历和待办保留在手机端</small></div>}
      {visible.schedule && <div className="eink-paper-block"><b>日程</b>{previewEvents.length ? previewEvents.map((event) => <div key={event.id}>{new Date(event.startsAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}　{event.title}</div>) : <small>暂无日程</small>}</div>}
      {visible.todo && <div className="eink-paper-block"><b>待办</b>{previewTodos.length ? previewTodos.map((todo) => <div key={todo.id}>{todo.completed ? '✓' : '□'} {todo.title}</div>) : <small>暂无待办</small>}</div>}
      {visible.letters && <div className="eink-paper-block"><b>信件</b><div>{previewState.unreadLetterCount ? `有 ${previewState.unreadLetterCount} 封未读信件` : '没有未读信件'}</div></div>}
      {!visible.schedule && !visible.todo && !visible.letters && arrangement.mode !== 'birds' && <div className="eink-empty">至少选择一项内容</div>}
    </div>
    <div className="eink-status-row" role="status"><span>{lastResult === 'unchanged' ? '内容未变化 · 设备无需重刷' : lastResult === 'error' ? '读取失败 · 保留现有预览' : state ? `已读取 revision ${state.revision}` : '等待读取状态'}</span><button className="settings-mini" type="button" onClick={() => void refresh()} disabled={loading}>{loading ? '读取中' : '刷新状态'}</button></div>
    <p className="eink-contract-note">编排保存到 Mac mini 并增加 revision；ESP32 只在渲染内容真正变化时刷新。离线编辑会保留在本机。</p>
  </section>;
}
