import { v4 as uuidv4 } from 'uuid';
import db from '../db/sqlite.js';

export function generatePin(length = 6) {
  const min = 10 ** (length - 1);
  const max = 10 ** length - 1;
  return Math.floor(Math.random() * (max - min + 1) + min).toString();
}

export function createSession(quizId, maxPlayers = 50) {
  let pin;
  let attempts = 0;
  do {
    pin = generatePin();
    attempts++;
  } while (db.prepare('SELECT id FROM game_sessions WHERE pin = ?').get(pin) && attempts < 100);

  if (attempts >= 100) {
    throw new Error('Could not generate unique PIN');
  }

  const id = uuidv4();
  db.prepare(
    'INSERT INTO game_sessions (id, quiz_id, pin, status, max_players) VALUES (?, ?, ?, ?, ?)'
  ).run(id, quizId, pin, 'waiting', maxPlayers);

  return { id, pin, quizId, status: 'waiting', maxPlayers };
}

export function getSessionByPin(pin) {
  return db.prepare('SELECT * FROM game_sessions WHERE pin = ?').get(pin);
}

export function getSessionById(id) {
  return db.prepare('SELECT * FROM game_sessions WHERE id = ?').get(id);
}

export function updateSessionStatus(id, status) {
  const now = new Date().toISOString();
  let stmt;
  if (status === 'playing') {
    stmt = db.prepare('UPDATE game_sessions SET status = ?, started_at = ? WHERE id = ?');
    stmt.run(status, now, id);
  } else if (status === 'finished') {
    stmt = db.prepare('UPDATE game_sessions SET status = ?, ended_at = ? WHERE id = ?');
    stmt.run(status, now, id);
  } else {
    stmt = db.prepare('UPDATE game_sessions SET status = ? WHERE id = ?');
    stmt.run(status, id);
  }
  return getSessionById(id);
}

export function finishSession(id, finalResultsJson) {
  const now = new Date().toISOString();
  db.prepare(
    'UPDATE game_sessions SET status = ?, ended_at = ?, final_results_json = ? WHERE id = ?'
  ).run('finished', now, JSON.stringify(finalResultsJson), id);
  return getSessionById(id);
}

export function addPlayer(sessionId, socketId, nickname) {
  const id = uuidv4();
  db.prepare(
    'INSERT INTO players (id, session_id, socket_id, nickname, score) VALUES (?, ?, ?, ?, ?)'
  ).run(id, sessionId, socketId, nickname, 0);
  return getPlayerById(id);
}

export function getPlayerById(id) {
  return db.prepare('SELECT * FROM players WHERE id = ?').get(id);
}

export function getPlayerBySocket(sessionId, socketId) {
  return db
    .prepare('SELECT * FROM players WHERE session_id = ? AND socket_id = ?')
    .get(sessionId, socketId);
}

export function getPlayers(sessionId) {
  return db
    .prepare('SELECT * FROM players WHERE session_id = ? ORDER BY score DESC, joined_at ASC')
    .all(sessionId);
}

export function removePlayer(playerId) {
  const result = db.prepare('DELETE FROM players WHERE id = ?').run(playerId);
  return result.changes > 0;
}

export function updatePlayerScore(playerId, score) {
  db.prepare('UPDATE players SET score = ? WHERE id = ?').run(score, playerId);
  return getPlayerById(playerId);
}

export function saveAnswer(playerId, questionId, selectedOptions, isCorrect, scoreEarned) {
  const id = uuidv4();
  db.prepare(
    'INSERT INTO answers (id, player_id, question_id, selected_options_json, is_correct, score_earned) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(id, playerId, questionId, JSON.stringify(selectedOptions), isCorrect ? 1 : 0, scoreEarned);
  return id;
}

export function getAnswersForQuestion(questionId) {
  return db.prepare('SELECT * FROM answers WHERE question_id = ?').all(questionId);
}

export function getSessionsByQuizId(quizId) {
  return db
    .prepare(
      `SELECT id, pin, status, created_at, started_at, ended_at, final_results_json,
        (SELECT COUNT(*) FROM players WHERE session_id = game_sessions.id) AS player_count
       FROM game_sessions
       WHERE quiz_id = ? AND status = 'finished'
       ORDER BY ended_at DESC`
    )
    .all(quizId)
    .map((session) => ({
      ...session,
      finalResults: JSON.parse(session.final_results_json || '[]'),
    }));
}

export function getSessionDetail(id) {
  const session = db.prepare('SELECT * FROM game_sessions WHERE id = ?').get(id);
  if (!session) return null;
  return {
    ...session,
    finalResults: JSON.parse(session.final_results_json || '[]'),
    players: getPlayers(id),
  };
}

export function getSessionAnswerBreakdown(sessionId) {
  const session = db.prepare('SELECT quiz_id FROM game_sessions WHERE id = ?').get(sessionId);
  if (!session) return null;

  const players = getPlayers(sessionId);
  const questions = db
    .prepare('SELECT * FROM questions WHERE quiz_id = ? ORDER BY order_index ASC')
    .all(session.quiz_id);

  return questions.map((question) => {
    const correctOptions = db
      .prepare(
        'SELECT * FROM options WHERE question_id = ? AND is_correct = 1 ORDER BY order_index ASC'
      )
      .all(question.id);

    const playerAnswers = players.map((player) => {
      const answer = db
        .prepare('SELECT * FROM answers WHERE player_id = ? AND question_id = ?')
        .get(player.id, question.id);

      return {
        playerId: player.id,
        nickname: player.nickname,
        selectedOptions: answer ? JSON.parse(answer.selected_options_json) : [],
        isCorrect: answer ? Boolean(answer.is_correct) : false,
        scoreEarned: answer ? answer.score_earned : 0,
        answeredAt: answer ? answer.answered_at : null,
      };
    });

    return {
      questionId: question.id,
      text: question.text,
      type: question.type,
      points: question.points,
      timeLimitSec: question.time_limit_sec,
      correctOptions: correctOptions.map((o) => ({ id: o.id, text: o.text })),
      playerAnswers,
    };
  });
}
