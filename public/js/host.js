import { $, api, showScreen } from './utils.js';
import { getSocket } from './socket.js';
import { initAudio, playSound } from './audio.js';

const socket = getSocket();

const screens = {
  login: $('#login-screen'),
  dashboard: $('#dashboard-screen'),
  lobby: $('#lobby-screen'),
  game: $('#game-screen'),
};

let currentPin = null;
let currentQuestion = null;
let autoAdvanceTimer = null;
let autoAdvanceCountdownInterval = null;

function switchTo(screenName) {
  Object.values(screens).forEach((s) => s.classList.add('hidden'));
  screens[screenName].classList.remove('hidden');
}

function showError(id, message) {
  const el = $(id);
  el.textContent = message;
  el.classList.remove('hidden');
}

function hideError(id) {
  $(id).classList.add('hidden');
}

async function login() {
  hideError('#login-error');
  const username = $('#host-username').value.trim();
  const password = $('#host-password').value;

  try {
    const data = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    localStorage.setItem('hostToken', data.token);
    localStorage.setItem('hostUsername', data.username);
    await loadDashboard();
    switchTo('dashboard');
  } catch (err) {
    showError('#login-error', err.message);
  }
}

function logout() {
  localStorage.removeItem('hostToken');
  localStorage.removeItem('hostUsername');
  socket.disconnect();
  location.reload();
}

async function loadDashboard() {
  try {
    const quizzes = await api('/api/quizzes');
    renderQuizList(quizzes);
  } catch (err) {
    console.error('Failed to load quizzes:', err);
  }
}

function renderQuizList(quizzes) {
  const list = $('#quiz-list');
  if (quizzes.length === 0) {
    list.innerHTML = '<p style="color: var(--text-dim);">No quizzes yet. Import one above.</p>';
    return;
  }

  list.innerHTML = quizzes
    .map(
      (q) => `
      <div class="cyber-card animate-fade-in" style="margin-bottom: 1rem;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <div>
            <h4 style="margin: 0; color: var(--neon-cyan);">${q.title}</h4>
            <p style="margin: 0.5rem 0 0; color: var(--text-dim); font-size: 0.9rem;">${q.description || 'No description'}</p>
          </div>
          <button class="cyber-btn start-session-btn" data-id="${q.id}">Host</button>
        </div>
      </div>
    `
    )
    .join('');

  list.querySelectorAll('.start-session-btn').forEach((btn) => {
    btn.addEventListener('click', () => createSession(btn.dataset.id));
  });
}

async function importQuiz() {
  hideError('#import-error');
  $('#import-success').classList.add('hidden');

  const raw = $('#quiz-json').value.trim();
  if (!raw) {
    showError('#import-error', 'Please paste quiz JSON');
    return;
  }

  try {
    const data = JSON.parse(raw);
    await api('/api/quizzes/import', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    $('#import-success').textContent = 'Quiz imported successfully!';
    $('#import-success').classList.remove('hidden');
    $('#quiz-json').value = '';
    await loadDashboard();
  } catch (err) {
    showError('#import-error', err.message);
  }
}

function createSession(quizId) {
  socket.emit('host:create-session', { quizId });
}

function renderLobby(players) {
  $('#player-count').textContent = players.length;
  const list = $('#lobby-player-list');
  if (players.length === 0) {
    list.innerHTML =
      '<p style="color: var(--text-dim); text-align: center;">Waiting for players...</p>';
    return;
  }

  list.innerHTML = players
    .map(
      (p) => `
      <div class="player-chip" style="display: flex; justify-content: space-between; align-items: center; gap: 0.5rem;">
        <span>${p.nickname}</span>
        <button class="kick-btn" data-id="${p.id}" style="background: transparent; border: none; color: var(--neon-red); cursor: pointer; font-weight: 700;">×</button>
      </div>
    `
    )
    .join('');

  list.querySelectorAll('.kick-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      socket.emit('host:kick-player', { playerId: btn.dataset.id });
    });
  });
}

function getAutoAdvanceDelay() {
  const input = $('#auto-advance-seconds');
  const value = parseInt(input.value, 10);
  return Math.min(15, Math.max(3, Number.isNaN(value) ? 5 : value));
}

function isAutoAdvanceEnabled() {
  return $('#auto-advance-toggle').checked;
}

function cancelAutoAdvance() {
  if (autoAdvanceTimer) {
    clearTimeout(autoAdvanceTimer);
    autoAdvanceTimer = null;
  }
  if (autoAdvanceCountdownInterval) {
    clearInterval(autoAdvanceCountdownInterval);
    autoAdvanceCountdownInterval = null;
  }

  const btn = $('#next-question-btn');
  btn.textContent = 'NEXT QUESTION';
  btn.disabled = false;

  if (currentPin) {
    socket.emit('host:auto-advance-cancelled');
  }
}

function startAutoAdvance() {
  if (!isAutoAdvanceEnabled()) return;

  const seconds = getAutoAdvanceDelay();
  const btn = $('#next-question-btn');
  let remaining = seconds;

  btn.textContent = `NEXT QUESTION (${remaining})`;

  socket.emit('host:auto-advance-started', { seconds });

  autoAdvanceCountdownInterval = setInterval(() => {
    remaining--;
    if (remaining > 0) {
      btn.textContent = `NEXT QUESTION (${remaining})`;
    } else {
      clearInterval(autoAdvanceCountdownInterval);
      autoAdvanceCountdownInterval = null;
      btn.textContent = 'NEXT QUESTION';
    }
  }, 1000);

  autoAdvanceTimer = setTimeout(() => {
    autoAdvanceTimer = null;
    emitNextQuestion();
  }, seconds * 1000);
}

function emitNextQuestion() {
  cancelAutoAdvance();
  socket.emit('host:next-question');
}

function renderHostQuestion(question) {
  currentQuestion = question;
  showScreen(screens.game, 'host-question-view');
  $('#host-question-number').textContent =
    `Question ${question.index + 1} / ${question.totalQuestions}`;
  $('#host-question-text').textContent = question.text;
  $('#host-timer').textContent = question.timeLimit;

  const container = $('#host-options');
  container.innerHTML = question.options
    .map(
      (opt) => `
      <div class="option-btn" data-id="${opt.id}">${opt.text}</div>
    `
    )
    .join('');
}

function renderLeaderboard(leaderboard) {
  showScreen(screens.game, 'host-leaderboard-view');
  const list = $('#host-leaderboard');
  list.innerHTML = leaderboard
    .slice(0, 10)
    .map(
      (p) => `
      <div class="leaderboard-item">
        <div class="leaderboard-rank">${p.rank}</div>
        <div class="leaderboard-name">${p.nickname}</div>
        <div class="leaderboard-score">${p.score.toLocaleString()}</div>
      </div>
    `
    )
    .join('');

  startAutoAdvance();
}

function renderGameOver(podium, leaderboard) {
  showScreen(screens.game, 'host-results-view');

  const podiumEl = $('#host-podium');
  const ordered = [podium[1], podium[0], podium[2]].filter(Boolean);
  const places = ['second', 'first', 'third'];

  podiumEl.innerHTML = ordered
    .map(
      (p, i) => `
      <div class="podium-item ${places[i]} animate-pop">
        <div style="font-size: 2rem; margin-bottom: 0.5rem;">${i === 1 ? '👑' : '#' + p.rank}</div>
        <div style="word-break: break-word;">${p.nickname}</div>
        <div style="margin-top: 0.5rem; font-size: 1.1rem;">${p.score.toLocaleString()}</div>
      </div>
    `
    )
    .join('');

  $('#host-final-leaderboard').innerHTML = leaderboard
    .slice(0, 10)
    .map(
      (p) => `
      <div class="leaderboard-item">
        <div class="leaderboard-rank">${p.rank}</div>
        <div class="leaderboard-name">${p.nickname}</div>
        <div class="leaderboard-score">${p.score.toLocaleString()}</div>
      </div>
    `
    )
    .join('');
}

// Event listeners
$('#login-btn').addEventListener('click', login);
$('#logout-btn').addEventListener('click', logout);
$('#import-btn').addEventListener('click', importQuiz);
$('#start-game-btn').addEventListener('click', () => {
  socket.emit('host:start-game');
});
$('#next-question-btn').addEventListener('click', emitNextQuestion);
$('#auto-advance-toggle').addEventListener('change', () => {
  if (isAutoAdvanceEnabled()) {
    startAutoAdvance();
  } else {
    cancelAutoAdvance();
  }
});
$('#auto-advance-seconds').addEventListener('change', () => {
  if (isAutoAdvanceEnabled() && (autoAdvanceTimer || autoAdvanceCountdownInterval)) {
    cancelAutoAdvance();
    startAutoAdvance();
  }
});

// Socket events
socket.on('host:session-created', ({ pin, quizTitle }) => {
  currentPin = pin;
  $('#lobby-pin').textContent = pin;
  $('#lobby-quiz-title').textContent = quizTitle;
  renderLobby([]);
  switchTo('lobby');
});

socket.on('server:lobby-update', ({ players, pin }) => {
  if (currentPin === pin) {
    renderLobby(players);
    playSound('join');
  }
});

socket.on('server:game-started', () => {
  switchTo('game');
});

socket.on('server:question', (question) => {
  renderHostQuestion(question);
});

socket.on('server:answer-reveal', ({ correctOptionIds }) => {
  if (!currentQuestion) return;
  $('#host-options')
    .querySelectorAll('.option-btn')
    .forEach((btn) => {
      btn.style.opacity = '0.5';
      if (correctOptionIds.includes(btn.dataset.id)) {
        btn.classList.add('correct');
        btn.style.opacity = '1';
      }
    });
});

socket.on('server:leaderboard', ({ leaderboard }) => {
  renderLeaderboard(leaderboard);
});

socket.on('server:game-over', ({ podium, leaderboard }) => {
  cancelAutoAdvance();
  renderGameOver(podium, leaderboard);
  playSound('winner');
});

socket.on('server:error', ({ message }) => {
  alert(`Error: ${message}`);
});

// Init
initAudio();
if (localStorage.getItem('hostToken')) {
  loadDashboard().then(() => switchTo('dashboard'));
} else {
  switchTo('login');
}
