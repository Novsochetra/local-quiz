import { Router } from 'express';
import { authenticateHost } from '../middleware/auth.js';
import {
  getSessionAnswerBreakdown,
  getSessionDetail,
  getSessionsByQuizId,
} from '../services/gameService.js';

const router = Router();

router.get('/quizzes/:quizId/sessions', authenticateHost, (req, res, next) => {
  try {
    const sessions = getSessionsByQuizId(req.params.quizId);
    res.json(sessions);
  } catch (err) {
    next(err);
  }
});

router.get('/sessions/:id', authenticateHost, (req, res, next) => {
  try {
    const session = getSessionDetail(req.params.id);
    if (!session) {
      const err = new Error('Session not found');
      err.statusCode = 404;
      throw err;
    }
    res.json(session);
  } catch (err) {
    next(err);
  }
});

router.get('/sessions/:id/answers', authenticateHost, (req, res, next) => {
  try {
    const breakdown = getSessionAnswerBreakdown(req.params.id);
    if (!breakdown) {
      const err = new Error('Session not found');
      err.statusCode = 404;
      throw err;
    }
    res.json(breakdown);
  } catch (err) {
    next(err);
  }
});

export default router;
