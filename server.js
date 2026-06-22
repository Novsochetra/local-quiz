import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';
import QRCode from 'qrcode';
import { config } from './config/config.js';
import { errorHandler } from './middleware/error.js';
import { setupSocketIO } from './socket/index.js';
import authRoutes from './routes/auth.js';
import quizRoutes from './routes/quizzes.js';
import uploadRoutes from './routes/upload.js';
import sessionRoutes from './routes/sessions.js';

function getLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return config.hostname || 'localhost';
}

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

app.get('/api/qrcode', async (req, res) => {
  const url = req.query.url;
  if (!url) {
    return res.status(400).json({ error: 'Missing url parameter' });
  }
  try {
    const svg = await QRCode.toString(url, {
      type: 'svg',
      width: 300,
      margin: 1,
      color: {
        dark: '#00f3ff',
        light: '#0a0a1a',
      },
    });
    res.type('image/svg+xml').send(svg);
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate QR code' });
  }
});

app.use(errorHandler);

setupSocketIO(io);

server.listen(config.port, () => {
  const ip = getLocalIp();
  console.log(`Local Quiz server running on`);
  console.log(`  → Network:  http://${ip}:${config.port}`);
  console.log(`  → Local:    http://localhost:${config.port}`);
});
