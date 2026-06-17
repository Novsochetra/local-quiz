const subtitleText = 'Neon Realtime Trivia';
const subtitleEl = document.getElementById('subtitle-text');

if (subtitleEl) {
  let index = 0;
  const typeInterval = setInterval(() => {
    subtitleEl.textContent += subtitleText[index];
    index++;
    if (index >= subtitleText.length) {
      clearInterval(typeInterval);
    }
  }, 80);
}
