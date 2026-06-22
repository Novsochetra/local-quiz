import {
  createSession,
  getSessionById,
  updateSessionStatus,
  addPlayer as addPlayerDb,
  getPlayerBySocket as getPlayerBySocketDb,
  getPlayers as getPlayersDb,
  removePlayer as removePlayerDb,
  finishSession,
  updatePlayerSocket,
} from '../../services/gameService.js';
import { config } from '../../config/config.js';
import { QuestionEngine } from './QuestionEngine.js';

const sessions = new Map();

export class GameSession {
  constructor(quiz) {
    this.quiz = quiz;
    const sessionData = createSession(quiz.id, config.game.maxPlayers);
    this.id = sessionData.id;
    this.pin = sessionData.pin;
    this.maxPlayers = sessionData.maxPlayers;
    this.status = 'waiting';
    this.players = [];
    this.engine = new QuestionEngine(this, null);
    sessions.set(this.pin, this);
  }

  static getByPin(pin) {
    return sessions.get(pin);
  }

  static remove(pin) {
    const session = sessions.get(pin);
    if (session) {
      session.destroy();
      sessions.delete(pin);
    }
  }

  setIo(io) {
    this.engine.io = io;
  }

  addPlayer(socketId, nickname) {
    const existing = this.players.find((p) => p.nickname === nickname);
    if (existing) {
      existing.socket_id = socketId;
      existing.connected = true;
      updatePlayerSocket(existing.id, socketId);
      return existing;
    }

    if (this.players.length >= this.maxPlayers) {
      throw new Error('Session is full');
    }

    const playerData = addPlayerDb(this.id, socketId, nickname);
    playerData.connected = true;
    this.players.push(playerData);
    return playerData;
  }

  removePlayer(playerId) {
    const index = this.players.findIndex((p) => p.id === playerId);
    if (index === -1) return null;

    const [player] = this.players.splice(index, 1);
    removePlayerDb(playerId);
    return player;
  }

  removePlayerBySocket(socketId) {
    const index = this.players.findIndex((p) => p.socket_id === socketId);
    if (index === -1) return null;

    const [player] = this.players.splice(index, 1);
    removePlayerDb(player.id);
    return player;
  }

  markDisconnected(socketId) {
    const player = this.players.find((p) => p.socket_id === socketId);
    if (player) {
      player.connected = false;
    }
  }

  getConnectedCount() {
    return this.players.filter((p) => p.connected).length;
  }

  getPlayerBySocket(socketId) {
    return this.players.find((p) => p.socket_id === socketId);
  }

  getPlayerById(playerId) {
    return this.players.find((p) => p.id === playerId);
  }

  getLeaderboard() {
    return [...this.players]
      .sort((a, b) => b.score - a.score || a.joined_at - b.joined_at)
      .map((p, index) => ({
        rank: index + 1,
        id: p.id,
        nickname: p.nickname,
        score: p.score,
      }));
  }

  startGame() {
    if (this.status !== 'waiting') {
      throw new Error('Game is not in waiting state');
    }
    this.status = 'playing';
    updateSessionStatus(this.id, 'playing');
    this.engine.start();
    this.engine.nextQuestion();
  }

  nextQuestion() {
    this.engine.nextQuestion();
  }

  finish(leaderboard) {
    this.status = 'finished';
    finishSession(this.id, leaderboard);
  }

  destroy() {
    this.engine.destroy();
  }
}
