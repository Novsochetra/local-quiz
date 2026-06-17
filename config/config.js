import dotenv from 'dotenv';

dotenv.config();

const required = ['JWT_SECRET'];
for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  jwtSecret: process.env.JWT_SECRET,
  host: {
    username: process.env.HOST_USERNAME || 'host',
    password: process.env.HOST_PASSWORD || 'host1234',
  },
  game: {
    maxPlayers: parseInt(process.env.MAX_PLAYERS_PER_GAME || '50', 10),
    defaultQuestionTimeSec: parseInt(process.env.DEFAULT_QUESTION_TIME_SEC || '20', 10),
    defaultPoints: parseInt(process.env.DEFAULT_POINTS || '1000', 10),
    fullScoreWindowSec: parseInt(process.env.FULL_SCORE_WINDOW_SEC || '5', 10),
    pinLength: 6,
  },
  db: {
    path: process.env.DB_PATH || './db/quiz.db',
  },
  upload: {
    destination: './uploads',
    maxFileSize: 5 * 1024 * 1024, // 5MB
  },
};
