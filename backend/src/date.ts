export function todayInShanghai(value = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(value);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function shanghaiTimeIso(date: string, time: string) {
  return new Date(`${date}T${time}:00+08:00`).toISOString();
}
