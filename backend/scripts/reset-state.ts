import { openDb } from '../src/db.js';
import { OfficeService } from '../src/service.js';
import { shanghaiTimeIso, todayInShanghai } from '../src/date.js';

const db = openDb(process.env.DATABASE_PATH ?? './data/office-companion.sqlite');
const today = todayInShanghai();
db.exec("DELETE FROM calendar_events; DELETE FROM todos; DELETE FROM letters; DELETE FROM print_jobs; DELETE FROM devices; UPDATE eink_meta SET value = 0 WHERE key = 'revision';");
const service = new OfficeService(db);
service.calendar.create({
  title: '晨间同步',
  startsAt: shanghaiTimeIso(today, '09:00'),
  endsAt: shanghaiTimeIso(today, '09:30'),
  description: '初始化示例安排',
  location: 'Home',
});
service.todos.create({ title: '整理桌面', completed: false, dueDate: today });
service.letters.create({ title: '给今天的你', body: '慢慢来，今天也会有好事发生。', signature: 'Office Companion', paper: 'border', metadata: {content:'none'} });
const stamp = new Date().toISOString();
const devices = [
  ['macmini-01', 'Mac mini', 'macmini'],
  ['esp32-01', 'ESP32-S3', 'esp32'],
  ['eink-01', 'Desk E-ink', 'eink'],
  ['printer-01', 'EM5823H', 'printer'],
  ['powerbank-01', 'Waveshare UPS 3S', 'powerBank'],
] as const;
for (const [id, name, kind] of devices) {
  db.prepare("INSERT INTO devices (id,name,kind,status,last_seen_at,battery_pct,updated_at) VALUES (?,?,?,'offline',NULL,NULL,?)").run(id, name, kind, stamp);
}
service.bump();
db.close();
console.log('Office Companion state reset');
