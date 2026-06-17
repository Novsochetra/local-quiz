let socket = null;

export function getSocket() {
  if (!socket) {
    socket = window.io();
  }
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
