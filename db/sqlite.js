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

// Migrate old question types to new naming convention
// Only runs if old-only types (multiple_select, true_false) still exist
const hasOldOnly = db
  .prepare("SELECT 1 FROM questions WHERE type IN ('multiple_select', 'true_false') LIMIT 1")
  .get();
if (hasOldOnly) {
  db.prepare("UPDATE questions SET type = 'single_choice' WHERE type = 'multiple_choice'").run();
  db.prepare("UPDATE questions SET type = 'multiple_choice' WHERE type = 'multiple_select'").run();
  db.prepare("UPDATE questions SET type = 'single_choice' WHERE type = 'true_false'").run();
}

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
