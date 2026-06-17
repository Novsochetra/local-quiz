import { config } from '../../config/config.js';

const { fullScoreWindowSec } = config.game;

export function calculateScore(points, totalTimeSec, timeRemainingSec) {
  if (timeRemainingSec <= 0) return 0;

  const fullScoreThreshold = totalTimeSec - fullScoreWindowSec;

  if (timeRemainingSec >= fullScoreThreshold) {
    return points;
  }

  return Math.round(points * (timeRemainingSec / fullScoreThreshold));
}

export function arraysEqual(a, b) {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((val, index) => val === sortedB[index]);
}

export function checkAnswer(question, selectedOptionIds) {
  const correctIds = question.options.filter((opt) => opt.is_correct === 1).map((opt) => opt.id);

  const isCorrect = arraysEqual(selectedOptionIds, correctIds);
  return { isCorrect, correctIds };
}
