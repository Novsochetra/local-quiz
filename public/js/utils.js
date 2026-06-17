export function $(selector) {
  return document.querySelector(selector);
}

export function $$(selector) {
  return document.querySelectorAll(selector);
}

export function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

export function formatNumber(num) {
  return num.toLocaleString();
}

export function showScreen(container, screenId) {
  container.querySelectorAll('.screen').forEach((screen) => {
    screen.classList.add('hidden');
  });
  const target = container.querySelector(`#${screenId}`);
  if (target) {
    target.classList.remove('hidden');
  }
}

export async function api(url, options = {}) {
  const token = localStorage.getItem('hostToken');
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const response = await fetch(url, {
    ...options,
    headers,
  });

  const data = response.headers.get('content-type')?.includes('application/json')
    ? await response.json()
    : null;

  if (!response.ok) {
    throw new Error(data?.error || `Request failed: ${response.status}`);
  }

  return data;
}
