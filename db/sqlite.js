import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { config } from '../config/config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const db = new Database(config.db.path);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf-8');
db.exec(schema);

// Migrations for existing databases
const quizColumns = db.prepare('PRAGMA table_info(quizzes)').all();
if (!quizColumns.find((c) => c.name === 'auto_advance_enabled')) {
  db.prepare(
    'ALTER TABLE quizzes ADD COLUMN auto_advance_enabled INTEGER NOT NULL DEFAULT 0'
  ).run();
}
if (!quizColumns.find((c) => c.name === 'auto_advance_delay')) {
  db.prepare('ALTER TABLE quizzes ADD COLUMN auto_advance_delay INTEGER NOT NULL DEFAULT 5').run();
}
if (!quizColumns.find((c) => c.name === 'player_layout')) {
  db.prepare("ALTER TABLE quizzes ADD COLUMN player_layout TEXT DEFAULT 'default'").run();
}
if (!quizColumns.find((c) => c.name === 'countdown_seconds')) {
  db.prepare('ALTER TABLE quizzes ADD COLUMN countdown_seconds INTEGER NOT NULL DEFAULT 5').run();
}

export default db;
