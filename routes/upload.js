import { Router } from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import { config } from '../config/config.js';
import { authenticateHost } from '../middleware/auth.js';

const storage = multer.diskStorage({
  destination: config.upload.destination,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: config.upload.maxFileSize },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  },
});

const router = Router();

router.post('/', authenticateHost, upload.single('image'), (req, res, next) => {
  try {
    if (!req.file) {
      const err = new Error('No image uploaded');
      err.statusCode = 400;
      throw err;
    }
    res.json({ url: `/uploads/${req.file.filename}` });
  } catch (err) {
    next(err);
  }
});

export default router;
