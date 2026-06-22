import { $, showScreen, escapeHtml, formatNumber } from './utils.js';
import { getSocket } from './socket.js';
import { initAudio, playSound } from './audio.js';
import { showNotification, showJoinNotification } from './notifications.js';

const socket = getSocket();

const screens = {
  join: $('#join-screen'),
  waiting: $('#waiting-screen'),
  splash: $('#splash-screen'),
  question: $('#question-screen'),
  result: $('#result-screen'),
  gameOver: $('#game-over-screen'),
};

const NOTIFICATION_COLORS = ['--cyan', '--magenta', '--purple', '--yellow', '--green', '--red'];

let playerId = null;
let pin = null;
let nickname = null;
let currentQuestion = null;
let answered = false;
let timerInterval = null;
let hasInteracted = false;
let lastAnswerResult = null;
let splashCountdownInterval = null;
let isReconnecting = false;

function getCssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function getRandomNotificationColor() {
  const colorVar = NOTIFICATION_COLORS[Math.floor(Math.random() * NOTIFICATION_COLORS.length)];
  return getCssVar(colorVar) || getCssVar('--cyan');
}

function renderWaitingPlayers(players) {
  $('#waiting-player-count').textContent = players.length;
  const list = $('#waiting-player-list');
  if (players.length === 0) {
    list.innerHTML = '<p style="color: var(--text-dim); text-align: center;">No players yet</p>';
    return;
  }
  list.innerHTML = players
    .map(
      (p) => `
      <div class="player-chip">
        <span>${p.nickname}</span>
        ${p.id === playerId ? '<span style="color: var(--text-dim); font-size: 0.7rem;">YOU</span>' : ''}
      </div>
    `
    )
    .join('');
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

function showJoinError(message) {
  const el = $('#join-error');
  el.textContent = message;
  el.classList.remove('hidden');
}

function hideJoinError() {
  $('#join-error').classList.add('hidden');
}

function ensureAudio() {
  if (!hasInteracted) {
    hasInteracted = true;
    initAudio();
  }
}

function joinGame() {
  ensureAudio();
  hideJoinError();
  isReconnecting = false;
  sessionStorage.removeItem('quizPin');
  sessionStorage.removeItem('quizNickname');
  pin = $('#pin-input').value.trim();
  nickname = $('#nickname-input').value.trim();

  if (!/^\d{6}$/.test(pin)) {
    showJoinError('PIN must be 6 digits');
    return;
  }
  if (!nickname) {
    showJoinError('Enter a nickname');
    return;
  }

  socket.emit('player:join', { pin, nickname });
}

function startTimer(durationSec, elapsedSec) {
  clearInterval(timerInterval);
  const start = Date.now() - (elapsedSec || 0) * 1000;
  const totalMs = durationSec * 1000;

  const fill = $('#timer-fill');
  const display = $('#question-timer');

  timerInterval = setInterval(() => {
    const elapsed = Date.now() - start;
    const remaining = Math.max(0, totalMs - elapsed);
    const remainingSec = Math.ceil(remaining / 1000);
    const pct = (remaining / totalMs) * 100;

    display.textContent = remainingSec;
    fill.style.width = `${pct}%`;

    if (pct < 30) {
      fill.classList.add('warning');
    } else {
      fill.classList.remove('warning');
    }

    if (remainingSec <= 3 && remainingSec > 0) {
      playSound('tick');
    }

    if (remaining <= 0) {
      clearInterval(timerInterval);
    }
  }, 100);
}

function renderQuestion(question, options) {
  const hasAnswered = options?.hasAnswered ?? false;
  const elapsedSec = options?.elapsedSec;

  answered = hasAnswered;
  currentQuestion = question;
  lastAnswerResult = null;
  switchTo('question');

  $('#question-counter').textContent = `${question.index + 1} / ${question.totalQuestions}`;
  $('#question-points').textContent = `${question.points} pts`;

  const isOptionsOnly = question.playerLayout === 'options_only';
  const questionContent = $('#question-content');
  const optionsOnlyHint = $('#options-only-hint');

  if (isOptionsOnly) {
    questionContent.classList.add('hidden');
    optionsOnlyHint.classList.remove('hidden');
  } else {
    questionContent.classList.remove('hidden');
    optionsOnlyHint.classList.add('hidden');
    $('#question-text').textContent = question.text;

    const img = $('#question-image');
    if (question.mediaUrl) {
      img.src = question.mediaUrl;
      img.classList.remove('hidden');
      img.onerror = () => {
        img.classList.add('hidden');
        img.onerror = null;
      };
    } else {
      img.classList.add('hidden');
      img.onerror = null;
    }
  }

  const container = $('#options-container');

  let html = question.options
    .map(
      (opt) => `
      <button class="option-btn animate-fade-in" data-id="${opt.id}">${escapeHtml(opt.text)}</button>
    `
    )
    .join('');

  html += `
    <button id="submit-answer-btn" class="cyber-btn large" style="grid-column: 1 / -1;">
      Submit Answer
    </button>
  `;

  container.innerHTML = html;

  $('#answer-feedback').classList.add('hidden');
  startTimer(question.timeLimit, elapsedSec);

  if (hasAnswered) {
    const buttons = container.querySelectorAll('.option-btn');
    buttons.forEach((btn) => {
      btn.disabled = true;
    });
    $('#submit-answer-btn').disabled = true;
    const fb = $('#answer-feedback');
    fb.textContent = 'ANSWERED';
    fb.classList.remove('hidden');
    fb.style.color = 'var(--cyan)';
  }
}

function submitAnswer() {
  if (answered || !currentQuestion) return;
  clearInterval(timerInterval);

  const selected = collectSelectedOptions();
  if (selected.length === 0) {
    answered = false;
    const btn = $('#submit-answer-btn');
    btn.classList.remove('animate-shake');
    void btn.offsetWidth;
    btn.classList.add('animate-shake');
    btn.textContent = 'SELECT AN ANSWER';
    setTimeout(() => {
      btn.textContent = 'Submit Answer';
    }, 1200);
    return;
  }

  socket.emit('player:answer', {
    questionIndex: currentQuestion.index,
    selectedOptions: selected,
  });

  // Visual feedback
  const buttons = $('#options-container').querySelectorAll('.option-btn');
  buttons.forEach((btn) => {
    btn.disabled = true;
    if (selected.includes(btn.dataset.id)) {
      btn.classList.add('selected');
    }
  });

  const submitButton = $('#submit-answer-btn');
  if (submitButton) submitButton.disabled = true;
}

function collectSelectedOptions() {
  return Array.from($('#options-container').querySelectorAll('.option-btn.selected')).map(
    (btn) => btn.dataset.id
  );
}

function selectSingleOption(btn) {
  if (answered) return;
  $('#options-container')
    .querySelectorAll('.option-btn')
    .forEach((b) => {
      b.classList.remove('selected');
    });
  btn.classList.add('selected');
}

function toggleMultiSelect(btn) {
  if (answered) return;
  btn.classList.toggle('selected');
}

function submitSelected() {
  if (answered) return;
  const selected = collectSelectedOptions();
  if (selected.length === 0) {
    const btn = $('#submit-answer-btn');
    btn.classList.remove('animate-shake');
    void btn.offsetWidth;
    btn.classList.add('animate-shake');
    btn.textContent = 'SELECT AN ANSWER';
    setTimeout(() => {
      btn.textContent = 'Submit Answer';
    }, 1200);
    return;
  }
  submitAnswer();
}

function renderAnswerResult(result) {
  lastAnswerResult = result;
  const { isCorrect, scoreEarned } = result;
  const feedback = $('#answer-feedback');
  feedback.classList.remove('hidden');
  feedback.textContent = isCorrect ? `+${scoreEarned.toLocaleString()} pts` : 'Wrong!';
  feedback.style.color = isCorrect ? 'var(--green)' : 'var(--red)';

  playSound(isCorrect ? 'correct' : 'wrong');
}

function renderLeaderboard({ leaderboard, currentQuestionIndex, totalQuestions }) {
  const me = leaderboard.find((p) => p.id === playerId);
  switchTo('result');

  const isCorrect = lastAnswerResult?.isCorrect ?? false;
  const scoreEarned = lastAnswerResult?.scoreEarned ?? 0;

  const badge = $('#result-badge');
  badge.className = `result-badge ${isCorrect ? 'correct' : 'wrong'} animate-pop`;
  badge.textContent = isCorrect ? 'CORRECT' : 'WRONG';

  $('#result-points-earned').textContent = isCorrect
    ? `+${formatNumber(scoreEarned)} PTS`
    : '+0 PTS';
  $('#result-total-score').textContent = me ? `TOTAL: ${formatNumber(me.score)} PTS` : '';
  $('#result-rank').textContent = me ? `RANK: #${me.rank}` : '';
  $('#result-question-progress').textContent =
    typeof currentQuestionIndex === 'number' && typeof totalQuestions === 'number'
      ? `QUESTION ${currentQuestionIndex + 1} / ${totalQuestions}`
      : '';

  const list = $('#result-leaderboard');
  list.innerHTML = leaderboard
    .slice(0, 10)
    .map(
      (p) => `
      <div class="leaderboard-item ${p.id === playerId ? 'current-player' : ''}">
        <div class="leaderboard-rank">${p.rank}</div>
        <div class="leaderboard-name">${escapeHtml(p.nickname)}</div>
        <div class="leaderboard-score">${p.score.toLocaleString()}</div>
      </div>
    `
    )
    .join('');

  resetResultTerminal();
}

function resetResultTerminal(text) {
  $('#result-terminal-text').textContent = text || 'WAITING_FOR_NEXT_QUESTION...';
}

function resetSplashCountdown() {
  clearInterval(splashCountdownInterval);
  splashCountdownInterval = null;
}

function renderSplash({ seconds, currentQuestionIndex, totalQuestions }) {
  resetSplashCountdown();
  switchTo('splash');

  $('#splash-question-num').textContent =
    typeof currentQuestionIndex === 'number' ? currentQuestionIndex + 1 : '';
  $('#splash-question-total').textContent =
    typeof totalQuestions === 'number' ? totalQuestions : '';

  const countdown = $('#splash-countdown');
  const barFill = $('#splash-bar-fill');
  const barPct = $('#splash-bar-pct');
  const readyLine = $('#splash-line-ready');
  const tminusLine = $('#splash-line-tminus');

  let remaining = Math.max(1, seconds);
  const total = remaining;

  countdown.textContent = remaining;
  barFill.style.width = '0%';
  barPct.textContent = '0%';
  readyLine.classList.add('hidden');
  tminusLine.classList.remove('hidden');

  animateTerminalLines('#splash-screen .terminal-body');

  splashCountdownInterval = setInterval(() => {
    remaining--;
    const progress = ((total - remaining) / total) * 100;

    if (remaining <= 0) {
      clearInterval(splashCountdownInterval);
      splashCountdownInterval = null;
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

function renderGameOver(podium, leaderboard) {
  switchTo('gameOver');

  const ordered = [podium[1], podium[0], podium[2]].filter(Boolean);
  const places = ['second', 'first', 'third'];

  $('#player-podium').innerHTML = ordered
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

  const me = leaderboard.find((p) => p.id === playerId);
  $('#player-final-rank').textContent = me
    ? `You finished #${me.rank} with ${me.score.toLocaleString()} pts`
    : 'Game over';

  playSound('winner');
}

// Event listeners
$('#join-btn').addEventListener('click', joinGame);
$('#pin-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') joinGame();
});
$('#nickname-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') joinGame();
});

$('#options-container').addEventListener('click', (e) => {
  const btn = e.target.closest('.option-btn');
  const submitBtn = e.target.closest('#submit-answer-btn');

  if (submitBtn) {
    submitSelected();
    return;
  }

  if (!btn || answered || !currentQuestion) return;

  if (currentQuestion.type === 'multiple_choice') {
    toggleMultiSelect(btn);
  } else {
    selectSingleOption(btn);
  }
});

// Socket events
socket.on('player:joined', ({ playerId: id, nickname: nick }) => {
  playerId = id;
  nickname = nick;
  sessionStorage.setItem('quizPin', pin);
  sessionStorage.setItem('quizNickname', nick);
  $('#waiting-nickname').textContent = nick;
  $('#waiting-pin').textContent = pin;
  if (!isReconnecting) {
    switchTo('waiting');
  }
});

socket.on('server:lobby-update', ({ players: lobbyPlayers }) => {
  renderWaitingPlayers(lobbyPlayers);
});

socket.on('server:player-joined', ({ nickname: joinedNickname }) => {
  if (joinedNickname === nickname) return;
  showJoinNotification(joinedNickname, getRandomNotificationColor());
  playSound('join');
});

socket.on('player:join-error', ({ message }) => {
  isReconnecting = false;
  sessionStorage.removeItem('quizPin');
  sessionStorage.removeItem('quizNickname');
  showJoinError(message);
  switchTo('join');
});

socket.on('player:kicked', () => {
  showNotification({
    title: 'KICKED',
    message: 'You have been removed from the game.',
    color: '#ff4444',
  });
  setTimeout(() => location.reload(), 2000);
});

socket.on('server:game-started', () => {
  switchTo('splash');
});

socket.on('server:question-countdown', (data) => {
  resetResultTerminal();
  renderSplash(data);
});

socket.on('server:question', (question) => {
  resetResultTerminal();
  resetSplashCountdown();
  renderQuestion(question);
});

socket.on('player:answer-result', (result) => {
  renderAnswerResult(result);
});

socket.on('server:answer-reveal', ({ correctOptionIds }) => {
  const buttons = $('#options-container').querySelectorAll('.option-btn');
  buttons.forEach((btn) => {
    btn.disabled = true;
    const isCorrect = correctOptionIds.includes(btn.dataset.id);
    btn.classList.remove('selected');
    if (isCorrect) {
      btn.classList.add('correct');
    } else {
      btn.classList.add('wrong');
    }
  });
});

socket.on('server:leaderboard', (data) => {
  renderLeaderboard(data);
});

socket.on('server:game-over', ({ podium, leaderboard }) => {
  resetResultTerminal();
  renderGameOver(podium, leaderboard);
});

socket.on('server:error', ({ message }) => {
  showNotification({
    title: 'ERROR',
    message,
    color: '#ff4444',
  });
});

socket.on('player:reconnect-state', (state) => {
  isReconnecting = false;
  switch (state.screen) {
    case 'waiting':
      switchTo('waiting');
      break;
    case 'splash':
      renderSplash(state);
      break;
    case 'question': {
      const elapsedSec =
        state.timeRemaining !== undefined
          ? Math.max(0, state.question.timeLimit - state.timeRemaining)
          : undefined;
      renderQuestion(state.question, { hasAnswered: state.hasAnswered, elapsedSec });
      break;
    }
    case 'reveal': {
      renderQuestion(state.question, { hasAnswered: true, elapsedSec: state.question.timeLimit });
      const { correctOptionIds } = state;
      const buttons = $('#options-container').querySelectorAll('.option-btn');
      buttons.forEach((btn) => {
        btn.disabled = true;
        btn.classList.remove('selected');
        if (correctOptionIds.includes(btn.dataset.id)) {
          btn.classList.add('correct');
        }
      });
      break;
    }
    case 'leaderboard':
      renderLeaderboard(state);
      break;
    case 'gameOver':
      renderGameOver(state.podium, state.leaderboard);
      break;
  }
});

socket.on('server:host-disconnected', ({ message }) => {
  sessionStorage.removeItem('quizPin');
  sessionStorage.removeItem('quizNickname');
  showNotification({
    title: 'HOST DISCONNECTED',
    message,
    color: '#ff4444',
  });
  setTimeout(() => location.reload(), 2000);
});

// Pre-fill PIN from URL query param
const params = new URLSearchParams(window.location.search);
const pinParam = params.get('pin');
if (pinParam) {
  $('#pin-input').value = pinParam;
  $('#nickname-input').focus();
}

// Auto-rejoin if stored session exists (page refresh)
const savedPin = sessionStorage.getItem('quizPin');
const savedNickname = sessionStorage.getItem('quizNickname');
if (savedPin && savedNickname) {
  pin = savedPin;
  nickname = savedNickname;
  isReconnecting = true;
  if (socket.connected) {
    socket.emit('player:rejoin', { pin, nickname });
  } else {
    socket.on('connect', function onReconnect() {
      socket.off('connect', onReconnect);
      socket.emit('player:rejoin', { pin, nickname });
    });
  }
}

// Init
initAudio();
switchTo('join');
