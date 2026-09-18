import { StrictMode, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  CircleUserRound,
  MoreHorizontal,
  Settings,
  Wifi,
} from 'lucide-react';
import { BackendDevice, BackendLetter, BackendPrintJob, Device, LetterPaper, TodayData, TodoItem, MacMiniStatus, apiEnabled, createLetter, createPrintJob, deleteLetter, getMacMiniStatus, listCalendarEvents, listDevices, listLetters, listPrintJobs, listTodos, loadToday, updateLetter, updateTodo } from './api';
import { GhostActivity, type GhostActivityHandle, type GhostActivityState, type GhostActivityEvent, type GhostAlertKind } from './ghost-activity';
import { SourceDeviceIcon, SourceMailIcon, SourceNavIcon, SourceScheduleHeading, SourceScheduleIcon, SourceSettingsIcon, SourceTodoHeading, SourceTodoIcon, SourceWeatherIcon, SettingsIconKind } from './reference-markup';
import { CalendarPage } from './calendar-page';
import { EInkContentPage } from './eink-content-page';
import { LettersPage as FormalLettersPage } from './letters-page';
import { countSentLetters } from './letter-stats';
import './styles.css';
import { getCached } from './offline-store';

type Tab = 'today' | 'calendar' | 'letters' | 'we' | 'more';

function useEscape(onEscape: () => void, enabled = true) {
  useEffect(() => {
    if (!enabled) return undefined;
    const handler = (event: KeyboardEvent) => { if (event.key === 'Escape') onEscape(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [enabled, onEscape]);
}

function App() {
  const [activeTab, setActiveTab] = useState<Tab>('today');
  const [weDirty, setWeDirty] = useState(false);
  const [pendingTab, setPendingTab] = useState<Tab | null>(null);
  const [navDiscardOpen, setNavDiscardOpen] = useState(false);
  const [data, setData] = useState<TodayData | null>(null);
  const [error, setError] = useState('');
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [toast, setToast] = useState('');
  const [letterCount, setLetterCount] = useState(() => apiEnabled() ? 0 : normalizeLetters(readLocal<unknown>('guozi-letters', seededLetters)).length);
  const ghostRef = useRef<GhostActivityHandle>(null);

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast((current) => current === message ? '' : current), 2400);
  };

  useEffect(() => {
    if (!apiEnabled()) return undefined;
    let cancelled = false;
    const refreshLetterCount = () => Promise.all([listLetters(), listPrintJobs()])
      .then(([letters, jobs]) => {
        if (cancelled) return;
        setLetterCount(countSentLetters(letters, jobs));
      })
      .catch(() => undefined);
    refreshLetterCount();
    const timer = window.setInterval(refreshLetterCount, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (activeTab !== 'today') return;
    let cancelled = false;
    if (apiEnabled()) getCached<TodayData>('/api/today').then((cached) => {
      if (!cancelled && cached) { setData(cached); setTodos(cached.todos); }
    }).catch(() => undefined);
    const refreshToday = () => {
      loadToday().then((next) => {
        if (cancelled) return;
        setData(next);
        setTodos(next.todos);
        setError('');
      }).catch(() => {
        if (!cancelled) setError('暂时无法读取今天的内容，请稍后再试。');
      });
    };

    refreshToday();
    const timer = window.setInterval(refreshToday, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [activeTab]);

  const unread = data?.unreadLetterCount ?? 0;
  const toggleTodo = (id: string) => {
    const current = todos.find((item) => item.id === id);
    if (!current) return;
    const completed = !current.completed;
    setTodos((items) => items.map((item) => item.id === id ? { ...item, completed } : item));
    if (completed) {
      const allDone = todos.every((item) => item.id === id ? true : item.completed);
      ghostRef.current?.trigger(allDone ? 'all-done' : 'todo-done');
    }
    if (apiEnabled()) {
      updateTodo(id, { completed }).catch(() => {
        setTodos((items) => items.map((item) => item.id === id ? { ...item, completed: !completed } : item));
        showToast('待办同步失败，已恢复原状态');
      });
    }
  };

  const handleNav = (next: Tab) => {
    if (next === activeTab) return;
    if (activeTab === 'we' && weDirty) {
      setPendingTab(next);
      setNavDiscardOpen(true);
      return;
    }
    setActiveTab(next);
  };

  const discardAndNavigate = () => {
    const next = pendingTab;
    setPendingTab(null);
    setNavDiscardOpen(false);
    setWeDirty(false);
    if (next) setActiveTab(next);
  };

  return (
    <main className="app-shell">
      <div className={`phone-app ${activeTab === 'calendar' ? 'calendar-mode' : ''}`}>
        {error && data && <div className="error-note">{error}</div>}
        {!data ? (error ? <OfflineState /> : <LoadingState />) : (
          <>
            {activeTab === 'today' && <TodayPage data={{ ...data, todos }} ghostRef={ghostRef} onToggleTodo={toggleTodo} onOpenLetters={() => setActiveTab('letters')} />}
            {activeTab === 'calendar' && <CalendarPage showToast={showToast} />}
            {activeTab === 'letters' && <FormalLettersPage count={letterCount} onCountChange={setLetterCount} showToast={showToast} />}
            {activeTab === 'we' && <WePage letterCount={letterCount} onOpenLetters={() => handleNav('letters')} onDirtyChange={setWeDirty} showToast={showToast} />}
            {activeTab === 'more' && <MorePage showToast={showToast} />}
          </>
        )}
        <BottomNav active={activeTab} unread={unread} onSelect={handleNav} onPlus={() => handleNav('letters')} />
        {toast && <div className="app-toast" role="status">{toast}</div>}
        {navDiscardOpen && <div className="confirm-backdrop" onClick={() => setNavDiscardOpen(false)}>
          <section className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="nav-discard-title" onClick={(event) => event.stopPropagation()}>
            <h2 id="nav-discard-title">未保存的日期</h2>
            <p>改日期还没有保存，要先离开吗？</p>
            <div className="actions"><button type="button" onClick={() => setNavDiscardOpen(false)}>继续编辑</button><button type="button" className="primary" onClick={discardAndNavigate}>丢弃并离开</button></div>
          </section>
        </div>}
      </div>
    </main>
  );
}

function LoadingState() {
  return <section className="loading-state"><span className="pencil-dot" /><p>把今天摊开来看看…</p></section>;
}

function OfflineState() {
  return <section className="offline-state" role="status">
    <span className="offline-mark" aria-hidden="true">⌁</span>
    <h2>暂时无法连接</h2>
    <p>确认手机已连回家里的网络或 Tailscale；Mac mini 重启时也可能短暂出现这个页面。</p>
    <button type="button" onClick={() => window.location.reload()}>重新连接</button>
  </section>;
}

function TodayPage({ data, ghostRef, onToggleTodo, onOpenLetters }: { data: TodayData; ghostRef: RefObject<GhostActivityHandle | null>; onToggleTodo: (id: string) => void; onOpenLetters: () => void }) {
  const [macMiniOpen, setMacMiniOpen] = useState(false);
  const [esp32Open, setEsp32Open] = useState(false);
  return (
    <div className="source-page-content">
      <div className="source-phone-date">
        <span>{data.date}</span><span className="small">{data.weekday}</span>
        <span className="small weather"><SourceWeatherIcon />{data.weather}</span>
        <button className="small mail" aria-label={`打开信件，有 ${data.unreadLetterCount} 封`} onClick={onOpenLetters}><SourceMailIcon />{data.unreadLetterCount > 0 && <span className="mail-count">{data.unreadLetterCount}</span>}</button>
      </div>

      <DeviceStrip devices={data.devices} ghostRef={ghostRef} onMacMiniOpen={() => setMacMiniOpen(true)} onEsp32Open={() => setEsp32Open(true)} onRefresh={async () => {
        if (apiEnabled()) {
          const fresh = await listDevices();
          return fresh.map((device) => ({ id: device.id, label: device.name, kind: device.kind, status: device.status === 'online' ? 'online' as const : 'attention' as const, detail: device.batteryPct == null ? (device.status === 'online' ? '在线' : '离线') : `${device.batteryPct}% 电量`, batteryPct: device.batteryPct }));
        }
        return (await loadToday()).devices;
      }} />

      {macMiniOpen && <MacMiniSheet ghostRef={ghostRef} onClose={() => setMacMiniOpen(false)} />}
      {esp32Open && <Esp32Sheet device={data.devices.find((device) => device.kind === 'esp32')} ghostRef={ghostRef} onClose={() => setEsp32Open(false)} />}

      <GhostActivity
        ref={ghostRef}
        state={deriveGhostState(data)}
        speech={ghostSpeech(data)}
        status={data.companionStatus}
        showStatus={false}
        showCaptions={false}
      />

      <h3 className="source-sec-title"><SourceScheduleHeading /></h3>
      <ul className="source-schedule-list">
        {data.schedule.map((item, index) => <li key={`${item.time}-${item.title}`}><span className="time">{item.time}</span><span className="glyph"><SourceScheduleIcon kind={(['shopping', 'reading', 'cooking', 'social'] as const)[index] ?? 'social'} /></span><span>{item.title}</span></li>)}
      </ul>

      <h3 className="source-sec-title"><SourceTodoHeading /></h3>
      <ul className="source-todo-list">
        {data.todos.map((item) => <TodoRow key={item.id} item={item} onToggle={() => onToggleTodo(item.id)} />)}
      </ul>
    </div>
  );
}

function deriveGhostState(data: TodayData): GhostActivityState {
  const printer = data.devices.find((device) => device.kind === 'printer');
  const disconnected = data.devices.some((device) => (device.kind === 'esp32' || device.kind === 'eink') && device.status !== 'online');
  const battery = data.devices.find((device) => device.kind === 'powerBank');
  if (printer?.status === 'attention') return 'letter';
  if (disconnected) return 'peek';
  if (typeof battery?.batteryPct === 'number' && battery.batteryPct <= 20) return 'sleepy';
  if (navigator.onLine === false) return 'offline';
  if (data.unreadLetterCount > 0) return 'letter';
  if (data.todos.some((todo) => todo.completed)) return 'happy';
  return 'idle';
}

function ghostSpeech(data: TodayData) {
  const state = deriveGhostState(data);
  const messages: Record<GhostActivityState, ReactNode> = {
    idle: <>{data.companionMessage} ~</>,
    letter: <>有新信件，等你拆开 ♡</>,
    sleepy: <>电量有点低，我先眯一会儿</>,
    peek: <>设备断开了，我在门边看看</>,
    offline: <>网络离线了，先把今天留在本地</>,
    happy: <>完成得漂亮，今天也一起过好啦</>,
  };
  return messages[state];
}

function DeviceStrip({ devices, ghostRef, onMacMiniOpen, onEsp32Open, onRefresh }: { devices: Device[]; ghostRef: RefObject<GhostActivityHandle | null>; onMacMiniOpen: () => void; onEsp32Open: () => void; onRefresh: () => Promise<Device[]> }) {
  const [current, setCurrent] = useState(devices);
  const [reading, setReading] = useState<string | null>(null);
  useEffect(() => setCurrent(devices), [devices]);
  const grouped = current.filter((device): device is Device => Boolean(device));
  const refresh = async (device: Device) => {
    setReading(device.id);
    if (device.kind === 'macmini') onMacMiniOpen();
    if (device.kind === 'esp32') onEsp32Open();
    const clickState: Record<Device['kind'], GhostActivityEvent> = { macmini: 'todo-done', esp32: 'new-event', printer: 'printing', eink: 'new-event', powerBank: 'todo-done' };
    ghostRef.current?.trigger(clickState[device.kind]);
    try {
      const next = await onRefresh();
      setCurrent(next);
      const fresh = next.find((item) => item.id === device.id) ?? device;
      const alertKind: GhostAlertKind = device.kind === 'printer' ? 'no-paper' : device.kind === 'powerBank' ? 'low-batt' : `down:${device.kind}`;
      if (fresh.status === 'attention' || (device.kind === 'powerBank' && (fresh.batteryPct ?? 100) <= 20)) {
        const message = device.kind === 'printer' ? '打印机没纸啦，帮我加一下…' : device.kind === 'powerBank' ? '它快没电了…' : `${device.label} 好像断了…`;
        ghostRef.current?.alert(alertKind, message);
      } else if (device.kind !== 'macmini') {
        ghostRef.current?.ackAlert(alertKind, `${device.label} 恢复啦 ✓`);
      }
    } catch { /* The sheet owns device feedback; keep the device strip visually quiet. */ }
    finally { setReading(null); }
  };
  return <section className="source-device-card" aria-label="设备状态"><div className="source-device-strip">
    {grouped.map((device) => <button className={'source-device-cell ' + (reading === device.id ? 'is-reading' : '')} key={device.id} data-name={device.label} type="button" onClick={() => void refresh(device)} aria-busy={reading === device.id} aria-label={`读取 ${device.label} 状态`}>
      <div className={'source-device-icon ' + (device.kind === 'powerBank' ? 'bat' : '')}><SourceDeviceIcon kind={device.kind} batteryPct={device.batteryPct} /></div><span className={'source-dot ' + (device.status === 'attention' ? 'amber' : '') + (reading === device.id ? ' is-reading' : '')} />
    </button>)}
  </div></section>;
}

function formatStatusTime(value: string | null) {
  if (!value) return '暂无记录';
  return new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date(value));
}

function formatUptime(seconds: number) {
  const days = Math.floor(seconds / 86400); const hours = Math.floor((seconds % 86400) / 3600);
  return days ? `${days} 天 ${hours} 小时` : `${hours} 小时`;
}

function MacMiniSheet({ ghostRef, onClose }: { ghostRef: RefObject<GhostActivityHandle | null>; onClose: () => void }) {
  const [status, setStatus] = useState<MacMiniStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const read = async (quiet = false) => {
    if (!quiet) setRefreshing(true); setError('');
    try {
      const next = await getMacMiniStatus();
      setStatus(next);
      ghostRef.current?.setState(next.status === 'online' ? 'happy' : 'offline', next.status === 'online' ? 'Mac mini 在线，今天也在工作 ✓' : 'Mac mini 暂时离线…');
    } catch {
      setError('暂时无法读取 Mac mini 实时状态');
      ghostRef.current?.setState('offline', 'Mac mini 状态读取失败…');
    }
    finally { setLoading(false); setRefreshing(false); }
  };
  useEffect(() => { void read(true); }, []);
  useEffect(() => { const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); }; window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey); }, [onClose]);
  return <div className="macmini-sheet" role="presentation">
    <button className="macmini-sheet-backdrop" aria-label="关闭 Mac mini 状态" onClick={onClose} />
    <section className="macmini-sheet-card" role="dialog" aria-modal="true" aria-labelledby="macmini-sheet-title">
      <span className="macmini-grab" aria-hidden="true" />
      <button className="macmini-close" type="button" aria-label="关闭" onClick={onClose}>×</button>
      <header className="macmini-head"><div className="macmini-icon"><SourceDeviceIcon kind="macmini" /></div><div><div className="macmini-title-row"><h2 id="macmini-sheet-title">Mac mini</h2><span className={`macmini-badge ${status?.status === 'online' ? 'is-ok' : 'is-off'}`}>{status?.status === 'online' ? '在线' : status ? '离线' : '读取中'}</span></div><p>家庭中枢 · {status?.serviceStatus.pwa === 'ok' && status?.serviceStatus.api === 'ok' ? '正常工作' : '需要检查'}</p></div></header>
      {loading ? <p className="macmini-loading">正在读取真实 Mac mini 状态…</p> : status ? <>
        <dl className="macmini-meta"><div><dt>最后连接</dt><dd>{formatStatusTime(status.lastConnectedAt)}</dd></div><div><dt>数据更新</dt><dd>{formatStatusTime(status.dataUpdatedAt)}</dd></div><div><dt>服务状态</dt><dd><span className="macmini-pill">PWA {status.serviceStatus.pwa === 'ok' ? '正常' : '异常'}</span><span className="macmini-pill">API {status.serviceStatus.api === 'ok' ? '正常' : '异常'}</span></dd></div><div><dt>数据来源</dt><dd><span className="macmini-pill">真实 Mac mini</span></dd></div></dl>
        <details className="macmini-more"><summary>更多详情</summary><div><span>运行时长</span><b>{formatUptime(status.uptimeSeconds)}</b><span>同步版本</span><b>#{status.revision}</b></div></details>
      </> : <p className="macmini-error">{error || '没有读取到状态'}</p>}
      {error && !loading && <p className="macmini-error">{error}</p>}
      <div className="macmini-actions"><button type="button" className="macmini-action primary" onClick={() => void read()} disabled={refreshing}>{refreshing ? '读取中…' : '刷新状态'}</button><button type="button" className="macmini-action" onClick={(event) => { const details = event.currentTarget.closest('.macmini-sheet-card')?.querySelector('.macmini-more') as HTMLDetailsElement | null; if (details) details.open = true; }}>查看详情</button></div>
    </section>
  </div>;
}

function readCachedEsp32(): Device | undefined { try { const value = localStorage.getItem('guozi-esp32-status'); return value ? JSON.parse(value) as Device : undefined; } catch { return undefined; } }

function wifiSignalLabel(rssi: number | null | undefined) { if (typeof rssi !== 'number') return '未上报'; if (rssi >= -55) return '信号良好'; if (rssi >= -70) return '信号一般'; return '信号较弱'; }

function Esp32Sheet({ device, ghostRef, onClose }: { device?: Device; ghostRef: RefObject<GhostActivityHandle | null>; onClose: () => void }) {
  const [current, setCurrent] = useState<Device | undefined>(device ?? readCachedEsp32());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [feedback, setFeedback] = useState('');
  const mapDevice = (item: BackendDevice): Device => ({ id: item.id, label: item.name, kind: item.kind, status: item.status === 'online' ? 'online' : 'attention', detail: item.status === 'online' ? '在线' : '离线', batteryPct: item.batteryPct, firmwareVersion: item.firmwareVersion, wifiRssiDbm: item.wifiRssiDbm, uptimeSeconds: item.uptimeSeconds, chipTemperatureC: item.chipTemperatureC, ipAddress: item.ipAddress, statusSource: 'direct', updatedAt: item.lastSeenAt ?? item.updatedAt });
  const read = async (quiet = false) => {
    if (!quiet) setRefreshing(true);
    setFeedback('');
    if (!apiEnabled()) { setCurrent(undefined); setFeedback('真实 ESP32 接口尚未启用，未使用 Mock 状态'); setLoading(false); setRefreshing(false); return; }
    try {
      const devices = await listDevices();
      const next = devices.find((item) => item.kind === 'esp32');
      const mapped = next ? mapDevice(next) : undefined; setCurrent(mapped); if (mapped) { try { localStorage.setItem('guozi-esp32-status', JSON.stringify(mapped)); } catch { /* cache is optional */ } }
      ghostRef.current?.setState(next?.status === 'online' ? 'happy' : 'offline', next?.status === 'online' ? 'ESP32 在线，准备工作 ✓' : 'ESP32 还没有连接…');
    } catch {
      setFeedback('无法读取 ESP32 实时状态，未伪造设备数据');
      ghostRef.current?.setState('offline', 'ESP32 状态读取失败…');
    } finally { setLoading(false); setRefreshing(false); }
  };
  useEffect(() => { void read(true); }, []);
  useEscape(onClose);
  const statusOnline = current?.status === 'online';
  const lastSeen = current?.updatedAt ?? null;
  const unavailable = () => setFeedback('ESP32 控制接口尚未接入，当前只读取真实状态');
  return <div className="esp32-sheet" role="presentation">
    <button className="esp32-sheet-backdrop" aria-label="关闭 ESP32 状态" onClick={onClose} />
    <section className="esp32-sheet-card" role="dialog" aria-modal="true" aria-labelledby="esp32-sheet-title">
      <span className="esp32-grab" aria-hidden="true" /><button className="esp32-close" type="button" aria-label="关闭" onClick={onClose}>×</button>
      <header className="esp32-head"><div className="esp32-icon"><SourceDeviceIcon kind="esp32" /></div><div><div className="esp32-title-row"><h2 id="esp32-sheet-title">ESP32</h2><span className={`esp32-badge ${statusOnline ? 'is-ok' : 'is-off'}`}>{loading ? '读取中' : statusOnline ? '在线' : '离线'}</span></div><p>{statusOnline ? '设备可响应 · 状态来自真实心跳' : '等待设备连接 · 不显示伪读数'}</p></div></header>
      <span className="esp32-source">数据来源：{current?.statusSource === 'direct' && lastSeen ? '真实硬件心跳' : '等待真实硬件数据'}</span>
      {loading && !current ? <p className="esp32-loading">正在读取真实 ESP32 状态…</p> : <dl className="esp32-meta"><div><dt>在线状态</dt><dd><span className={`esp32-status-dot ${statusOnline ? 'is-online' : ''}`} />{statusOnline ? '在线' : '离线'}</dd></div><div><dt>最后心跳</dt><dd>{formatStatusTime(lastSeen)}</dd></div><div><dt>固件版本</dt><dd>{current?.firmwareVersion ?? '未上报'}</dd></div><div><dt>Wi‑Fi 信号</dt><dd>{wifiSignalLabel(current?.wifiRssiDbm)}{typeof current?.wifiRssiDbm === 'number' && <small>（{current.wifiRssiDbm} dBm）</small>}</dd></div><div><dt>运行时长</dt><dd>{typeof current?.uptimeSeconds === 'number' ? formatUptime(current.uptimeSeconds) : '未上报'}</dd></div><div><dt>芯片温度</dt><dd>{typeof current?.chipTemperatureC === 'number' ? `${current.chipTemperatureC.toFixed(1)} °C` : '未上报'}</dd></div><div><dt>局域网 IP</dt><dd>{current?.ipAddress ?? '未上报'}</dd></div></dl>}
      <div className="esp32-actions"><button type="button" className="esp32-action primary" onClick={() => void read()} disabled={refreshing}>{refreshing ? '读取中…' : '↻ 刷新状态'}</button><button type="button" className="esp32-action" onClick={unavailable}>✦ 测试指示灯</button><button type="button" className="esp32-action" onClick={unavailable}>▤ 查看日志</button><button type="button" className="esp32-action" onClick={() => void read()}>⌁ 重新连接</button></div>
      {feedback && <p className="esp32-feedback" role="status">{feedback}</p>}<p className="esp32-settings">设备设置 · <span>重启设备</span>（接入控制接口后启用）</p>
    </section>
  </div>;
}

function TodoRow({ item, onToggle }: { item: TodoItem; onToggle: () => void }) {
  const icon = item.id === 'laundry' ? 'chores' : item.id === 'guozi-water' ? 'pet' : item.id === 'plants' ? 'plants' : item.id === 'checkup' ? 'health' : 'family';
  return <li className={`source-todo-row ${item.completed ? 'completed' : ''}`}>
    <button className="source-todo-hit" onClick={onToggle} aria-label={`${item.title} ${item.completed ? '已完成' : '未完成'}`}><span className="source-box">{item.completed && <Check size={12} />}</span><span>{item.title}</span></button>
    <span className="source-todo-icon"><SourceTodoIcon kind={icon as 'chores' | 'pet' | 'plants' | 'health' | 'family'} /></span>
  </li>;
}


type PaperId = LetterPaper;
type LetterStatus = 'queued' | 'printing' | 'done' | 'failed';
type LetterContent = 'none' | 'polaroid' | 'coupon' | 'ghost-stamp' | 'prescription';
type LetterRecord = { id: string; no: number; paper: PaperId; decoration?: PaperId; content?: LetterContent; status: LetterStatus; ts: string; text: string; signature?: string; imageData?: string; coupon?: { name: string; code: string; expiry: string }; ghostEmoji?: string; prescription?: string[]; unread?: boolean; archived?: boolean };

const paperOptions: Array<{ id: PaperId; name: string }> = [
  { id: 'border', name: '边框花边' },
  { id: 'emoji', name: '表情点缀' },
  { id: 'receipt', name: '小票风' },
  { id: 'minimal', name: '极简大字' },
];

const statusLabels: Record<LetterStatus, string> = { queued: '排队中', printing: '打印中', done: '已打印', failed: '打印失败' };
const seededLetters: LetterRecord[] = [
  { id: 's3', no: 3, paper: 'receipt', decoration: 'receipt', content: 'none', status: 'done', ts: '2026-08-15T21:40:00', text: '今晚我下厨,你负责夸我。\n夸得不走心要重夸。' },
  { id: 's2', no: 2, paper: 'border', decoration: 'border', content: 'none', status: 'done', ts: '2026-08-14T08:12:00', text: '早安。\n今天也要记得喝水,记得想我,\n记得晚上一起看那部拖了很久的电影。' },
  { id: 's1', no: 1, paper: 'emoji', decoration: 'emoji', content: 'none', status: 'done', ts: '2026-08-12T23:05:00', text: '第一次用这台小打印机给你写信。\n以后它就是我们家的情书专线了。' },
];

function normalizeLetters(value: unknown): LetterRecord[] {
  if (!Array.isArray(value)) return seededLetters;
  return value.filter((item): item is LetterRecord => Boolean(item && typeof item === 'object')).map((item, index) => {
    const raw = item as Partial<LetterRecord>;
    const decoration = raw.decoration ?? raw.paper ?? 'border';
    return { ...raw, id: String(raw.id ?? `legacy-${index}`), no: Number(raw.no ?? index + 1), paper: decoration, decoration, content: raw.content ?? 'none', status: raw.status === 'printing' || raw.status === 'done' || raw.status === 'failed' ? raw.status : 'queued', ts: String(raw.ts ?? new Date().toISOString()), text: String(raw.text ?? ''), signature: typeof raw.signature === 'string' ? raw.signature : undefined, archived: Boolean(raw.archived) } as LetterRecord;
  });
}

function fromBackendLetter(letter: BackendLetter, index: number, job?: BackendPrintJob): LetterRecord {
  const decoration = letter.paper ?? 'border';
  const metadata = letter.metadata ?? {};
  const content = typeof metadata.content === 'string' ? metadata.content as LetterContent : 'none';
  const status: LetterStatus = job?.status === 'printing' ? 'printing' : job?.status === 'failed' ? 'failed' : job?.status === 'completed' ? 'done' : letter.unread ? 'queued' : 'done';
  return {
    id: letter.id,
    no: index + 1,
    paper: decoration,
    decoration,
    content,
    status,
    ts: letter.createdAt,
    text: letter.body,
    signature: letter.signature,
    unread: letter.unread,
    archived: letter.archived,
    coupon: metadata.coupon as LetterRecord['coupon'],
    ghostEmoji: typeof metadata.ghostEmoji === 'string' ? metadata.ghostEmoji : undefined,
    prescription: Array.isArray(metadata.prescription) ? metadata.prescription.filter((item): item is string => typeof item === 'string') : undefined,
    imageData: typeof metadata.imageData === 'string' ? metadata.imageData : undefined,
  };
}

function formatLetterTimestamp(value: string) {
  const date = new Date(value);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getMonth() + 1}月${date.getDate()}日 ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatLetterNumber(no: number) { return `NO.${String(no).padStart(3, '0')}`; }

function LetterReceipt({ letter, preview = false }: { letter: LetterRecord; preview?: boolean }) {
  const decoration = letter.decoration ?? letter.paper ?? 'border';
  const content = letter.content ?? 'none';
  const body = letter.text.trim() ? letter.text : '(写点什么,这里会实时长出来)';
  const empty = !letter.text.trim();
  const contentView = content === 'polaroid' && letter.imageData ? <figure className="r-polaroid"><img src={letter.imageData} alt="本地处理后的 1-bit 照片" /><figcaption>{body}</figcaption></figure>
    : content === 'coupon' ? <div className="r-coupon"><strong>{letter.coupon?.name || '兑换券'}</strong><span>兑换码 · {letter.coupon?.code || '待填写'}</span><small>有效期至 {letter.coupon?.expiry || '未设置'}</small></div>
      : content === 'ghost-stamp' ? <div className="r-stamp"><span>◉</span><strong>{letter.ghostEmoji || '♡'}</strong><small>Ghost stamp</small></div>
        : content === 'prescription' ? <div className="r-prescription"><strong>关心处方笺</strong>{(letter.prescription?.length ? letter.prescription : ['记得喝水']).slice(0, 5).map((item, index) => <span key={`${item}-${index}`}>☐ {item}</span>)}</div>
          : <div className={`r-body ${empty ? 'r-empty' : ''}`}>{body}</div>;
  const receiptClass = decoration === 'receipt' ? 'paper-receipt' : decoration === 'emoji' ? 'paper-emoji' : decoration === 'minimal' ? 'paper-minimal' : 'paper-border';
  const lineCount = Math.max(1, body.split('\n').length + (content === 'prescription' ? Math.min(5, letter.prescription?.length ?? 1) : 0));
  return <div className={`receipt ${receiptClass} ${preview ? 'receipt-preview' : ''}`}><div className="r-head">{decoration === 'receipt' ? 'LOVE LETTER' : decoration === 'emoji' ? '♡ ✿ ♡' : decoration === 'minimal' ? '' : '给 你'}</div>{decoration === 'receipt' && <><div className="r-sep" /><div className="r-foot r-left">{formatLetterNumber(letter.no)} · {formatLetterTimestamp(letter.ts)}</div><div className="r-sep" /></>}{contentView}{decoration === 'receipt' && <><div className="r-sep" /><div className="r-total"><span>合计</span><span>一片心意</span></div><div className="r-sep" /></>}{letter.signature && <div className="r-signature">— {letter.signature}</div>}<div className="r-foot">{formatLetterTimestamp(letter.ts)} · {lineCount} 行 · 约 {Math.max(36, lineCount * 7 + 24)}mm</div>{decoration === 'border' && <span className="r-border-frame" />}</div>;
}

function LettersPage({ count: _count, onCountChange, showToast }: { count: number; onCountChange: (count: number) => void; showToast: (message: string) => void }) {
  const [letters, setLetters] = useState<LetterRecord[]>(() => apiEnabled() ? [] : normalizeLetters(readLocal<unknown>('guozi-letters', seededLetters)));
  const [pane, setPane] = useState<'compose' | 'records'>('compose');
  const [paper, setPaper] = useState<PaperId>('border');
  const [content, setContent] = useState<LetterContent>('none');
  const [text, setText] = useState('');
  const [coupon, setCoupon] = useState({ name: '', code: '', expiry: '' });
  const [ghostEmoji, setGhostEmoji] = useState('♡');
  const [prescription, setPrescription] = useState<string[]>(['']);
  const [imageData, setImageData] = useState<string | undefined>();
  const [viewing, setViewing] = useState<LetterRecord | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(true);
  const lastViewTrigger = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!apiEnabled()) return;
    getCached<BackendLetter[]>('/api/letters').then((items) => { if (items) setLetters(items.map((item, index) => fromBackendLetter(item, index))); }).catch(() => undefined);
    const refresh = () => Promise.all([listLetters(), listPrintJobs()]).then(([items, jobs]) => { const byLetter = new Map(jobs.map((job) => [job.letterId, job])); setLetters(items.map((item, index) => fromBackendLetter(item, index, byLetter.get(item.id)))); }).catch(() => showToast('信件读取失败'));
    refresh();
    const timer = window.setInterval(refresh, 5000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => { if (!apiEnabled()) writeLocal('guozi-letters', letters); }, [letters]);
  useEffect(() => onCountChange(letters.filter((letter) => letter.status === 'done').length), [letters, onCountChange]);
  useEscape(() => { setViewing(null); lastViewTrigger.current?.focus(); }, Boolean(viewing));

  const preview: LetterRecord = { id: 'preview', no: Math.max(0, ...letters.map((letter) => letter.no)) + 1, paper, decoration: paper, content, status: 'queued', ts: new Date().toISOString(), text, signature: readSettings().signature.trim() || '我们的小日常', imageData, coupon, ghostEmoji, prescription };
  const handlePhoto = (file?: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { const image = new Image(); image.onload = () => { const max = 180; const scale = Math.min(1, max / Math.max(image.width, image.height)); const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(image.width * scale)); canvas.height = Math.max(1, Math.round(image.height * scale)); const ctx = canvas.getContext('2d'); if (!ctx) return; ctx.drawImage(image, 0, 0, canvas.width, canvas.height); const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height); for (let i = 0; i < pixels.data.length; i += 4) { const gray = pixels.data[i] * .299 + pixels.data[i + 1] * .587 + pixels.data[i + 2] * .114; const bit = gray > 150 ? 255 : 0; pixels.data[i] = bit; pixels.data[i + 1] = bit; pixels.data[i + 2] = bit; } ctx.putImageData(pixels, 0, 0); setImageData(canvas.toDataURL('image/png')); }; image.src = String(reader.result); };
    reader.readAsDataURL(file);
  };
  const send = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = text.trim() || (content === 'coupon' ? `${coupon.name || '兑换券'}：${coupon.code || '待填写'}` : content === 'prescription' ? prescription.filter(Boolean).join('\n') : '');
    if (!value) return;
    if (apiEnabled()) {
      try {
        const created = await createLetter({
          title: '给你的信',
          body: value,
          signature: readSettings().signature.trim() || '我们的小日常',
          paper,
          metadata: {
            content,
            ...(content === 'coupon' ? { coupon } : {}),
            ...(content === 'ghost-stamp' ? { ghostEmoji } : {}),
            ...(content === 'prescription' ? { prescription: prescription.filter(Boolean) } : {}),
            ...(content === 'polaroid' && imageData ? { imageData } : {}),
          },
        });
        await createPrintJob(created.id);
        const letter = fromBackendLetter(created, 0);
        setLetters((items) => [{ ...letter, no: Math.max(0, ...items.map((item) => item.no)) + 1 }, ...items]);
        showToast('已加入 Mac mini 打印队列');
      } catch {
        showToast('信件创建失败，请检查 Mac mini 服务');
        return;
      }
      setText('');
      setPane('records');
      return;
    }
    const letter: LetterRecord = { id: `l-${Date.now()}`, no: Math.max(0, ...letters.map((item) => item.no)) + 1, paper, decoration: paper, content, coupon, ghostEmoji, prescription: prescription.filter(Boolean), imageData, signature: readSettings().signature.trim() || '我们的小日常', status: 'queued', ts: new Date().toISOString(), text: value };
    setLetters((items) => [letter, ...items]);
    showToast(`已加入打印队列 · ${formatLetterNumber(letter.no)}（Mock）`);
    setText('');
    setPane('records');
    window.setTimeout(() => setLetters((items) => items.map((item) => item.id === letter.id ? { ...item, status: 'printing' } : item)), 1200);
    const printerOn = readSettings().printerOn;
    if (!printerOn) showToast('打印机离线，信件已排队等待连接');
    window.setTimeout(() => setLetters((items) => items.map((item) => item.id === letter.id ? { ...item, status: 'printing' } : item)), 1200);
    window.setTimeout(() => setLetters((items) => items.map((item) => item.id === letter.id ? { ...item, status: printerOn ? 'done' : 'failed' } : item)), 3400);
  };
  const remove = async (id: string) => {
    const previous = letters;
    if (confirming !== id) { setConfirming(id); window.setTimeout(() => setConfirming((current) => current === id ? null : current), 2500); return; }
    const target = letters.find((item) => item.id === id);
    if (target?.archived) { setConfirming(null); showToast('已归档信件不可删除'); return; }
    setLetters((items) => items.filter((item) => item.id !== id));
    setConfirming(null);
    try {
      if (apiEnabled()) await deleteLetter(id);
      showToast('信件记录已删除');
    } catch {
      setLetters(previous);
      showToast('删除失败，信件已恢复');
    }
  };
  const toggleArchive = async (id: string, archived: boolean) => {
    const previous = letters;
    setLetters((items) => items.map((item) => item.id === id ? { ...item, archived } : item));
    try {
      if (apiEnabled()) await updateLetter(id, { archived });
      showToast(archived ? '已归档，这封信不会被删除' : '已取消归档');
    } catch {
      setLetters(previous);
      showToast('归档失败，已恢复原状态');
    }
  };

  return <div className="page-content letters-page">
    <div className="letter-tabs" role="tablist" aria-label="信件视图">
      <button className={`letter-tab ${pane === 'compose' ? 'active' : ''}`} onClick={() => setPane('compose')} role="tab" aria-selected={pane === 'compose'}>写信</button>
      <button className={`letter-tab ${pane === 'records' ? 'active' : ''}`} onClick={() => setPane('records')} role="tab" aria-selected={pane === 'records'}>记录 <span className="cnt">{letters.length ? `(${letters.length})` : ''}</span></button>
    </div>

    {pane === 'compose' ? <form className="letters-pane" onSubmit={send}>
      <div className="field-label">想说的话</div>
      <textarea id="letter-input" name="letterContent" className="letter-input" value={text} onChange={(event) => setText(event.target.value)} placeholder={content === 'polaroid' ? '写一句话，配这张照片…' : content === 'ghost-stamp' ? '让 Ghost 替你带一句话…' : '比如：今天路过花店，想起你笑起来的样子…'} maxLength={500} style={{ display: content === 'coupon' || content === 'prescription' ? 'none' : undefined }} />
      <div className="field-label">装饰 · decoration</div>
      <div className="paper-picker">{paperOptions.map((option) => <button type="button" key={option.id} className={`paper-card ${paper === option.id ? 'sel' : ''}`} onClick={() => setPaper(option.id)}><span className={`mini mini-${option.id}`}>{option.id === 'border' ? '✽' : option.id === 'emoji' ? '♡ ✿ ☺' : option.id === 'receipt' ? <><span>- - - -</span><span>NO.001</span><span>- - - -</span></> : '字'}</span><span className="nm">{option.name}</span></button>)}</div>
      <div className="field-label">内容样式 · 正文请填写在上面的“想说的话”</div>
      <div className="content-picker">{(['none', 'polaroid', 'coupon', 'ghost-stamp', 'prescription'] as LetterContent[]).map((item) => <button type="button" key={item} className={content === item ? 'sel' : ''} onClick={() => setContent(item)}>{({ none: '普通文字', polaroid: '照片', coupon: '兑换券', 'ghost-stamp': 'Ghost 表情', prescription: '关心处方笺' } as Record<LetterContent, string>)[item]}</button>)}</div>
      {content === 'polaroid' && <label className="letter-extra">照片（本地转 1-bit）<input type="file" accept="image/*" onChange={(event) => handlePhoto(event.target.files?.[0])} /></label>}
      {content === 'coupon' && <div className="letter-extra-grid"><input placeholder="券名称" value={coupon.name} onChange={(event) => setCoupon({ ...coupon, name: event.target.value })} /><input placeholder="兑换码" value={coupon.code} onChange={(event) => setCoupon({ ...coupon, code: event.target.value })} /><input type="date" value={coupon.expiry} onChange={(event) => setCoupon({ ...coupon, expiry: event.target.value })} /></div>}
      {content === 'ghost-stamp' && <label className="letter-extra">选择表情 <select value={ghostEmoji} onChange={(event) => setGhostEmoji(event.target.value)}><option>♡</option><option>☺</option><option>✦</option><option>☾</option><option>!</option></select></label>}
      {content === 'prescription' && <div className="letter-extra prescription-fields">{prescription.slice(0, 5).map((item, index) => <input key={index} placeholder={`关心事项 ${index + 1}`} value={item} onChange={(event) => setPrescription((items) => items.map((value, itemIndex) => itemIndex === index ? event.target.value : value))} />)}{prescription.length < 5 && <button type="button" onClick={() => setPrescription((items) => [...items, ''])}>+ 添加一项</button>}</div>}
      <div className="field-label">打印预览</div>
      <div className="preview-wrap"><LetterReceipt letter={preview} preview /></div>
      <button className="send-btn" type="submit" disabled={!text.trim() && content !== 'coupon' && content !== 'prescription'}>打印寄出 ♡</button>
    </form> : <section className="letters-pane records-pane">
      <div className="archive-toolbar"><span>已发送的信件</span><button type="button" onClick={() => setShowArchived((value) => !value)}>{showArchived ? '隐藏已归档' : '显示已归档'}</button></div>
      {letters.filter((letter) => showArchived || !letter.archived).length === 0 ? <div className="records-empty">还没有符合条件的信件 —— 去「写信」写第一封吧 ♡</div> : <div className="record-list">{letters.filter((letter) => showArchived || !letter.archived).map((letter) => <article className={`record-row ${letter.archived ? 'is-archived' : ''}`} key={letter.id}><div className="record-top"><span className="no">{formatLetterNumber(letter.no)}</span><span>{formatLetterTimestamp(letter.ts)}</span><span>· {paperOptions.find((item) => item.id === (letter.decoration ?? letter.paper))?.name}</span><span className="combo-label">× {letter.content ?? 'none'}</span><span className={`st st-${letter.status}`}>{statusLabels[letter.status]}</span></div><div className="record-snippet">{letter.text.split('\n')[0] || '(空)'}</div><div className="record-acts"><button type="button" onClick={(event) => { lastViewTrigger.current = event.currentTarget; setViewing(letter); }}>查看全文</button>{letter.archived ? <><span className="archived-mark">已归档 · 不可删除</span><button type="button" onClick={() => toggleArchive(letter.id, false)}>取消归档</button></> : <><button type="button" onClick={() => toggleArchive(letter.id, true)}>归档</button><button type="button" className={`del ${confirming === letter.id ? 'confirm' : ''}`} onClick={() => remove(letter.id)}>{confirming === letter.id ? '确认删除?' : '删除'}</button></>}</div></article>)}</div>}
    </section>}

    {viewing && <><button className="letters-backdrop" aria-label="关闭信件预览" onClick={() => { setViewing(null); lastViewTrigger.current?.focus(); }} /><section className="letter-view" role="dialog" aria-modal="true" aria-label="信的原件"><div className="letter-view-head"><h2>信的原件</h2><button className="close-btn" type="button" onClick={() => { setViewing(null); lastViewTrigger.current?.focus(); }} aria-label="关闭">×</button></div><div className="letter-view-body"><LetterReceipt letter={viewing} /></div><div className="letter-view-meta">{formatLetterNumber(viewing.no)} · {formatLetterTimestamp(viewing.ts)} · {paperOptions.find((item) => item.id === viewing.paper)?.name} · {statusLabels[viewing.status]}</div>{viewing.status === 'failed' && <div className="letter-failed"><span>打印机没回应，记录已保留。</span><button type="button" onClick={() => { setLetters((items) => items.map((item) => item.id === viewing.id ? { ...item, status: 'queued' } : item)); showToast('已重新加入打印队列（Mock）'); }}>重试</button></div>}</section></>}
  </div>;
}

type Countdown = { id: string; name: string; date: string; yearly?: boolean };
type Wish = { id: string; text: string; done: boolean };

function readLocal<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : fallback;
  } catch { return fallback; }
}

function writeLocal<T>(key: string, value: T) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* local mock is optional */ }
}

function daysBetween(start: string) {
  const from = new Date(`${start}T00:00:00`);
  const today = new Date();
  const now = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.max(0, Math.floor((now.getTime() - from.getTime()) / 86400000) + 1);
}

function daysUntil(value: string) {
  const target = new Date(`${value}T00:00:00`);
  const today = new Date();
  const now = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.ceil((target.getTime() - now.getTime()) / 86400000);
}

function formatDateCn(value: string) {
  const [year, month, day] = value.split('-');
  return `${year}年${Number(month)}月${Number(day)}日`;
}

function WePage({ letterCount, onOpenLetters, onDirtyChange, showToast }: { letterCount: number; onOpenLetters: () => void; onDirtyChange: (dirty: boolean) => void; showToast: (message: string) => void }) {
  const [anniversary, setAnniversary] = useState(() => readLocal('guozi-us-meta', { anniversary: '2024-05-20' }).anniversary);
  const [countdowns, setCountdowns] = useState<Countdown[]>(() => readLocal('guozi-countdowns', [
    { id: 'cd-seed-1', name: '她的生日', date: '11-08', yearly: true },
    { id: 'cd-seed-2', name: '第一次一起旅行', date: '2026-10-01', yearly: false },
  ]));
  const [wishes, setWishes] = useState<Wish[]>(() => readLocal('guozi-wishes', [
    { id: 'wish-1', text: '去海边看日出', done: false },
    { id: 'wish-2', text: '一起做一顿饭', done: false },
  ]));
  const [editingDate, setEditingDate] = useState(false);
  const [draftDate, setDraftDate] = useState(anniversary);
  const [confirming, setConfirming] = useState<string | null>(null);

  useEffect(() => writeLocal('guozi-us-meta', { anniversary }), [anniversary]);
  useEffect(() => writeLocal('guozi-countdowns', countdowns), [countdowns]);
  useEffect(() => writeLocal('guozi-wishes', wishes), [wishes]);

  const [weekStats, setWeekStats] = useState({ done: 0, total: 0, schedules: 0 });
  useEffect(() => {
    if (apiEnabled()) {
      Promise.all([listCalendarEvents(), listTodos()]).then(([events, todos]) => {
        setWeekStats({ done: todos.filter((item) => item.completed).length, total: todos.length, schedules: events.length });
      }).catch(() => undefined);
      return;
    }
    const raw = readLocal<Array<{ type: 'schedule' | 'todo'; done?: boolean }>>('guozi-items', []);
    setWeekStats({ done: raw.filter((item) => item.type === 'todo' && item.done).length, total: raw.filter((item) => item.type === 'todo').length, schedules: raw.filter((item) => item.type === 'schedule').length });
  }, []);

  const addCountdown = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get('name') || '').trim();
    const date = String(form.get('date') || '');
    if (!name || !date) return;
    setCountdowns((items) => [...items, { id: `cd-${Date.now()}`, name, date, yearly: form.get('yearly') === 'on' }]);
    event.currentTarget.reset();
  };

  const addWish = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const text = String(form.get('wish') || '').trim();
    if (!text) return;
    setWishes((items) => [...items, { id: `wish-${Date.now()}`, text, done: false }]);
    event.currentTarget.reset();
  };
  const confirmDelete = (id: string, kind: 'countdown' | 'wish') => {
    if (confirming !== id) { setConfirming(id); window.setTimeout(() => setConfirming((current) => current === id ? null : current), 2500); return; }
    if (kind === 'countdown') setCountdowns((items) => items.filter((item) => item.id !== id));
    else setWishes((items) => items.filter((item) => item.id !== id));
    setConfirming(null);
    showToast('已删除，日子会继续往前走 ♡');
  };

  return <div className="page-content us-page">
    <div className="us-body">
      <section className="us-card us-hero">
        <div className="us-note">每一天都算数 ♡</div>
        <div className="us-card-label">在一起</div>
        <div className="us-days">{daysBetween(anniversary)}<small>天</small></div>
        <div className="us-since">从 {formatDateCn(anniversary)} 起
          <button className="us-mini-btn" onClick={() => { setDraftDate(anniversary); setEditingDate(true); }}>改日期</button>
        </div>
        {editingDate && <div className="us-editor"><input type="date" value={draftDate} onChange={(event) => { setDraftDate(event.target.value); onDirtyChange(true); }} /><button className="us-mini-btn primary" onClick={() => { setAnniversary(draftDate); setEditingDate(false); onDirtyChange(false); }}>保存</button><button className="us-mini-btn" onClick={() => { setDraftDate(anniversary); setEditingDate(false); onDirtyChange(false); }}>取消</button></div>}
      </section>

      <section className="us-card"><div className="us-card-label">倒数日</div>
        {countdowns.length === 0 ? <div className="us-empty">还没有要倒数的日子 —— 在下方添加一个吧</div> : countdowns.map((item) => <div className="us-count-row" key={item.id}><div><strong>{item.name}</strong><small>{item.yearly ? `每年 ${item.date.replace('-', '月')}日` : formatDateCn(item.date)}</small></div><span>{(() => { const diff = item.yearly ? (() => { const [month, day] = item.date.split('-').map(Number); const current = new Date(); const now = new Date(current.getFullYear(), current.getMonth(), current.getDate()); let target = new Date(now.getFullYear(), month - 1, day); if (target < now) target = new Date(now.getFullYear() + 1, month - 1, day); return Math.ceil((target.getTime() - now.getTime()) / 86400000); })() : daysUntil(item.date); return diff >= 0 ? (diff === 0 ? '就是今天!' : `还有 ${diff} 天`) : '已到这一天'; })()}</span><button className={`us-text-btn ${confirming === item.id ? 'confirm' : ''}`} onClick={() => confirmDelete(item.id, 'countdown')}>{confirming === item.id ? '确认删除?' : '删除'}</button></div>)}
        <form className="us-add-row" onSubmit={addCountdown}><input name="name" placeholder="想倒数的日子" maxLength={20} /><input name="date" type="date" /><label><input name="yearly" type="checkbox" defaultChecked />每年</label><button className="us-mini-btn primary">添加</button></form>
      </section>

      <button className="us-card us-stat-card us-stat-link" onClick={onOpenLetters}><div className="us-card-label">我们的小票</div><div className="us-stat"><strong>{letterCount}</strong><span>封已寄出</span></div><small>{letterCount ? '所有信件都留在这台机器里' : '还没有寄过信 —— 去写第一封吧'}</small><span className="us-arrow">›</span></button>

      <section className="us-card"><div className="us-card-label">本周一起完成</div><div className="us-week-grid"><div><small>一起的安排</small><strong>{weekStats.schedules}<em> 件</em></strong></div><div><small>待办完成</small><strong>{weekStats.done}<em> / {weekStats.total}</em></strong></div></div></section>

      <section className="us-card"><div className="us-card-label">心愿清单 <small>{wishes.filter((wish) => wish.done).length}/{wishes.length}</small></div>{wishes.length === 0 && <div className="us-empty">还没有心愿 —— 写下一个想一起完成的事吧</div>}{wishes.map((wish) => <div className={`us-wish-row ${wish.done ? 'done' : ''}`} key={wish.id}><button className="us-wish-check" onClick={() => setWishes((items) => items.map((item) => item.id === wish.id ? { ...item, done: !item.done } : item))}>{wish.done ? '✓' : ''}</button><span>{wish.text}</span><button className={`us-text-btn ${confirming === wish.id ? 'confirm' : ''}`} onClick={() => confirmDelete(wish.id, 'wish')}>{confirming === wish.id ? '确认删除?' : '删除'}</button></div>)}<form className="us-add-row wish" onSubmit={addWish}><input name="wish" placeholder="想一起做的事" maxLength={40} /><button className="us-mini-btn primary">记下</button></form></section>
    </div>
  </div>;
}

function MorePage({ showToast }: { showToast: (message: string) => void }) {
  const [settings, setSettings] = useState(() => readSettings());
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({ printer: true, reminders: true, network: true, more: true, data: true });
  const [clearArmed, setClearArmed] = useState(false);
  const [devices, setDevices] = useState<BackendDevice[]>([]);
  const [apiCounts, setApiCounts] = useState({ items: 0, letters: 0 });

  useEffect(() => {
    if (!apiEnabled()) return;
    listDevices().then(setDevices).catch(() => showToast('设备状态读取失败'));
    Promise.all([listCalendarEvents(), listTodos(), listLetters()])
      .then(([events, todos, letters]) => setApiCounts({ items: events.length + todos.length, letters: letters.length }))
      .catch(() => showToast('数据统计读取失败'));
  }, [showToast]);

  const save = (next: SettingsState) => { setSettings(next); localStorage.setItem('guozi-settings', JSON.stringify(next)); showToast('设置已保存'); };
  const toggle = (key: keyof SettingsState) => save({ ...settings, [key]: !settings[key] });
  const macDevice = devices.find((device) => device.kind === 'macmini');
  const espDevice = devices.find((device) => device.kind === 'esp32');
  const printerDevice = devices.find((device) => device.kind === 'printer');
  const serviceOnline = macDevice?.status === 'online';
  const printerOnline = printerDevice?.status === 'online';
  const counts = { items: apiEnabled() ? apiCounts.items : readArray('guozi-items').length, letters: apiEnabled() ? apiCounts.letters : readArray('guozi-letters').length, wishes: readArray('guozi-wishes').length, countdowns: readArray('guozi-countdowns').length };
  const clearData = () => {
    if (!clearArmed) { setClearArmed(true); window.setTimeout(() => setClearArmed(false), 2500); return; }
    ['guozi-items', 'guozi-letters', 'guozi-wishes', 'guozi-countdowns', 'guozi-us-meta'].forEach((key) => localStorage.removeItem(key));
    setClearArmed(false);
    showToast(apiEnabled() ? '本机缓存已清理，服务器数据未删除' : '都清空了，从头开始 ♡');
  };
  const exportData = async () => {
    try {
      const remote = apiEnabled() ? await Promise.all([listCalendarEvents(), listTodos(), listLetters(), listDevices()]) : null;
      const dump = {
        exportedAt: new Date().toISOString(),
        app: 'guozi',
        source: apiEnabled() ? 'macmini-api' : 'local',
        settings,
        calendarEvents: remote?.[0] ?? readArray('guozi-schedules'),
        todos: remote?.[1] ?? readArray('guozi-items'),
        letters: remote?.[2] ?? readArray('guozi-letters'),
        devices: remote?.[3] ?? [],
        wishes: readArray('guozi-wishes'),
        countdowns: readArray('guozi-countdowns'),
        relationship: readLocal('guozi-us-meta', null),
      };
    const url = URL.createObjectURL(new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'guozi-backup.json'; link.click(); URL.revokeObjectURL(url);
      showToast('已导出 guozi-backup.json ♡');
    } catch {
      showToast('导出失败，请稍后再试');
    }
  };
  const updateBackup = () => { if (!settings.cloudBackup) { showToast('云端备份已关闭，先打开开关 ↑'); return; } showToast('云端备份暂未接入，请先导出全部数据'); };
  const refreshDevices = () => { if (!apiEnabled()) { showToast('设备状态需要连接 Mac mini'); return; } listDevices().then(setDevices).then(() => showToast('设备状态已刷新')).catch(() => showToast('设备状态读取失败')); };
  const toggleCard = (key: string) => setCollapsed((current) => ({ ...current, [key]: !current[key] }));
  return <div className="page-content settings-page">
    <div className="settings-body">
      <EInkContentPage showToast={showToast} />
      <SettingsCard icon="letter" label="信件署名" collapsed={false} onToggle={() => undefined}>
        <label className="settings-signature-field"><span>每封信底部显示</span><input value={settings.signature} maxLength={80} placeholder="例如：你的 Guozi" onChange={(event) => save({ ...settings, signature: event.target.value })} /></label>
      </SettingsCard>
      <SettingsCard icon="printer" label="打印小铺" collapsed={collapsed.printer} onToggle={() => toggleCard('printer')}>
        <div className="settings-pr-top"><div className="settings-pr-main"><strong>优库 EM5823H</strong><small>58mm 热敏纸 · 通过 ESP32 连接</small></div><span className={`settings-chip ${printerOnline ? 'on' : 'off'}`}>{printerOnline ? '在线' : '尚未接入'}</span></div>
        <div className="settings-switch-row"><SourceSettingsIcon kind="plug" className="source-svg settings-row-icon" /><span className="settings-switch-label">打印机状态<small>{printerDevice ? `${printerDevice.name} · ${printerOnline ? '设备已在线' : '等待硬件接入'}` : '等待 Mac mini 读取设备'}</small></span><span className={`settings-chip ${printerOnline ? 'on' : 'off'}`}>{printerOnline ? '在线' : '未接入'}</span></div>
        <div className="settings-actions"><small>{printerOnline ? '随时可以打印 ♡' : '打印机尚未接入，信件会保留在队列'}</small><span /><button className="settings-mini primary" disabled={!printerOnline} type="button" onClick={async () => { try { const test = await createLetter({ title: '打印测试页', body: 'GUOZI PRINTER TEST\nUART link OK\n撕纸线在这里 · - - - - -', signature: 'EM5823H' , paper: 'receipt', metadata: { content: 'none', fontProfile: settings.printProfile } }); await createPrintJob(test.id); showToast('测试页已加入打印队列 ♡'); } catch { showToast('测试页发送失败，请检查 Mac mini 服务'); } }}>打印测试页</button></div>
      </SettingsCard>
      <SettingsCard icon="bell" label="提醒" collapsed={collapsed.reminders} onToggle={() => toggleCard('reminders')}>
        <SwitchRow icon="letter" label="信件寄出后告诉我" hint="打印完成时弹个小便签" value={settings.rLetter} onChange={() => toggle('rLetter')} />
        <SwitchRow icon="moon" label="每晚提醒我记今日" hint="21:00 · 今天还没记点什么呢" value={settings.rEvening} onChange={() => toggle('rEvening')} />
        <SwitchRow icon="check" label="待办到期提醒" hint="当天还有没打勾的事时提醒" value={settings.rTodo} onChange={() => toggle('rTodo')} />
      </SettingsCard>
      <SettingsCard icon="wifi" label="网络与服务" collapsed={collapsed.network} onToggle={() => toggleCard('network')}>
        <div className="settings-pr-top"><div className="settings-pr-main"><strong>Mac mini 服务</strong><small>192.168.31.34:3100 · ESP32 {espDevice?.status === 'online' ? '在线' : '等待连接'}</small></div><span className={`settings-chip ${serviceOnline ? 'on' : 'off'}`}>{serviceOnline ? '服务在线' : '服务离线'}</span></div>
        <SwitchRow icon="send" label="远程寄信" hint="公网通道暂未接入，先在家庭网络内使用" value={settings.remoteLetter} onChange={() => { toggle('remoteLetter'); showToast(settings.remoteLetter ? '远程寄信已关闭' : '远程寄信已开启 ♡'); }} />
        <SwitchRow icon="cloud" label="云端备份" hint="云端备份暂未接入，可导出本机数据" value={settings.cloudBackup} onChange={() => toggle('cloudBackup')} />
        <div className="settings-actions"><small>{settings.cloudBackup ? '已打开，服务接入后可使用' : '云端备份未开启'}</small><span /><button className="settings-mini" type="button" onClick={updateBackup}>立即备份</button></div>
        <div className="settings-actions"><small>Mac mini 与 ESP32 状态来自后端心跳</small><span /><button className="settings-mini" type="button" onClick={refreshDevices}>刷新状态</button></div>
      </SettingsCard>
      <SettingsCard icon="sliders" label="更多功能" collapsed={collapsed.more} onToggle={() => toggleCard('more')}>
        <div className="settings-switch-row"><SourceSettingsIcon kind="type" className="source-svg settings-row-icon" /><span className="settings-switch-label">打印风格<small>默认高质量；可按清晰度切换</small></span><div className="settings-seg"><button type="button" className={settings.printProfile === 'pixel-hard' ? 'on' : ''} onClick={() => save({ ...settings, printProfile: 'pixel-hard' })}>1 锐利</button><button type="button" className={settings.printProfile === 'pixel-soft' ? 'on' : ''} onClick={() => save({ ...settings, printProfile: 'pixel-soft' })}>3 柔和</button><button type="button" className={settings.printProfile === 'thermal-sans' ? 'on' : ''} onClick={() => save({ ...settings, printProfile: 'thermal-sans' })}>5 高质量</button></div></div>
        <div className="settings-switch-row"><SourceSettingsIcon kind="type" className="source-svg settings-row-icon" /><span className="settings-switch-label">打印字号<small>大字打出来看着不费劲，但更费纸</small></span><div className="settings-seg"><button type="button" className={settings.fontSize === 'std' ? 'on' : ''} onClick={() => save({ ...settings, fontSize: 'std' })}>标准</button><button type="button" className={settings.fontSize === 'big' ? 'on' : ''} onClick={() => save({ ...settings, fontSize: 'big' })}>大字</button></div></div>
        <SwitchRow icon="no" label="小票编号" hint="每封信底部带上 NO. 编号" value={settings.ticketNo} onChange={() => toggle('ticketNo')} />
        <SwitchRow icon="vibe" label="寄信成功时轻震一下" hint="手机上的小确认" value={settings.haptic} onChange={() => toggle('haptic')} />
      </SettingsCard>
      <SettingsCard icon="box" label="数据 · 都存在这台机器里" collapsed={collapsed.data} onToggle={() => toggleCard('data')}>
        <DataRow icon="list" label="日程与待办" value={counts.items} unit="条" /><DataRow icon="receipt" label="小票信件" value={counts.letters} unit="封" /><DataRow icon="star" label="心愿清单" value={counts.wishes} unit="个" /><DataRow icon="hourglass" label="倒数日" value={counts.countdowns} unit="个" />
        <div className="settings-actions data-actions"><button className="settings-mini" type="button" onClick={exportData}>导出全部数据</button><button className={`settings-mini danger ${clearArmed ? 'arm' : ''}`} type="button" onClick={clearData}>{clearArmed ? '确认清空?' : '清空全部数据'}</button></div>
      </SettingsCard>
    </div>
  </div>;
}

type PrintProfile = 'pixel-hard' | 'pixel-soft' | 'thermal-sans';
type SettingsState = { signature: string; printerOn: boolean; rLetter: boolean; rEvening: boolean; rTodo: boolean; remoteLetter: boolean; cloudBackup: boolean; lastBackup: string | null; fontSize: 'std' | 'big'; printProfile: PrintProfile; ticketNo: boolean; haptic: boolean };
const defaultSettings: SettingsState = { signature: '', printerOn: true, rLetter: true, rEvening: false, rTodo: true, remoteLetter: false, cloudBackup: false, lastBackup: null, fontSize: 'std', printProfile: 'thermal-sans', ticketNo: true, haptic: false };
function readSettings(): SettingsState {
  const stored = readLocal<(Partial<SettingsState> & { myName?: string })>('guozi-settings', {});
  return { ...defaultSettings, ...stored, signature: stored.signature ?? stored.myName ?? defaultSettings.signature };
}
function readArray(key: string): unknown[] { return readLocal(key, []); }
function SettingsCard({ icon, label, collapsed, onToggle, children }: { icon: SettingsIconKind; label: string; collapsed: boolean; onToggle: () => void; children: React.ReactNode }) {
  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onToggle();
    }
  };
  return <section className={`settings-card ${collapsed ? 'collapsed' : ''}`}><button className="settings-card-head" type="button" aria-expanded={!collapsed} onClick={onToggle} onKeyDown={handleKeyDown}><SourceSettingsIcon kind={icon} className="source-svg settings-card-icon" /><span className="settings-card-label">{label}</span><b aria-hidden="true">▾</b></button>{!collapsed && <div className="settings-card-body">{children}</div>}</section>;
}
function SwitchRow({ icon, label, hint, value, onChange }: { icon: SettingsIconKind; label: string; hint: string; value: boolean; onChange: () => void }) { return <div className="settings-switch-row"><SourceSettingsIcon kind={icon} className="source-svg settings-row-icon" /><span className="settings-switch-label">{label}<small>{hint}</small></span><button className={`settings-switch ${value ? 'on' : ''}`} type="button" role="switch" aria-checked={value} aria-label={label} onClick={onChange}><i /></button></div>; }
function DataRow({ icon, label, value, unit }: { icon: SettingsIconKind; label: string; value: number; unit: string }) { return <div className="settings-data-row"><SourceSettingsIcon kind={icon} className="source-svg settings-row-icon" /><span>{label}</span><b>{value}</b><span>{unit}</span></div>; }

function BottomNav({ active, unread, onSelect, onPlus }: { active: Tab; unread: number; onSelect: (tab: Tab) => void; onPlus: () => void }) {
  const items: Array<{ id: Tab; label: string }> = [
    { id: 'today', label: '今日' }, { id: 'calendar', label: '日历' }, { id: 'we', label: '我们' }, { id: 'more', label: '设置' },
  ];
  return <nav className="source-phone-nav" aria-label="主导航">
    <button className={`source-nav-item ${active === 'today' ? 'active' : ''}`} onClick={() => onSelect('today')}><span className="source-nav-glyph"><SourceNavIcon kind="home" /></span>今日</button>
    <button className={`source-nav-item ${active === 'calendar' ? 'active' : ''}`} onClick={() => onSelect('calendar')}><span className="source-nav-glyph"><SourceNavIcon kind="calendar" /></span>日历</button>
    <button className="source-nav-item center" onClick={onPlus} aria-label="新增">+</button>
    {items.slice(2).map((item) => <button className={`source-nav-item ${active === item.id ? 'active' : ''}`} key={item.id} onClick={() => onSelect(item.id)}><span className="source-nav-glyph"><SourceNavIcon kind={item.id === 'we' ? 'we' : 'settings'} /></span>{item.label}</button>)}
  </nav>;
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js'));
}
