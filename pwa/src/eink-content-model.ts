export type EInkDisplayMode = 'birds' | 'summary' | 'schedule' | 'todo' | 'letters';
export type EInkContentKey = 'schedule' | 'todo' | 'letters';

export type EInkArrangement = {
  mode: EInkDisplayMode;
  content: Record<EInkContentKey, boolean>;
};

export const defaultEInkArrangement: EInkArrangement = {
  mode: 'summary',
  content: { schedule: false, todo: false, letters: false },
};

export function normalizeEInkArrangement(value: unknown): EInkArrangement {
  if (!value || typeof value !== 'object') return defaultEInkArrangement;
  const raw = value as Partial<EInkArrangement>;
  const mode = raw.mode === 'birds' || raw.mode === 'schedule' || raw.mode === 'todo' || raw.mode === 'letters' || raw.mode === 'summary' ? raw.mode : 'birds';
  const content = raw.content && typeof raw.content === 'object' ? raw.content as Partial<Record<EInkContentKey, boolean>> : {};
  return { mode, content: { schedule: content.schedule !== false, todo: content.todo !== false, letters: content.letters !== false } };
}

export function arrangementLabel(mode: EInkDisplayMode) {
  return ({ birds: '鸟类画框', summary: '今日摘要', schedule: '只看日程', todo: '只看待办', letters: '只看信件提醒' } as const)[mode];
}

export function visibleEInkContent(arrangement: EInkArrangement): Record<EInkContentKey, boolean> {
  if (arrangement.mode === 'summary') return arrangement.content;
  return { schedule: arrangement.mode === 'schedule', todo: arrangement.mode === 'todo', letters: arrangement.mode === 'letters' };
}
