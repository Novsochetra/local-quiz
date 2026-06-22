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

      const isReconnect = session.players.some((p) => p.nickname === cleanedNickname);
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

      if (!isReconnect) {
        io.to(pin).emit('server:player-joined', {
          nickname: player.nickname,
          pin,
        });
      } else if (session.status === 'playing') {
        io.to(pin).emit('server:player-reconnected', {
          nickname: player.nickname,
        });
      }

      if (session.status === 'playing') {
        session.engine.emitHostAnswerUpdate();
        const state = session.engine.getReconnectState(player.id);
        socket.emit('player:reconnect-state', state);
      }
    } catch (err) {
      socket.emit('player:join-error', { message: err.message });
    }
  });

  socket.on('player:rejoin', ({ pin, nickname }) => {
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

      if (session.status === 'playing') {
        session.engine.emitHostAnswerUpdate();
        io.to(pin).emit('server:player-reconnected', {
          nickname: player.nickname,
        });
      }

      io.to(pin).emit('server:lobby-update', {
        players: session.getLeaderboard(),
        pin,
      });

      const state = session.engine.getReconnectState(player.id);
      socket.emit('player:reconnect-state', state);
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

      if (session.status === 'playing') {
        session.markDisconnected(socket.id);
        session.engine.emitHostAnswerUpdate();
        const player = session.players.find((p) => p.socket_id === socket.id);
        if (player) {
          io.to(pin).emit('server:player-disconnected', {
            nickname: player.nickname,
          });
        }
      } else {
        session.removePlayerBySocket(socket.id);
        io.to(pin).emit('server:lobby-update', {
          players: session.getLeaderboard(),
          pin,
        });
      }
    } catch (err) {
      console.error('Disconnect handler error:', err.message);
    }
  });
}
