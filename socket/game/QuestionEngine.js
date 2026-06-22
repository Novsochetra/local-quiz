import { checkAnswer, calculateScore } from './Scoring.js';
import { saveAnswer, updatePlayerScore } from '../../services/gameService.js';

export class QuestionEngine {
  constructor(session, io) {
    this.session = session;
    this.io = io;
    this.currentQuestionIndex = -1;
    this.questionStartTime = 0;
    this.timer = null;
    this.answeredPlayers = new Set();
    this.optionSelectionCounts = new Map();
    this.phase = 'idle'; // idle | countdown | question | reveal | leaderboard | finished
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
      this.session.getConnectedCount() > 0 &&
      this.answeredPlayers.size >= this.session.getConnectedCount();
    if (allAnswered) {
      clearTimeout(this.timer);
      this.revealAnswer();
    }
  }

  emitHostAnswerUpdate() {
    const totalPlayers = this.session.getConnectedCount();
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

  getReconnectState(playerId) {
    const totalQuestions = this.session.quiz.questions.length;
    const player = this.session.getPlayerById(playerId);

    const getQuestionData = (q) => ({
      index: this.currentQuestionIndex,
      totalQuestions,
      type: q.type,
      text: q.text,
      mediaUrl: q.media_url,
      timeLimit: q.time_limit_sec,
      points: q.points,
      playerLayout: this.session.quiz.player_layout || 'default',
      options: q.options.map((o) => ({ id: o.id, text: o.text })),
    });

    switch (this.phase) {
      case 'idle':
      case 'countdown':
        return {
          screen: 'splash',
          currentQuestionIndex: this.currentQuestionIndex,
          totalQuestions,
        };

      case 'question': {
        const q = this.session.quiz.questions[this.currentQuestionIndex];
        const elapsed = (Date.now() - this.questionStartTime) / 1000;
        const timeRemaining = Math.max(0, Math.ceil(q.time_limit_sec - elapsed));
        const hasAnswered = this.answeredPlayers.has(playerId);
        return {
          screen: 'question',
          question: getQuestionData(q),
          timeRemaining,
          hasAnswered,
        };
      }

      case 'reveal': {
        const q = this.session.quiz.questions[this.currentQuestionIndex];
        const correctIds = q.options.filter((o) => o.is_correct === 1).map((o) => o.id);
        const hasAnswered = this.answeredPlayers.has(playerId);
        return {
          screen: 'reveal',
          question: getQuestionData(q),
          correctOptionIds: correctIds,
          hasAnswered,
          playerScore: player ? player.score : 0,
        };
      }

      case 'leaderboard': {
        const leaderboard = this.session.getLeaderboard();
        return {
          screen: 'leaderboard',
          leaderboard,
          currentQuestionIndex: this.currentQuestionIndex,
          totalQuestions,
        };
      }

      case 'finished': {
        const leaderboard = this.session.getLeaderboard();
        return {
          screen: 'gameOver',
          podium: leaderboard.slice(0, 3),
          leaderboard,
        };
      }

      default:
        return { screen: 'waiting' };
    }
  }

  destroy() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
