const COLORS = ['--cyan', '--magenta', '--purple', '--yellow', '--green', '--red'];

const FLOATER_DURATION_MS = 2200;
const NOTIFICATION_DURATION_MS = 3500;
const MAX_VISIBLE_NOTIFICATIONS = 5;

function random(min, max) {
  return Math.random() * (max - min) + min;
}

function getCssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
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

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
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

function showJoinNotification(nickname, color) {
  const id = ++notificationId;
  const notif = document.createElement('div');
  notif.className = 'join-notification';
  notif.id = `join-notif-${id}`;
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
      <span class="join-notification-title">JOIN</span>
      <button class="join-notification-close" data-id="${id}">[×]</button>
    </div>
    <div class="join-notification-body">
      <span class="join-notification-name">${escapeHtml(nickname)}</span> joined
    </div>
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
    const pct = Math.min(100, (elapsed / NOTIFICATION_DURATION_MS) * 100);
    fill.style.width = pct + '%';
    if (pct < 100) {
      requestAnimationFrame(animateProgress);
    }
  }
  requestAnimationFrame(animateProgress);

  n.timer = setTimeout(() => removeNotification(id), NOTIFICATION_DURATION_MS);
}

export function celebrate(nickname) {
  const container = document.createElement('div');
  container.className = 'confetti-container';
  container.setAttribute('aria-hidden', 'true');

  const left = random(20, 80);
  const colorVar = COLORS[Math.floor(Math.random() * COLORS.length)];
  const color = getCssVar(colorVar) || getCssVar('--cyan');

  const floater = document.createElement('div');
  floater.className = 'join-floater';
  floater.textContent = nickname;
  floater.style.cssText = `
    --start-x: ${left}%;
    --glow: ${color};
    color: ${color};
    border-color: ${color};
    text-shadow: 0 0 12px ${color};
    box-shadow:
      0 0 22px ${hexToRgba(color, 0.25)},
      inset 0 0 22px ${hexToRgba(color, 0.08)};
  `;

  container.appendChild(floater);
  document.body.appendChild(container);

  showJoinNotification(nickname, color);

  setTimeout(() => {
    container.remove();
  }, FLOATER_DURATION_MS + 300);
}
