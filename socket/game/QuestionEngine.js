import { checkAnswer, calculateScore } from './Scoring.js';
import { saveAnswer, updatePlayerScore } from '../../services/gameService.js';

const ANSWER_REVEAL_DELAY_MS = 2000;

export class QuestionEngine {
  constructor(session, io) {
    this.session = session;
    this.io = io;
    this.currentQuestionIndex = -1;
    this.questionStartTime = 0;
    this.timer = null;
    this.answeredPlayers = new Set();
    this.optionSelectionCounts = new Map();
    this.phase = 'idle'; // idle | countdown | question | reveal | leaderboard
  }

  start() {
    this.currentQuestionIndex = -1;
    this.session.status = 'playing';
  }

  nextQuestion() {
    if (this.currentQuestionIndex + 1 >= this.session.quiz.questions.length) {
      this.endGame();
      return;
    }

    this.currentQuestionIndex++;
    this.answeredPlayers.clear();
    this.optionSelectionCounts.clear();
    this.phase = 'countdown';

    const countdownSeconds = Math.min(15, Math.max(1, this.session.quiz.countdown_seconds ?? 5));

    this.io.to(this.session.pin).emit('server:question-countdown', {
      seconds: countdownSeconds,
      currentQuestionIndex: this.currentQuestionIndex,
      totalQuestions: this.session.quiz.questions.length,
    });

    this.timer = setTimeout(() => {
      this.emitQuestion();
    }, countdownSeconds * 1000);
  }

  emitQuestion() {
    if (this.phase !== 'countdown') return;
    this.phase = 'question';

    const question = this.session.quiz.questions[this.currentQuestionIndex];
    const questionPayload = {
      index: this.currentQuestionIndex,
      totalQuestions: this.session.quiz.questions.length,
      type: question.type,
      text: question.text,
      mediaUrl: question.media_url,
      timeLimit: question.time_limit_sec,
      points: question.points,
      playerLayout: this.session.quiz.player_layout || 'default',
      options: question.options.map((opt) => ({
        id: opt.id,
        text: opt.text,
      })),
    };

    this.questionStartTime = Date.now();
    this.io.to(this.session.pin).emit('server:question', questionPayload);

    this.timer = setTimeout(() => {
      this.revealAnswer();
    }, question.time_limit_sec * 1000);
  }

  handleAnswer(socket, data) {
    if (this.phase !== 'question') return;

    const player = this.session.getPlayerBySocket(socket.id);
    if (!player || this.answeredPlayers.has(player.id)) return;

    const question = this.session.quiz.questions[this.currentQuestionIndex];
    if (!question) return;

    const selected = Array.isArray(data.selectedOptions) ? data.selectedOptions : [];
    const { isCorrect, correctIds } = checkAnswer(question, selected);

    const elapsedSec = (Date.now() - this.questionStartTime) / 1000;
    const timeRemaining = Math.max(0, question.time_limit_sec - elapsedSec);
    const scoreEarned = isCorrect
      ? calculateScore(question.points, question.time_limit_sec, timeRemaining)
      : 0;

    saveAnswer(player.id, question.id, selected, isCorrect, scoreEarned);

    const newScore = player.score + scoreEarned;
    player.score = newScore;
    updatePlayerScore(player.id, newScore);

    this.answeredPlayers.add(player.id);

    for (const optionId of selected) {
      const current = this.optionSelectionCounts.get(optionId) || 0;
      this.optionSelectionCounts.set(optionId, current + 1);
    }

    socket.emit('player:answer-result', {
      isCorrect,
      scoreEarned,
      totalScore: newScore,
    });

    this.emitHostAnswerUpdate();

    const allAnswered =
      this.session.players.length > 0 && this.answeredPlayers.size >= this.session.players.length;
    if (allAnswered) {
      clearTimeout(this.timer);
      this.revealAnswer();
    }
  }

  emitHostAnswerUpdate() {
    const totalPlayers = this.session.players.length;
    const players = this.session.players.map((p) => ({
      id: p.id,
      nickname: p.nickname,
      answered: this.answeredPlayers.has(p.id),
    }));

    this.io.to(this.session.pin).emit('server:host-answer-update', {
      answeredCount: this.answeredPlayers.size,
      totalPlayers,
      players,
    });
  }

  revealAnswer() {
    if (this.phase !== 'question') return;
    this.phase = 'reveal';

    const question = this.session.quiz.questions[this.currentQuestionIndex];
    const correctIds = question.options.filter((opt) => opt.is_correct === 1).map((opt) => opt.id);

    this.io.to(this.session.pin).emit('server:answer-reveal', {
      correctOptionIds: correctIds,
    });

    this.showLeaderboard();
  }

  showLeaderboard() {
    if (this.phase !== 'reveal') return;
    this.phase = 'leaderboard';

    const leaderboard = this.session.getLeaderboard();
    this.io.to(this.session.pin).emit('server:leaderboard', {
      leaderboard,
      currentQuestionIndex: this.currentQuestionIndex,
      totalQuestions: this.session.quiz.questions.length,
    });
  }

  endGame() {
    this.phase = 'finished';
    this.session.status = 'finished';

    const leaderboard = this.session.getLeaderboard();
    const podium = leaderboard.slice(0, 3);

    this.io.to(this.session.pin).emit('server:game-over', {
      podium,
      leaderboard,
    });

    this.session.finish(leaderboard);
  }

  destroy() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
