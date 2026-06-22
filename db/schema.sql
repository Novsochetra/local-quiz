-- Users table (host accounts)
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'host',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Quizzes
CREATE TABLE IF NOT EXISTS quizzes (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  created_by TEXT NOT NULL,
  code TEXT UNIQUE,
  auto_advance_enabled INTEGER NOT NULL DEFAULT 0,
  auto_advance_delay INTEGER NOT NULL DEFAULT 5,
  question_read_delay INTEGER NOT NULL DEFAULT 3,
  countdown_seconds INTEGER NOT NULL DEFAULT 5,
  player_layout TEXT NOT NULL DEFAULT 'default' CHECK(player_layout IN ('default', 'options_only')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id)
);

-- Questions
CREATE TABLE IF NOT EXISTS questions (
  id TEXT PRIMARY KEY,
  quiz_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('single_choice', 'multiple_choice')),
  text TEXT NOT NULL,
  media_url TEXT,
  time_limit_sec INTEGER NOT NULL DEFAULT 20,
  points INTEGER NOT NULL DEFAULT 1000,
  order_index INTEGER NOT NULL,
  FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE
);

-- Options
CREATE TABLE IF NOT EXISTS options (
  id TEXT PRIMARY KEY,
  question_id TEXT NOT NULL,
  text TEXT NOT NULL,
  is_correct INTEGER NOT NULL DEFAULT 0,
  order_index INTEGER NOT NULL,
  FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
);

-- Game sessions
CREATE TABLE IF NOT EXISTS game_sessions (
  id TEXT PRIMARY KEY,
  quiz_id TEXT NOT NULL,
  pin TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'waiting' CHECK(status IN ('waiting', 'playing', 'finished')),
  max_players INTEGER NOT NULL DEFAULT 50,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  started_at DATETIME,
  ended_at DATETIME,
  final_results_json TEXT,
  FOREIGN KEY (quiz_id) REFERENCES quizzes(id)
);

-- Players in a session
CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  socket_id TEXT NOT NULL,
  nickname TEXT NOT NULL,
  score INTEGER NOT NULL DEFAULT 0,
  joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(session_id, nickname),
  FOREIGN KEY (session_id) REFERENCES game_sessions(id) ON DELETE CASCADE
);

-- Answers
CREATE TABLE IF NOT EXISTS answers (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL,
  question_id TEXT NOT NULL,
  selected_options_json TEXT NOT NULL,
  is_correct INTEGER NOT NULL DEFAULT 0,
  score_earned INTEGER NOT NULL DEFAULT 0,
  answered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE,
  FOREIGN KEY (question_id) REFERENCES questions(id)
);
