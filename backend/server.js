const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');

const SessionService = require('./src/sessions/session-service');
const SignalingServer = require('./src/webrtc/signaling');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json());

// Serve frontend files
app.use(express.static(path.join(__dirname, '../frontend')));

const sessionService = new SessionService();
const signalingServer = new SignalingServer(io, sessionService);

// API Routes
app.get('/api/sessions/public', (req, res) => {
  const publicSessions = sessionService.getPublicSessions();
  res.json(publicSessions);
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🎵 MyJam Joint Server running on port ${PORT}`);
  console.log(`📱 Open http://localhost:${PORT} in your browser`);
});