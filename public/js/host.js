import { $, api, showScreen, escapeHtml } from './utils.js';
import { getSocket } from './socket.js';
import { initAudio, playSound } from './audio.js';
import { celebrate } from './confetti.js';
import { showNotification } from './notifications.js';

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
let currentQuizAutoAdvance = { enabled: false, delay: 5 };
let currentQuizReadDelay = 3;
let hostTimerInterval = null;
let currentHostPlayers = [];
let lobbyPlayers = [];
let joinUrl = '';

async function copyToClipboard(text) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
  } catch {
    // clipboard API failed, fall through
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  textarea.style.pointerEvents = 'none';
  document.body.appendChild(textarea);
  textarea.select();
  try {
    document.execCommand('copy');
  } catch {
    throw new Error('Copy failed');
  } finally {
    document.body.removeChild(textarea);
  }
}

function switchTo(screenName) {
  Object.values(screens).forEach((s) => s.classList.add('hidden'));
  const target = screens[screenName];
  target.classList.remove('hidden');
  const firstFocusable = target.querySelector(
    'button, input, select, textarea, [tabindex]:not([tabindex="-1"])'
  );
  if (firstFocusable) firstFocusable.focus();
}

function showError(id, message) {
  const el = $(id);
  el.textContent = message;
  el.classList.remove('hidden');
}

function hideError(id) {
  $(id).classList.add('hidden');
}

function setLoading(btnId, loading, text, normalText) {
  const btn = $(btnId);
  btn.disabled = loading;
  btn.textContent = loading ? text : normalText;
}

async function login() {
  hideError('#login-error');
  const username = $('#host-username').value.trim();
  const password = $('#host-password').value;

  setLoading('#login-btn', true, 'LOADING...', 'ENTER');
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
  } finally {
    setLoading('#login-btn', false, 'LOADING...', 'ENTER');
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
        <div style="display: flex; justify-content: space-between; align-items: center; gap: 1rem;">
          <div style="flex: 1; min-width: 0;">
            <h4 style="margin: 0; color: var(--cyan);">${q.title}</h4>
            <p style="margin: 0.5rem 0 0; color: var(--text-dim); font-size: 0.9rem;">${q.description || 'No description'}</p>
          </div>
          <div class="quiz-actions">
            <button class="cyber-btn danger delete-quiz-btn" data-id="${q.id}" aria-label="Delete quiz" title="Delete quiz">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="delete-icon">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                <line x1="10" y1="11" x2="10" y2="17"></line>
                <line x1="14" y1="11" x2="14" y2="17"></line>
              </svg>
            </button>
            <button class="cyber-btn results-btn" data-id="${q.id}">Results</button>
            <button class="cyber-btn settings-btn" data-id="${q.id}">Settings</button>
            <button class="cyber-btn start-session-btn" data-id="${q.id}">Host</button>
          </div>
        </div>
      </div>
    `
    )
    .join('');

  list.querySelectorAll('.start-session-btn').forEach((btn) => {
    btn.addEventListener('click', () => createSession(btn.dataset.id));
  });

  list.querySelectorAll('.settings-btn').forEach((btn) => {
    btn.addEventListener('click', () => openQuizSettings(btn.dataset.id));
  });

  list.querySelectorAll('.results-btn').forEach((btn) => {
    btn.addEventListener('click', () => openQuizResults(btn.dataset.id));
  });

  list.querySelectorAll('.delete-quiz-btn').forEach((btn) => {
    btn.addEventListener('click', () => deleteQuiz(btn.dataset.id, btn));
  });
}

async function deleteQuiz(quizId, button) {
  if (!confirm('Are you sure you want to delete this quiz? This cannot be undone.')) {
    return;
  }

  button.disabled = true;
  try {
    await api(`/api/quizzes/${quizId}`, { method: 'DELETE' });
    await loadDashboard();
  } catch (err) {
    showNotification({
      title: 'DELETE FAILED',
      message: err.message,
      color: '#ff4444',
    });
  } finally {
    button.disabled = false;
  }
}

async function importQuiz() {
  hideError('#import-error');
  $('#import-success').classList.add('hidden');

  const raw = $('#quiz-json').value.trim();
  if (!raw) {
    showError('#import-error', 'Please paste quiz JSON');
    return;
  }

  setLoading('#import-btn', true, 'IMPORTING...', 'IMPORT');
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
  } finally {
    setLoading('#import-btn', false, 'IMPORTING...', 'IMPORT');
  }
}

function createSession(quizId) {
  socket.emit('host:create-session', { quizId });
}

let currentSettingsQuiz = null;

function openQuizSettings(quizId) {
  hideError('#quiz-settings-error');
  $('#quiz-settings-success').classList.add('hidden');

  api(`/api/quizzes/${quizId}`)
    .then((quiz) => {
      currentSettingsQuiz = quiz;
      renderQuizSettings(quiz);
      $('#quiz-settings-modal').classList.add('active');
    })
    .catch((err) => {
      showNotification({
        title: 'SETTINGS ERROR',
        message: `Failed to load quiz settings: ${err.message}`,
        color: '#ff4444',
      });
    });
}

function closeQuizSettings() {
  $('#quiz-settings-modal').classList.remove('active');
  currentSettingsQuiz = null;
}

function renderQuizSettings(quiz) {
  $('#settings-quiz-id').value = quiz.id;
  $('#settings-quiz-title').value = quiz.title;
  $('#settings-quiz-description').value = quiz.description || '';
  $('#settings-auto-advance-toggle').checked = !!quiz.auto_advance_enabled;
  $('#settings-auto-advance-seconds').value = quiz.auto_advance_delay ?? 5;
  $('#settings-countdown-seconds').value = quiz.countdown_seconds ?? 5;
  $('#settings-read-delay').value = quiz.question_read_delay ?? 3;
  $('#settings-player-layout').value = ['default', 'options_only'].includes(quiz.player_layout)
    ? quiz.player_layout
    : 'default';

  const list = $('#settings-questions-list');
  if (!quiz.questions || quiz.questions.length === 0) {
    list.innerHTML = '<p style="color: var(--text-dim);">No questions found.</p>';
    return;
  }

  list.innerHTML = quiz.questions
    .map(
      (q, index) => `
      <div class="settings-question" data-id="${q.id}">
        <div class="settings-question-text">${index + 1}. ${q.text}</div>
        <div class="settings-row">
          <div class="form-group" style="margin-bottom: 0;">
            <label>Time Limit (sec)</label>
            <input
              type="number"
              class="cyber-input settings-time-limit"
              value="${q.time_limit_sec}"
              min="5"
              max="300"
              data-id="${q.id}"
            />
          </div>
          <div class="form-group" style="margin-bottom: 0;">
            <label>Points</label>
            <input
              type="number"
              class="cyber-input settings-points"
              value="${q.points}"
              min="0"
              max="100000"
              data-id="${q.id}"
            />
          </div>
        </div>
      </div>
    `
    )
    .join('');
}

async function saveQuizSettings() {
  hideError('#quiz-settings-error');
  $('#quiz-settings-success').classList.add('hidden');

  if (!currentSettingsQuiz) return;

  const title = $('#settings-quiz-title').value.trim();
  const description = $('#settings-quiz-description').value.trim();
  const autoAdvance = {
    enabled: isSettingsAutoAdvanceEnabled(),
    delay: getSettingsAutoAdvanceDelay(),
  };
  const countdownSeconds = getSettingsCountdownSeconds();
  const playerLayout = $('#settings-player-layout').value;
  const questionReadDelay = getSettingsReadDelay();

  if (!title) {
    showError('#quiz-settings-error', 'Quiz title is required');
    return;
  }

  if (Number.isNaN(countdownSeconds) || countdownSeconds < 1 || countdownSeconds > 15) {
    showError('#quiz-settings-error', 'Countdown must be between 1 and 15 seconds');
    return;
  }

  const questions = Array.from($('#settings-questions-list').querySelectorAll('.settings-question'))
    .map((el) => {
      const id = el.dataset.id;
      const timeInput = el.querySelector('.settings-time-limit');
      const pointsInput = el.querySelector('.settings-points');
      if (!id || !timeInput || !pointsInput) return null;
      const timeLimitSec = parseInt(timeInput.value, 10);
      const points = parseInt(pointsInput.value, 10);
      return { id, timeLimitSec, points };
    })
    .filter(Boolean);

  if (questions.length === 0) {
    showError('#quiz-settings-error', 'Quiz must contain at least one question');
    return;
  }

  for (const q of questions) {
    if (Number.isNaN(q.timeLimitSec) || q.timeLimitSec < 5 || q.timeLimitSec > 300) {
      showError('#quiz-settings-error', 'Time limit must be between 5 and 300 seconds');
      return;
    }
    if (Number.isNaN(q.points) || q.points < 0 || q.points > 100000) {
      showError('#quiz-settings-error', 'Points must be between 0 and 100000');
      return;
    }
  }

  setLoading('#quiz-settings-save', true, 'SAVING...', 'SAVE');
  try {
    await api(`/api/quizzes/${currentSettingsQuiz.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        title,
        description,
        autoAdvance,
        questionReadDelay,
        countdownSeconds,
        playerLayout,
        questions,
      }),
    });

    $('#quiz-settings-success').textContent = 'Quiz settings saved successfully!';
    $('#quiz-settings-success').classList.remove('hidden');

    showNotification({
      title: 'CONFIG UPDATED',
      message: 'Quiz settings saved successfully.',
      color: '#00ff9d',
    });

    await loadDashboard();

    setTimeout(() => {
      closeQuizSettings();
    }, 800);
  } catch (err) {
    showError('#quiz-settings-error', err.message);
  } finally {
    setLoading('#quiz-settings-save', false, 'SAVING...', 'SAVE');
  }
}

// Quiz results history
let currentResultsQuizId = null;

function closeQuizResults() {
  $('#quiz-results-modal').classList.remove('active');
  currentResultsQuizId = null;
  $('#results-list-view').classList.remove('hidden');
  $('#results-detail-view').classList.add('hidden');
  $('#results-back-btn').classList.add('hidden');
}

function showResultsList() {
  $('#results-list-view').classList.remove('hidden');
  $('#results-detail-view').classList.add('hidden');
  $('#results-back-btn').classList.add('hidden');
}

async function openQuizResults(quizId) {
  currentResultsQuizId = quizId;
  $('#results-modal-title').textContent = 'Loading...';
  $('#results-list').innerHTML =
    '<p style="color: var(--text-dim); text-align: center; padding: 24px 0;">Loading sessions...</p>';
  $('#quiz-results-modal').classList.add('active');
  try {
    const [quiz, sessions] = await Promise.all([
      api(`/api/quizzes/${quizId}`),
      api(`/api/quizzes/${quizId}/sessions`),
    ]);
    $('#results-modal-title').textContent = quiz.title;
    renderSessionList(sessions);
  } catch (err) {
    $('#results-list').innerHTML =
      `<p style="color: var(--red); text-align: center; padding: 24px 0;">Failed to load results: ${escapeHtml(err.message)}</p>`;
  }
}

function renderSessionList(sessions) {
  const container = $('#results-list');
  if (sessions.length === 0) {
    container.innerHTML = `
      <p style="color: var(--text-dim); text-align: center; padding: 24px 0;">
        No completed games for this quiz yet.
      </p>
    `;
    return;
  }

  container.innerHTML = sessions
    .map(
      (session) => `
      <div class="results-session-row" data-id="${session.id}">
        <div class="results-session-info">
          <div class="results-session-date">${formatSessionDate(session.ended_at)}</div>
          <div class="results-session-meta">PIN: ${session.pin} · ${session.player_count} players</div>
        </div>
        <button class="cyber-btn results-view-btn" data-id="${session.id}">View</button>
      </div>
    `
    )
    .join('');

  container.querySelectorAll('.results-view-btn').forEach((btn) => {
    btn.addEventListener('click', () => openSessionDetail(btn.dataset.id));
  });
}

function formatSessionDate(isoString) {
  if (!isoString) return 'Unknown date';
  const date = new Date(isoString);
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

async function openSessionDetail(sessionId) {
  try {
    const [session, breakdown] = await Promise.all([
      api(`/api/sessions/${sessionId}`),
      api(`/api/sessions/${sessionId}/answers`),
    ]);

    renderSessionDetail(session, breakdown);
    $('#results-list-view').classList.add('hidden');
    $('#results-detail-view').classList.remove('hidden');
    $('#results-back-btn').classList.remove('hidden');
  } catch (err) {
    showNotification({
      title: 'SESSION ERROR',
      message: `Failed to load session details: ${err.message}`,
      color: '#ff4444',
    });
  }
}

function renderSessionDetail(session, breakdown) {
  const leaderboardEl = $('#detail-leaderboard');
  const podium = buildPodium(session.finalResults);

  leaderboardEl.innerHTML = `
    <div class="cyber-card" style="margin-bottom: 1.5rem;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; flex-wrap: wrap; gap: 0.5rem;">
        <div>
          <div style="color: var(--text-dim); font-size: 0.8rem;">PIN</div>
          <div style="color: var(--yellow); font-weight: 700;">${session.pin}</div>
        </div>
        <div style="text-align: right;">
          <div style="color: var(--text-dim); font-size: 0.8rem;">ENDED</div>
          <div style="font-weight: 700;">${formatSessionDate(session.ended_at)}</div>
        </div>
      </div>
      <div class="podium">${podium}</div>
      <div class="leaderboard-list">${renderLeaderboardRows(session.finalResults)}</div>
    </div>
  `;

  const breakdownEl = $('#detail-question-breakdown');
  breakdownEl.innerHTML = `
    <h3 style="margin: 2rem 0 1rem; color: var(--text-dim); font-size: 0.9rem;">QUESTION BREAKDOWN</h3>
    ${breakdown.map((q) => renderQuestionBreakdown(q)).join('')}
  `;
}

function buildPodium(leaderboard) {
  const ordered = [leaderboard[1], leaderboard[0], leaderboard[2]].filter(Boolean);
  const places = ['second', 'first', 'third'];

  return ordered
    .map(
      (p, i) => `
      <div class="podium-item ${places[i]} animate-pop">
        <div style="font-size: 2rem; margin-bottom: 0.5rem;">${i === 1 ? '👑' : '#' + p.rank}</div>
        <div style="word-break: break-word;">${escapeHtml(p.nickname)}</div>
        <div style="margin-top: 0.5rem; font-size: 1.1rem;">${p.score.toLocaleString()}</div>
      </div>
    `
    )
    .join('');
}

function renderLeaderboardRows(leaderboard) {
  return leaderboard
    .slice(0, 10)
    .map(
      (p) => `
      <div class="leaderboard-item">
        <div class="leaderboard-rank">${p.rank}</div>
        <div class="leaderboard-name">${escapeHtml(p.nickname)}</div>
        <div class="leaderboard-score">${p.score.toLocaleString()}</div>
      </div>
    `
    )
    .join('');
}

function renderQuestionBreakdown(question) {
  const correctText = question.correctOptions.map((o) => escapeHtml(o.text)).join(', ');

  return `
    <div class="cyber-card results-question-block">
      <div class="results-question-header">
        <div class="results-question-text">${escapeHtml(question.text)}</div>
        <div class="results-question-meta">${question.type.replace(/_/g, ' ')} · ${question.points} pts</div>
      </div>
      <div class="results-correct-answer">
        <span style="color: var(--green);">Correct:</span> ${correctText}
      </div>
      <div class="results-player-answers">
        ${question.playerAnswers
          .map(
            (a) => `
          <div class="results-player-row">
            <span class="results-player-name">${escapeHtml(a.nickname)}</span>
            <span class="results-player-answer ${a.isCorrect ? 'correct' : 'wrong'}">
              ${a.isCorrect ? '✓' : '✗'} ${formatSelectedOptions(a.selectedOptions)}
            </span>
            <span class="results-player-score">${a.scoreEarned.toLocaleString()}</span>
          </div>
        `
          )
          .join('')}
      </div>
    </div>
  `;
}

function formatSelectedOptions(selectedOptions) {
  if (!selectedOptions || selectedOptions.length === 0) return 'No answer';
  if (typeof selectedOptions[0] === 'object') {
    return selectedOptions.map((o) => escapeHtml(o.text)).join(', ');
  }
  return selectedOptions.join(', ');
}

function renderLobby(players) {
  lobbyPlayers = players;
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
        <button class="kick-btn" data-id="${p.id}" style="background: transparent; border: none; color: var(--red); cursor: pointer; font-weight: 700;">×</button>
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

function getSettingsAutoAdvanceDelay() {
  const input = $('#settings-auto-advance-seconds');
  const value = parseInt(input.value, 10);
  return Math.min(15, Math.max(3, Number.isNaN(value) ? 5 : value));
}

function getSettingsReadDelay() {
  const input = $('#settings-read-delay');
  const value = parseInt(input.value, 10);
  return Math.min(10, Math.max(0, Number.isNaN(value) ? 3 : value));
}

function getSettingsCountdownSeconds() {
  const input = $('#settings-countdown-seconds');
  const value = parseInt(input.value, 10);
  return Math.min(15, Math.max(1, Number.isNaN(value) ? 5 : value));
}

function isSettingsAutoAdvanceEnabled() {
  return $('#settings-auto-advance-toggle').checked;
}

function isAutoAdvanceEnabled() {
  return currentQuizAutoAdvance.enabled;
}

function getAutoAdvanceDelay() {
  return currentQuizAutoAdvance.delay;
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

  $('#auto-advance-bar').classList.add('hidden');

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
  const totalMs = seconds * 1000;
  const start = Date.now();

  btn.textContent = `NEXT QUESTION (${remaining})`;

  const bar = $('#auto-advance-bar');
  const fill = $('#auto-advance-fill');
  bar.classList.remove('hidden');
  fill.style.width = '100%';
  fill.classList.remove('warning');

  socket.emit('host:auto-advance-started', { seconds });

  autoAdvanceCountdownInterval = setInterval(() => {
    const elapsed = Date.now() - start;
    remaining = Math.max(0, Math.ceil((totalMs - elapsed) / 1000));
    const pct = (Math.max(0, totalMs - elapsed) / totalMs) * 100;

    fill.style.width = `${pct}%`;
    if (pct < 30) fill.classList.add('warning');

    if (remaining > 0) {
      btn.textContent = `NEXT QUESTION (${remaining})`;
    } else {
      clearInterval(autoAdvanceCountdownInterval);
      autoAdvanceCountdownInterval = null;
      btn.textContent = 'NEXT QUESTION';
    }
  }, 100);

  autoAdvanceTimer = setTimeout(() => {
    autoAdvanceTimer = null;
    emitNextQuestion();
  }, seconds * 1000);
}

function emitNextQuestion() {
  cancelAutoAdvance();
  socket.emit('host:next-question');
}

function startHostTimer(durationSec) {
  clearInterval(hostTimerInterval);
  const start = Date.now();
  const totalMs = durationSec * 1000;

  const fill = $('#host-timer-fill');
  const display = $('#host-timer');

  display.textContent = durationSec;
  fill.style.width = '100%';
  fill.classList.remove('warning');

  hostTimerInterval = setInterval(() => {
    const elapsed = Date.now() - start;
    const remaining = Math.max(0, totalMs - elapsed);
    const remainingSec = Math.ceil(remaining / 1000);
    const pct = (remaining / totalMs) * 100;

    display.textContent = remainingSec;
    fill.style.width = `${pct}%`;

    if (pct < 30) {
      fill.classList.add('warning');
    }

    if (remaining <= 0) {
      clearInterval(hostTimerInterval);
      hostTimerInterval = null;
    }
  }, 100);
}

function renderHostAnswerStatus({ answeredCount, totalPlayers, players }) {
  currentHostPlayers = players;
  $('#host-answer-count').textContent = `${answeredCount} / ${totalPlayers} answered`;

  const statusEl = $('#host-player-status');
  if (!players || players.length === 0) {
    statusEl.innerHTML = '<p style="color: var(--text-dim);">No players connected</p>';
    return;
  }

  statusEl.innerHTML = players
    .map((p) => {
      const dotClass = p.connected ? 'connected' : 'disconnected';
      const label = p.connected ? p.nickname : `${p.nickname} (DC)`;
      return `
      <div class="host-player-status-item ${!p.connected ? 'disconnected' : ''}">
        <span class="host-player-status-dot ${dotClass}"></span>
        <span class="host-player-status-name">${label}</span>
      </div>
    `;
    })
    .join('');
}

function renderHostQuestion(question) {
  currentQuestion = question;
  showScreen(screens.game, 'host-question-view');
  $('#host-player-sidebar').classList.remove('hidden');
  $('.hqv-content').classList.remove('reveal-layout');
  $('#host-question-number').textContent =
    `Question ${question.index + 1} / ${question.totalQuestions}`;
  $('#host-question-text').textContent = question.text;
  $('#host-answer-count').textContent = '0 / 0 answered';
  $('#host-player-status').innerHTML = '';

  const container = $('#host-options');
  container.innerHTML = question.options
    .map(
      (opt) => `
      <div class="option-btn" data-id="${opt.id}">${escapeHtml(opt.text)}</div>
    `
    )
    .join('');

  startHostTimer(question.timeLimit);

  const qtext = $('#host-question-text');
  const readDelay = currentQuizReadDelay;
  if (readDelay > 0) {
    qtext.classList.add('read-mode-text');
    container.classList.add('options-hidden');
    setTimeout(() => {
      qtext.classList.remove('read-mode-text');
      container.classList.remove('options-hidden');
      $('.hqv-content').classList.add('reveal-layout');
    }, readDelay * 1000);
  } else {
    $('.hqv-content').classList.add('reveal-layout');
  }
}

let hostSplashCountdownInterval = null;

function resetHostSplashCountdown() {
  clearInterval(hostSplashCountdownInterval);
  hostSplashCountdownInterval = null;
}

function renderHostSplash({ seconds, currentQuestionIndex, totalQuestions }) {
  resetHostSplashCountdown();
  showScreen(screens.game, 'host-splash-view');

  $('#host-splash-question-num').textContent =
    typeof currentQuestionIndex === 'number' ? currentQuestionIndex + 1 : '';
  $('#host-splash-question-total').textContent =
    typeof totalQuestions === 'number' ? totalQuestions : '';

  const countdown = $('#host-splash-countdown');
  const barFill = $('#host-splash-bar-fill');
  const barPct = $('#host-splash-bar-pct');
  const readyLine = $('#host-splash-line-ready');
  const tminusLine = $('#host-splash-line-tminus');

  let remaining = Math.max(1, seconds);
  const total = remaining;

  countdown.textContent = remaining;
  barFill.style.width = '0%';
  barPct.textContent = '0%';
  readyLine.classList.add('hidden');
  tminusLine.classList.remove('hidden');

  animateTerminalLines('#host-splash-view .terminal-body');

  hostSplashCountdownInterval = setInterval(() => {
    remaining--;
    const progress = ((total - remaining) / total) * 100;

    if (remaining <= 0) {
      clearInterval(hostSplashCountdownInterval);
      hostSplashCountdownInterval = null;
      barFill.style.width = '100%';
      barPct.textContent = '100%';
      tminusLine.classList.add('hidden');
      readyLine.classList.remove('hidden');
      readyLine.classList.add('visible');
    } else {
      countdown.textContent = remaining;
      const capped = Math.min(progress, 95);
      barFill.style.width = `${capped}%`;
      barPct.textContent = `${Math.round(capped)}%`;
    }
  }, 1000);
}

function animateTerminalLines(containerSelector) {
  const container = document.querySelector(containerSelector);
  if (!container) return;

  const items = container.querySelectorAll('.term-line, .term-progress-row');

  items.forEach((el) => {
    el.classList.remove('visible');
  });

  void container.offsetHeight;

  items.forEach((el, i) => {
    setTimeout(
      () => {
        el.classList.add('visible');
      },
      i * 200 + 50
    );
  });
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
        <div class="leaderboard-name">${escapeHtml(p.nickname)}</div>
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
        <div class="leaderboard-name">${escapeHtml(p.nickname)}</div>
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
  if (lobbyPlayers.length === 0 && !confirm('No players have joined yet. Start game anyway?')) {
    return;
  }
  socket.emit('host:start-game');
});
$('#next-question-btn').addEventListener('click', emitNextQuestion);
$('#quiz-settings-close').addEventListener('click', closeQuizSettings);
$('#quiz-settings-cancel').addEventListener('click', closeQuizSettings);
$('#quiz-settings-save').addEventListener('click', saveQuizSettings);
$('#quiz-settings-modal').addEventListener('click', (e) => {
  if (e.target.id === 'quiz-settings-modal') {
    closeQuizSettings();
  }
});

$('#results-modal-close').addEventListener('click', closeQuizResults);
$('#results-close-btn').addEventListener('click', closeQuizResults);
$('#results-back-btn').addEventListener('click', showResultsList);
$('#quiz-results-modal').addEventListener('click', (e) => {
  if (e.target.id === 'quiz-results-modal') {
    closeQuizResults();
  }
});

$('#copy-pin-btn').addEventListener('click', async () => {
  if (!currentPin) return;
  try {
    await copyToClipboard(currentPin);
    showNotification({
      title: 'COPIED',
      message: 'PIN copied to clipboard!',
      color: '#00ff9d',
    });
  } catch {
    showNotification({
      title: 'COPY FAILED',
      message: 'Could not copy PIN. Try selecting it manually.',
      color: '#ff4444',
    });
  }
});

$('#copy-url-btn').addEventListener('click', async () => {
  if (!currentPin) return;
  const url = `${window.location.origin}/play?pin=${currentPin}`;
  try {
    await copyToClipboard(url);
    showNotification({
      title: 'COPIED',
      message: 'Join URL copied to clipboard!',
      color: '#00ff9d',
    });
  } catch {
    showNotification({
      title: 'COPY FAILED',
      message: 'Could not copy URL. Try selecting it manually.',
      color: '#ff4444',
    });
  }
});

// Socket events
socket.on('host:session-created', ({ pin, quizTitle, hostname, autoAdvance, readDelay }) => {
  currentPin = pin;
  currentQuizAutoAdvance = {
    enabled: autoAdvance?.enabled ?? false,
    delay: autoAdvance?.delay ?? 5,
  };
  currentQuizReadDelay = readDelay ?? 3;
  $('#lobby-pin').textContent = pin;
  $('#lobby-quiz-title').textContent = quizTitle;

  const port = window.location.port ? `:${window.location.port}` : '';
  const protocol = window.location.protocol;
  joinUrl = `${protocol}//${hostname}${port}/play?pin=${pin}`;
  $('#lobby-qr-code').src = `/api/qrcode?url=${encodeURIComponent(joinUrl)}`;
  $('#lobby-qr-code').alt = `QR Code for ${joinUrl}`;
  const urlDisplay = joinUrl.replace(/^https?:\/\//, '');
  $('#lobby-join-url').textContent = urlDisplay;
  $('#lobby-join-url-alt').textContent = urlDisplay;

  renderLobby([]);
  switchTo('lobby');
});

socket.on('server:lobby-update', ({ players, pin }) => {
  if (currentPin === pin) {
    renderLobby(players);
    playSound('join');
  }
});

socket.on('server:player-joined', ({ nickname, pin }) => {
  if (currentPin === pin && !screens.lobby.classList.contains('hidden')) {
    celebrate(nickname);
  }
});

socket.on('server:game-started', () => {
  switchTo('game');
});

socket.on('server:question-countdown', (data) => {
  renderHostSplash(data);
});

socket.on('server:question', (question) => {
  resetHostSplashCountdown();
  renderHostQuestion(question);
});

socket.on('server:host-answer-update', (data) => {
  renderHostAnswerStatus(data);
});

socket.on('server:answer-reveal', ({ correctOptionIds }) => {
  if (!currentQuestion) return;
  clearInterval(hostTimerInterval);
  hostTimerInterval = null;
  $('#host-timer-fill').style.width = '0%';
  $('.hqv-content').classList.add('reveal-layout');

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
  clearInterval(hostTimerInterval);
  hostTimerInterval = null;
  renderLeaderboard(leaderboard);
});

socket.on('server:player-disconnected', ({ nickname }) => {
  showNotification({
    title: 'DISCONNECT',
    message: `<span class="join-notification-name">${escapeHtml(nickname)}</span> disconnected`,
    color: '#ff4444',
    html: true,
  });
});

socket.on('server:player-reconnected', ({ nickname }) => {
  showNotification({
    title: 'RECONNECT',
    message: `<span class="join-notification-name">${escapeHtml(nickname)}</span> reconnected`,
    color: '#00ff9d',
    html: true,
  });
});

socket.on('server:game-over', ({ podium, leaderboard }) => {
  cancelAutoAdvance();
  renderGameOver(podium, leaderboard);
  playSound('winner');
});

socket.on('server:error', ({ message }) => {
  showNotification({
    title: 'SERVER ERROR',
    message,
    color: '#ff4444',
  });
});

// QR code fullscreen overlay
const qrOverlay = $('#qrcode-fullscreen-overlay');
const qrCloseBtn = $('#qrcode-close-btn');
const qrFullscreenImg = $('#lobby-qr-code-fullscreen');

$('#lobby-qr-code').addEventListener('click', () => {
  qrFullscreenImg.src = $('#lobby-qr-code').src;
  $('#qrcode-fullscreen-url').textContent = $('#lobby-join-url').textContent;
  qrOverlay.classList.remove('hidden');
});

qrCloseBtn.addEventListener('click', () => qrOverlay.classList.add('hidden'));

qrOverlay.addEventListener('click', (e) => {
  if (e.target === qrOverlay) {
    qrOverlay.classList.add('hidden');
  }
});

// Init
initAudio();
if (localStorage.getItem('hostToken')) {
  loadDashboard().then(() => switchTo('dashboard'));
} else {
  switchTo('login');
}
