import { v4 as uuidv4 } from 'uuid';
import db from '../db/sqlite.js';

const VALID_TYPES = ['single_choice', 'multiple_choice'];

export function getAllQuizzes() {
  return db.prepare('SELECT * FROM quizzes ORDER BY created_at DESC').all();
}

export function getQuizById(id) {
  const quiz = db.prepare('SELECT * FROM quizzes WHERE id = ?').get(id);
  if (!quiz) return null;

  const questions = db
    .prepare('SELECT * FROM questions WHERE quiz_id = ? ORDER BY order_index ASC')
    .all(id);

  for (const question of questions) {
    question.options = db
      .prepare('SELECT * FROM options WHERE question_id = ? ORDER BY order_index ASC')
      .all(question.id);
  }

  quiz.questions = questions;
  return quiz;
}

export function getQuizByCode(code) {
  const quiz = db.prepare('SELECT * FROM quizzes WHERE code = ?').get(code);
  if (!quiz) return null;
  return getQuizById(quiz.id);
}

export function deleteQuiz(id) {
  const deleteAnswers = db.prepare(
    'DELETE FROM answers WHERE question_id IN (SELECT id FROM questions WHERE quiz_id = ?)'
  );
  const deleteSessions = db.prepare('DELETE FROM game_sessions WHERE quiz_id = ?');
  const deleteQuiz = db.prepare('DELETE FROM quizzes WHERE id = ?');

  const transaction = db.transaction(() => {
    deleteAnswers.run(id);
    deleteSessions.run(id);
    const result = deleteQuiz.run(id);
    return result.changes > 0;
  });

  return transaction();
}

export function updateQuiz(
  id,
  {
    title,
    description,
    autoAdvanceEnabled,
    autoAdvanceDelay,
    questionReadDelay,
    countdownSeconds,
    playerLayout,
  }
) {
  const enabled = autoAdvanceEnabled ? 1 : 0;
  const delay = Math.min(15, Math.max(3, autoAdvanceDelay ?? 5));
  const readDelay = Math.min(10, Math.max(0, questionReadDelay ?? 3));
  const countdown = Math.min(15, Math.max(1, countdownSeconds ?? 5));
  const layout = ['default', 'options_only'].includes(playerLayout) ? playerLayout : 'default';
  const result = db
    .prepare(
      'UPDATE quizzes SET title = ?, description = ?, auto_advance_enabled = ?, auto_advance_delay = ?, question_read_delay = ?, countdown_seconds = ?, player_layout = ? WHERE id = ?'
    )
    .run(title, description || null, enabled, delay, readDelay, countdown, layout, id);
  return result.changes > 0;
}

export function updateQuestion(id, { timeLimitSec, points }) {
  const result = db
    .prepare('UPDATE questions SET time_limit_sec = ?, points = ? WHERE id = ?')
    .run(timeLimitSec, points, id);
  return result.changes > 0;
}

function validateQuestion(q, index) {
  const errors = [];
  if (!VALID_TYPES.includes(q.type)) {
    errors.push(`Question ${index + 1}: invalid type "${q.type}"`);
  }
  if (!q.text || typeof q.text !== 'string') {
    errors.push(`Question ${index + 1}: missing text`);
  }
  if (!Array.isArray(q.options) || q.options.length < 2) {
    errors.push(`Question ${index + 1}: at least 2 options required`);
    return errors;
  }

  const correctCount = q.options.filter((o) => o.isCorrect).length;
  if (correctCount === 0) {
    errors.push(`Question ${index + 1}: at least one correct option required`);
  }

  if (q.type === 'single_choice' && correctCount !== 1) {
    errors.push(`Question ${index + 1}: exactly one correct option required for ${q.type}`);
  }

  return errors;
}

export function validateQuizJson(data) {
  const errors = [];
  if (!data || typeof data !== 'object') {
    return ['Invalid quiz data'];
  }
  if (!data.title || typeof data.title !== 'string') {
    errors.push('Quiz title is required');
  }
  if (!Array.isArray(data.questions) || data.questions.length === 0) {
    errors.push('Quiz must contain at least one question');
    return errors;
  }

  data.questions.forEach((q, index) => {
    errors.push(...validateQuestion(q, index));
  });

  return errors;
}

export function createQuizFromJson(data, createdBy, code = null) {
  const quizId = uuidv4();

  db.prepare(
    'INSERT INTO quizzes (id, title, description, created_by, code) VALUES (?, ?, ?, ?, ?)'
  ).run(quizId, data.title, data.description || null, createdBy, code);

  for (let i = 0; i < data.questions.length; i++) {
    const q = data.questions[i];
    const questionId = uuidv4();

    db.prepare(
      'INSERT INTO questions (id, quiz_id, type, text, media_url, time_limit_sec, points, order_index) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(
      questionId,
      quizId,
      q.type,
      q.text,
      q.mediaUrl || null,
      q.timeLimit || 20,
      q.points || 1000,
      i
    );

    for (let j = 0; j < q.options.length; j++) {
      const opt = q.options[j];
      const optionId = uuidv4();
      db.prepare(
        'INSERT INTO options (id, question_id, text, is_correct, order_index) VALUES (?, ?, ?, ?, ?)'
      ).run(optionId, questionId, opt.text, opt.isCorrect ? 1 : 0, j);
    }
  }

  return getQuizById(quizId);
}
