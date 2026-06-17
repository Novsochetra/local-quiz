import { io } from 'socket.io-client';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

function startServer() {
  return new Promise((resolve, reject) => {
    const server = spawn('node', [path.join(__dirname, '..', 'server.js')], {
      stdio: 'pipe',
    });

    let output = '';
    server.stdout.on('data', (chunk) => {
      output += chunk.toString();
      if (output.includes('Local Quiz server running')) {
        resolve(server);
      }
    });

    server.stderr.on('data', (chunk) => {
      console.error(chunk.toString().trim());
    });

    server.on('error', reject);

    setTimeout(() => reject(new Error('Server startup timeout')), 10000);
  });
}

async function login() {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'host', password: 'host1234' }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Login failed');
  return data.token;
}

async function getQuizzes(token) {
  const res = await fetch(`${BASE_URL}/api/quizzes`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.json();
}

async function getQuiz(token, id) {
  const res = await fetch(`${BASE_URL}/api/quizzes/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.json();
}

async function updateQuizSettings(token, id, settings) {
  const res = await fetch(`${BASE_URL}/api/quizzes/${id}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(settings),
  });
  if (!res.ok) throw new Error('Failed to update quiz settings');
}

function createSocket() {
  return io(BASE_URL, { transports: ['websocket'] });
}

function waitFor(socket, event, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout waiting for ${event}`)), timeout);
    socket.once(event, (data) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

async function runTest() {
  console.log('Starting E2E test...');

  const server = await startServer();

  try {
    const token = await login();
    console.log('Host logged in');

    const quizzes = await getQuizzes(token);
    const quizSummary = quizzes.find((q) => q.title === 'Cyberpunk Starter') || quizzes[0];
    const quiz = await getQuiz(token, quizSummary.id);
    console.log('Using quiz:', quiz.title);

    await updateQuizSettings(token, quiz.id, {
      title: quiz.title,
      description: quiz.description,
      autoAdvance: { enabled: false, delay: 5 },
      countdownSeconds: 1,
      playerLayout: quiz.player_layout || 'default',
      questions: quiz.questions.map((q) => ({
        id: q.id,
        timeLimitSec: q.time_limit_sec,
        points: q.points,
      })),
    });

    const host = createSocket();
    host.emit('host:create-session', { quizId: quiz.id });
    const session = await waitFor(host, 'host:session-created');
    console.log('Session created with PIN:', session.pin);

    const players = [];
    for (let i = 0; i < 3; i++) {
      const p = createSocket();
      const nickname = `Player${i + 1}`;
      p.emit('player:join', { pin: session.pin, nickname });
      const joined = await waitFor(p, 'player:joined');
      console.log(`${nickname} joined`);
      players.push({ socket: p, id: joined.playerId, nickname });
    }

    const lobbyUpdate = await waitFor(host, 'server:lobby-update');
    console.log('Lobby players:', lobbyUpdate.players.map((p) => p.nickname).join(', '));

    host.emit('host:start-game');
    await waitFor(host, 'server:game-started');
    console.log('Game started');

    for (let qIndex = 0; qIndex < quiz.questions.length; qIndex++) {
      await waitFor(players[0].socket, 'server:question-countdown', 5000);
      const question = await waitFor(players[0].socket, 'server:question', 5000);
      console.log(`Question ${qIndex + 1}:`, question.text);

      for (const player of players) {
        const option = question.options[qIndex % question.options.length];
        player.socket.emit('player:answer', {
          questionIndex: question.index,
          selectedOptions: [option.id],
        });
      }

      await waitFor(players[0].socket, 'server:leaderboard', 5000);
      console.log(`Leaderboard received for question ${qIndex + 1}`);

      host.emit('host:next-question');
    }

    const results = await waitFor(players[0].socket, 'server:game-over');
    console.log(
      'Game over. Podium:',
      results.podium.map((p) => `${p.nickname} (${p.score})`).join(', ')
    );

    host.disconnect();
    players.forEach((p) => p.socket.disconnect());

    console.log('E2E test passed!');
  } finally {
    server.kill();
  }
}

runTest().catch((err) => {
  console.error('E2E test failed:', err);
  process.exit(1);
});
