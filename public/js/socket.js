let socket = null;

const banner = document.createElement('div');
banner.className = 'connection-banner';
banner.setAttribute('role', 'alert');
banner.setAttribute('aria-live', 'polite');
document.body.appendChild(banner);

function showBanner(message, type) {
  banner.textContent = message;
  banner.className = `connection-banner show ${type}`;
}

function hideBanner() {
  banner.className = 'connection-banner';
}

function setupConnectionHandlers(sock) {
  sock.on('connect', () => {
    hideBanner();
  });

  sock.on('disconnect', (reason) => {
    if (reason === 'io server disconnect') {
      showBanner('⚠ DISCONNECTED — Server unavailable', 'disconnected');
    } else {
      showBanner('⚠ CONNECTION LOST — Reconnecting...', 'reconnecting');
    }
  });

  sock.on('connect_error', () => {
    showBanner('⚠ CONNECTION ERROR — Retrying...', 'reconnecting');
  });

  sock.on('reconnect_attempt', () => {
    showBanner('⚠ RECONNECTING...', 'reconnecting');
  });

  sock.on('reconnect', () => {
    hideBanner();
  });

  sock.on('reconnect_error', () => {
    showBanner('⚠ RECONNECT FAILED — Check your connection', 'disconnected');
  });

  sock.on('reconnect_failed', () => {
    showBanner('⚠ RECONNECTION FAILED — Refresh to try again', 'disconnected');
  });
}

export function getSocket() {
  if (!socket) {
    socket = window.io();
    setupConnectionHandlers(socket);
  }
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  hideBanner();
}

export function getConnectionBanner() {
  return banner;
}
