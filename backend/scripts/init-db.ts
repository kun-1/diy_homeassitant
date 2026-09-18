import {openDb} from '../src/db.js'; const db=openDb(process.env.DATABASE_PATH??'./data/office-companion.sqlite'); db.close(); console.log('SQLite schema initialized');
