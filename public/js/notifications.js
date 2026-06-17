const NOTIFICATION_DURATION_MS = 3500;
const MAX_VISIBLE_NOTIFICATIONS = 5;

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function hexToRgba(hex, alpha) {
  let normalized = hex.replace('#', '');
  if (normalized.length === 3) {
    normalized = normalized
      .split('')
      .map((c) => c + c)
      .join('');
  }
  const r = parseInt(normalized.substring(0, 2), 16);
  const g = parseInt(normalized.substring(2, 4), 16);
  const b = parseInt(normalized.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const notificationHost = document.createElement('div');
notificationHost.className = 'join-notification-host';
document.body.appendChild(notificationHost);

let notificationId = 0;
const notifications = [];

function removeNotification(id, skipAnim = false) {
  const idx = notifications.findIndex((n) => n.id === id);
  if (idx === -1) return;
  const n = notifications[idx];
  clearTimeout(n.timer);
  notifications.splice(idx, 1);
  if (skipAnim) {
    n.el.remove();
  } else {
    n.el.classList.remove('show');
    n.el.classList.add('hide');
    setTimeout(() => n.el.remove(), 400);
  }
}

notificationHost.addEventListener('click', (e) => {
  const closeBtn = e.target.closest('.join-notification-close');
  if (closeBtn) {
    removeNotification(parseInt(closeBtn.dataset.id, 10));
  }
});

function buildNotification({ title, message, color, duration = NOTIFICATION_DURATION_MS }) {
  const id = ++notificationId;
  const notif = document.createElement('div');
  notif.className = 'join-notification';
  notif.id = `notif-${id}`;
  notif.style.cssText = `
    --notif-color: ${color};
    border-color: ${color};
    box-shadow:
      0 0 20px ${hexToRgba(color, 0.15)},
      inset 0 0 10px ${hexToRgba(color, 0.03)};
  `;
  notif.innerHTML = `
    <div class="join-notification-header">
      <span class="join-notification-prefix">►</span>
      <span class="join-notification-title">${escapeHtml(title)}</span>
      <button class="join-notification-close" data-id="${id}">[×]</button>
    </div>
    <div class="join-notification-body">${message}</div>
    <div class="join-notification-progress">
      <div class="join-notification-progress-fill" style="background: ${color}; box-shadow: 0 0 6px ${color};"></div>
    </div>
  `;

  if (notifications.length >= MAX_VISIBLE_NOTIFICATIONS) {
    const old = notifications.shift();
    removeNotification(old.id, true);
  }

  const n = { id, el: notif };
  notifications.push(n);
  notificationHost.appendChild(notif);

  requestAnimationFrame(() => {
    notif.classList.add('show');
  });

  const fill = notif.querySelector('.join-notification-progress-fill');
  let startTime = null;
  function animateProgress(timestamp) {
    if (!startTime) startTime = timestamp;
    const elapsed = timestamp - startTime;
    const pct = Math.min(100, (elapsed / duration) * 100);
    fill.style.width = pct + '%';
    if (pct < 100) {
      requestAnimationFrame(animateProgress);
    }
  }
  requestAnimationFrame(animateProgress);

  n.timer = setTimeout(() => removeNotification(id), duration);
  return n;
}

export function showNotification({
  title,
  message,
  color = '#00f3ff',
  duration = NOTIFICATION_DURATION_MS,
  html = false,
}) {
  const safeMessage = html ? message : escapeHtml(message);
  buildNotification({ title, message: safeMessage, color, duration });
}

export function showJoinNotification(nickname, color) {
  showNotification({
    title: 'JOIN',
    message: `<span class="join-notification-name">${escapeHtml(nickname)}</span> joined`,
    color,
    html: true,
  });
}
