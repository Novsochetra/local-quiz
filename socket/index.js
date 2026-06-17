import { registerHostHandlers } from './handlers/host.js';
import { registerPlayerHandlers } from './handlers/player.js';

export function setupSocketIO(io) {
  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    registerHostHandlers(socket, io);
    registerPlayerHandlers(socket, io);

    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
    });
  });
}
