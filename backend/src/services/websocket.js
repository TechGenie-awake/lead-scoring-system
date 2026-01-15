const { Server } = require('socket.io');

let io;

function initWebSocket(server) {
  io = new Server(server, {
    cors: {
      origin: process.env.FRONTEND_URL || 'http://localhost:5173',
      methods: ['GET', 'POST']
    }
  });

  io.on('connection', (socket) => {
    console.log('✓ Client connected:', socket.id);

    socket.on('disconnect', () => {
      console.log('✗ Client disconnected:', socket.id);
    });

    socket.on('subscribe:lead', (leadId) => {
      socket.join(`lead:${leadId}`);
      console.log(`Client ${socket.id} subscribed to lead ${leadId}`);
    });

    socket.on('unsubscribe:lead', (leadId) => {
      socket.leave(`lead:${leadId}`);
    });
  });

  return io;
}

function emitScoreUpdate(data) {
  if (!io) return;

  // Broadcast to all clients
  io.emit('score:updated', data);

  // Also emit to specific lead room if anyone is subscribed
  if (data.leadId) {
    io.to(`lead:${data.leadId}`).emit('lead:score:updated', data);
  }
}

function emitLeaderboardUpdate(leaderboard) {
  if (!io) return;
  io.emit('leaderboard:updated', leaderboard);
}

module.exports = {
  initWebSocket,
  emitScoreUpdate,
  emitLeaderboardUpdate
};