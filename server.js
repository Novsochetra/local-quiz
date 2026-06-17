import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './config/config.js';
import { errorHandler } from './middleware/error.js';
import { setupSocketIO } from './socket/index.js';
import authRoutes from './routes/auth.js';
import quizRoutes from './routes/quizzes.js';
import uploadRoutes from './routes/upload.js';
import sessionRoutes from './routes/sessions.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
  },
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use('/api/auth', authRoutes);
app.use('/api/quizzes', quizRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api', sessionRoutes);

app.get('/host', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'host.html'));
});

app.get('/play', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'play.html'));
});

app.use(errorHandler);

setupSocketIO(io);

server.listen(config.port, () => {
  console.log(`Local Quiz server running on http://localhost:${config.port}`);
});
