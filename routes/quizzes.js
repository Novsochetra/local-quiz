import { Router } from 'express';
import { authenticateHost } from '../middleware/auth.js';
import {
  getAllQuizzes,
  getQuizById,
  deleteQuiz,
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

export default router;
