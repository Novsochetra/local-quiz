import { GameSession } from '../game/GameSession.js';

export function registerPlayerHandlers(socket, io) {
  socket.on('player:join', ({ pin, nickname }) => {
    try {
      if (!pin || !nickname) {
        return socket.emit('player:join-error', { message: 'PIN and nickname required' });
      }

      const cleanedNickname = nickname.trim().slice(0, 20);
      if (!cleanedNickname) {
        return socket.emit('player:join-error', { message: 'Invalid nickname' });
      }

      const session = GameSession.getByPin(pin);
      if (!session) {
        return socket.emit('player:join-error', { message: 'Session not found' });
      }

      const player = session.addPlayer(socket.id, cleanedNickname);
      socket.join(pin);
      socket.data.isPlayer = true;
      socket.data.sessionPin = pin;
      socket.data.playerId = player.id;

      socket.emit('player:joined', {
        playerId: player.id,
        nickname: player.nickname,
        pin,
      });

      io.to(pin).emit('server:lobby-update', {
        players: session.getLeaderboard(),
        pin,
      });
    } catch (err) {
      socket.emit('player:join-error', { message: err.message });
    }
  });

  socket.on('player:answer', (data) => {
    try {
      const pin = socket.data.sessionPin;
      const session = GameSession.getByPin(pin);
      if (!session || !socket.data.isPlayer) {
        return socket.emit('server:error', { message: 'Not in a game' });
      }

      session.engine.handleAnswer(socket, data);
    } catch (err) {
      socket.emit('server:error', { message: err.message });
    }
  });

  socket.on('disconnect', () => {
    try {
      const pin = socket.data.sessionPin;
      const session = GameSession.getByPin(pin);
      if (!session || !socket.data.isPlayer) return;

      session.removePlayerBySocket(socket.id);
      io.to(pin).emit('server:lobby-update', {
        players: session.getLeaderboard(),
        pin,
      });
    } catch (err) {
      console.error('Disconnect handler error:', err.message);
    }
  });
}
