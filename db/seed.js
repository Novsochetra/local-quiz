import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcrypt';
import db from './sqlite.js';
import { config } from '../config/config.js';

function seedHost() {
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(config.host.username);
  if (existing) {
    console.log('Host user already exists, skipping.');
    return existing.id;
  }

  const id = uuidv4();
  const hash = bcrypt.hashSync(config.host.password, 10);
  db.prepare('INSERT INTO users (id, username, password_hash, role) VALUES (?, ?, ?, ?)').run(
    id,
    config.host.username,
    hash,
    'host'
  );
  console.log('Host user created:', config.host.username);
  return id;
}

function seedSampleQuiz(hostId) {
  const existing = db.prepare('SELECT id FROM quizzes WHERE title = ?').get('Cyberpunk Starter');
  if (existing) {
    console.log('Sample quiz already exists, skipping.');
    return;
  }

  const quizId = uuidv4();
  const code = 'CYBER';
  db.prepare(
    'INSERT INTO quizzes (id, title, description, created_by, code) VALUES (?, ?, ?, ?, ?)'
  ).run(quizId, 'Cyberpunk Starter', 'A sample quiz to test the system.', hostId, code);

  const questions = [
    {
      type: 'multiple_choice',
      text: 'Which color is most associated with cyberpunk neon?',
      timeLimit: 20,
      points: 1000,
      options: [
        { text: 'Cyan', isCorrect: true },
        { text: 'Beige', isCorrect: false },
        { text: 'Olive', isCorrect: false },
        { text: 'Taupe', isCorrect: false },
      ],
    },
    {
      type: 'true_false',
      text: 'The Matrix was released in 1999.',
      timeLimit: 15,
      points: 1000,
      options: [
        { text: 'True', isCorrect: true },
        { text: 'False', isCorrect: false },
      ],
    },
    {
      type: 'multiple_select',
      text: 'Which of these are considered cyberpunk authors?',
      timeLimit: 25,
      points: 1000,
      options: [
        { text: 'William Gibson', isCorrect: true },
        { text: 'Isaac Asimov', isCorrect: false },
        { text: 'Philip K. Dick', isCorrect: true },
        { text: 'Neal Stephenson', isCorrect: true },
      ],
    },
  ];

  for (let qIndex = 0; qIndex < questions.length; qIndex++) {
    const q = questions[qIndex];
    const questionId = uuidv4();
    db.prepare(
      'INSERT INTO questions (id, quiz_id, type, text, time_limit_sec, points, order_index) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(questionId, quizId, q.type, q.text, q.timeLimit, q.points, qIndex);

    for (let oIndex = 0; oIndex < q.options.length; oIndex++) {
      const opt = q.options[oIndex];
      const optionId = uuidv4();
      db.prepare(
        'INSERT INTO options (id, question_id, text, is_correct, order_index) VALUES (?, ?, ?, ?, ?)'
      ).run(optionId, questionId, opt.text, opt.isCorrect ? 1 : 0, oIndex);
    }
  }

  console.log('Sample quiz created with', questions.length, 'questions.');
}

function main() {
  const hostId = seedHost();
  seedSampleQuiz(hostId);
  console.log('Seed complete.');
  db.close();
}

main();
