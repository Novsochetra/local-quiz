import { GameSession } from '../game/GameSession.js';
import { getQuizById } from '../../services/quizService.js';

export function registerHostHandlers(socket, io) {
  socket.on('host:create-session', async ({ quizId }) => {
    try {
      const quiz = getQuizById(quizId);
      if (!quiz) {
        return socket.emit('server:error', { message: 'Quiz not found' });
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

      session.nextQuestion();
    } catch (err) {
      socket.emit('server:error', { message: err.message });
    }
  });
}
