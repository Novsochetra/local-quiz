import { showJoinNotification } from './notifications.js';

const COLORS = ['--cyan', '--magenta', '--purple', '--yellow', '--green', '--red'];

const FLOATER_DURATION_MS = 2200;

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
