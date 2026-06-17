import { Router } from 'express';
import { authenticateHost } from '../middleware/auth.js';
import {
  getAllQuizzes,
  getQuizById,
  deleteQuiz,
  updateQuiz,
  updateQuestion,
  validateQuizJson,
  createQuizFromJson,
} from '../services/quizService.js';

const router = Router();

router.get('/', (req, res, next) => {
  try {
    const quizzes = getAllQuizzes();
    res.json(quizzes);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', (req, res, next) => {
  try {
    const quiz = getQuizById(req.params.id);
    if (!quiz) {
      const err = new Error('Quiz not found');
      err.statusCode = 404;
      throw err;
    }
    res.json(quiz);
  } catch (err) {
    next(err);
  }
});

router.post('/import', authenticateHost, (req, res, next) => {
  try {
    const data = req.body;
    const errors = validateQuizJson(data);
    if (errors.length > 0) {
      const err = new Error(errors.join('; '));
      err.statusCode = 400;
      throw err;
    }

    const quiz = createQuizFromJson(data, req.user.userId);
    res.status(201).json(quiz);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', authenticateHost, (req, res, next) => {
  try {
    const success = deleteQuiz(req.params.id);
    if (!success) {
      const err = new Error('Quiz not found');
      err.statusCode = 404;
      throw err;
    }
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

router.put('/:id', authenticateHost, (req, res, next) => {
  try {
    const quizId = req.params.id;
    const quiz = getQuizById(quizId);
    if (!quiz) {
      const err = new Error('Quiz not found');
      err.statusCode = 404;
      throw err;
    }

    const { title, description, questions } = req.body;
    if (!title || typeof title !== 'string') {
      const err = new Error('Quiz title is required');
      err.statusCode = 400;
      throw err;
    }
    if (!Array.isArray(questions)) {
      const err = new Error('Questions array is required');
      err.statusCode = 400;
      throw err;
    }

    updateQuiz(quizId, {
      title,
      description,
      autoAdvanceEnabled: req.body.autoAdvance?.enabled,
      autoAdvanceDelay: req.body.autoAdvance?.delay,
    });

    for (const q of questions) {
      const timeLimit = parseInt(q.timeLimitSec, 10);
      const points = parseInt(q.points, 10);
      if (Number.isNaN(timeLimit) || timeLimit < 5 || timeLimit > 300) {
        const err = new Error(`Invalid time limit for question ${q.id}`);
        err.statusCode = 400;
        throw err;
      }
      if (Number.isNaN(points) || points < 0 || points > 100000) {
        const err = new Error(`Invalid points for question ${q.id}`);
        err.statusCode = 400;
        throw err;
      }
      updateQuestion(q.id, { timeLimitSec: timeLimit, points });
    }

    res.json(getQuizById(quizId));
  } catch (err) {
    next(err);
  }
});

export default router;
