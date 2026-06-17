import { $, showScreen, formatNumber } from './utils.js';
import { getSocket } from './socket.js';
import { initAudio, playSound } from './audio.js';
import { showJoinNotification } from './notifications.js';

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
  screens[screenName].classList.remove('hidden');
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

function startTimer(durationSec) {
  clearInterval(timerInterval);
  const start = Date.now();
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

function renderQuestion(question) {
  answered = false;
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
    } else {
      img.classList.add('hidden');
    }
  }

  const container = $('#options-container');
  const isMultiSelect = question.type === 'multiple_select';

  let html = question.options
    .map(
      (opt) => `
      <button class="option-btn animate-fade-in" data-id="${opt.id}">${opt.text}</button>
    `
    )
    .join('');

  if (isMultiSelect) {
    html += `
      <button id="submit-multi-btn" class="cyber-btn large" style="grid-column: 1 / -1;">
        Submit Answer
      </button>
    `;
  }

  container.innerHTML = html;

  if (!isMultiSelect) {
    container.querySelectorAll('.option-btn').forEach((btn) => {
      btn.addEventListener('click', () => submitAnswer(btn.dataset.id));
    });
  }

  $('#answer-feedback').classList.add('hidden');
  startTimer(question.timeLimit);
}

function submitAnswer(optionId) {
  if (answered || !currentQuestion) return;
  answered = true;

  clearInterval(timerInterval);

  const isMultiSelect = currentQuestion.type === 'multiple_select';
  const selected = isMultiSelect ? collectMultiSelect() : [optionId];

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
}

function collectMultiSelect() {
  return Array.from($('#options-container').querySelectorAll('.option-btn.selected')).map(
    (btn) => btn.dataset.id
  );
}

function toggleMultiSelect(btn) {
  if (answered) return;
  btn.classList.toggle('selected');
}

function submitMultiSelect() {
  if (answered) return;
  const selected = collectMultiSelect();
  if (selected.length === 0) return;
  submitAnswer(null);
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

  resetResultTerminal();
}

function resetResultTerminal() {
  $('#result-terminal-text').textContent = 'WAITING_FOR_HOST...';
}

function resetSplashCountdown() {
  clearInterval(splashCountdownInterval);
  splashCountdownInterval = null;
}

function renderSplash({ seconds, currentQuestionIndex, totalQuestions }) {
  resetSplashCountdown();
  switchTo('splash');

  $('#splash-question-progress').textContent =
    typeof currentQuestionIndex === 'number' && typeof totalQuestions === 'number'
      ? `QUESTION ${currentQuestionIndex + 1} / ${totalQuestions}`
      : '';

  const display = $('#splash-countdown');
  let remaining = Math.max(1, seconds);
  display.textContent = remaining;
  display.classList.remove('splash-go');

  splashCountdownInterval = setInterval(() => {
    remaining--;
    if (remaining <= 0) {
      clearInterval(splashCountdownInterval);
      splashCountdownInterval = null;
      display.textContent = 'GO!';
      display.classList.add('splash-go');
    } else {
      display.textContent = remaining;
    }
  }, 1000);
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
  const submitBtn = e.target.closest('#submit-multi-btn');

  if (submitBtn) {
    submitMultiSelect();
    return;
  }

  if (!btn || answered || !currentQuestion) return;

  if (currentQuestion.type === 'multiple_select') {
    toggleMultiSelect(btn);
  }
});

// Socket events
socket.on('player:joined', ({ playerId: id, nickname: nick }) => {
  playerId = id;
  nickname = nick;
  $('#waiting-nickname').textContent = nick;
  $('#waiting-pin').textContent = pin;
  switchTo('waiting');
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
  showJoinError(message);
});

socket.on('player:kicked', () => {
  alert('You have been removed from the game.');
  location.reload();
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
  alert(`Error: ${message}`);
});

// Init
initAudio();
switchTo('join');
