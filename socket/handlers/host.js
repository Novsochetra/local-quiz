import { GameSession } from '../game/GameSession.js';
import { getQuizById } from '../../services/quizService.js';
import os from 'os';

function getLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

export function registerHostHandlers(socket, io) {
  socket.on('host:create-session', async ({ quizId }) => {
    try {
      const quiz = getQuizById(quizId);
      if (!quiz) {
        return socket.emit('server:error', { message: 'Quiz not found' });
      }
      if (!quiz.questions || quiz.questions.length === 0) {
        return socket.emit('server:error', {
          message: 'Quiz has no questions. Add questions first.',
        });
      }

      const session = new GameSession(quiz);
      session.setIo(io);
      socket.join(session.pin);
      socket.data.isHost = true;
      socket.data.sessionPin = session.pin;

      socket.emit('host:session-created', {
        sessionId: session.id,
        pin: session.pin,
        quizTitle: quiz.title,
        hostname: getLocalIp(),
        autoAdvance: {
          enabled: !!quiz.auto_advance_enabled,
          delay: quiz.auto_advance_delay ?? 5,
        },
      });

      io.to(session.pin).emit('server:lobby-update', {
        players: session.getLeaderboard(),
        pin: session.pin,
      });
    } catch (err) {
      socket.emit('server:error', { message: err.message });
    }
  });

  socket.on('host:kick-player', ({ playerId }) => {
    try {
      const pin = socket.data.sessionPin;
      const session = GameSession.getByPin(pin);
      if (!session || !socket.data.isHost) {
        return socket.emit('server:error', { message: 'Not authorized' });
      }

      const player = session.getPlayerById(playerId);
      if (!player) return;

      const removed = session.removePlayer(playerId);
      if (removed) {
        const targetSocket = io.sockets.sockets.get(player.socket_id);
        if (targetSocket) {
          targetSocket.leave(pin);
          targetSocket.emit('player:kicked');
        }

        io.to(pin).emit('server:lobby-update', {
          players: session.getLeaderboard(),
          pin,
        });
      }
    } catch (err) {
      socket.emit('server:error', { message: err.message });
    }
  });

  socket.on('host:start-game', () => {
    try {
      const pin = socket.data.sessionPin;
      const session = GameSession.getByPin(pin);
      if (!session || !socket.data.isHost) {
        return socket.emit('server:error', { message: 'Not authorized' });
      }

      if (session.engine.phase !== 'idle') return;

      io.to(pin).emit('server:game-started');
      session.startGame();
    } catch (err) {
      socket.emit('server:error', { message: err.message });
    }
  });

  socket.on('host:next-question', () => {
    try {
      const pin = socket.data.sessionPin;
      const session = GameSession.getByPin(pin);
      if (!session || !socket.data.isHost) {
        return socket.emit('server:error', { message: 'Not authorized' });
      }

      if (session.engine.phase !== 'leaderboard') return;

      session.nextQuestion();
    } catch (err) {
      socket.emit('server:error', { message: err.message });
    }
  });

  socket.on('host:auto-advance-started', ({ seconds }) => {
    try {
      const pin = socket.data.sessionPin;
      const session = GameSession.getByPin(pin);
      if (!session || !socket.data.isHost) return;

      socket.to(pin).emit('server:auto-advance-started', { seconds });
    } catch (err) {
      console.error('host:auto-advance-started error:', err.message);
    }
  });

  socket.on('host:auto-advance-cancelled', () => {
    try {
      const pin = socket.data.sessionPin;
      const session = GameSession.getByPin(pin);
      if (!session || !socket.data.isHost) return;

      socket.to(pin).emit('server:auto-advance-cancelled');
    } catch (err) {
      console.error('host:auto-advance-cancelled error:', err.message);
    }
  });

  socket.on('disconnect', () => {
    if (!socket.data.isHost) return;
    const pin = socket.data.sessionPin;
    if (!pin) return;
    const session = GameSession.getByPin(pin);
    if (!session) return;

    io.to(pin).emit('server:host-disconnected', {
      message: 'The host has disconnected. The game has ended.',
    });

    session.destroy();
    GameSession.remove(pin);
  });
}
