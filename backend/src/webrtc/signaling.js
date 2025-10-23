class SignalingServer {
  constructor(io, sessionService) {
    this.io = io;
    this.sessionService = sessionService;
    this.setupSocketHandlers();
  }

  setupSocketHandlers() {
    this.io.on('connection', (socket) => {
      console.log('User connected:', socket.id);

      // Host creates session
      socket.on('create-session', (data) => {
        const { hostName, isPublic } = data;
        const session = this.sessionService.createSession(socket.id, hostName, isPublic);
        
        socket.join(session.id);
        socket.sessionId = session.id;
        socket.userType = 'host';

        socket.emit('session-created', {
          sessionId: session.id,
          sessionCode: session.code,
          isPublic: session.isPublic
        });

        this.broadcastPublicSessions();
      });

      // User requests to join session
      socket.on('join-request', (data) => {
        const { sessionCode, userName } = data;
        const session = this.findSessionByCode(sessionCode);
        
        if (!session) {
          socket.emit('join-error', { message: 'Session not found' });
          return;
        }

        if (session.participants.size >= session.maxParticipants) {
          socket.emit('join-error', { message: 'Session is full' });
          return;
        }

        this.sessionService.addPendingRequest(session.id, socket.id, userName);
        
        socket.to(session.hostId).emit('pending-request', {
          userId: socket.id,
          userName: userName
        });

        socket.emit('join-pending', { sessionId: session.id });
      });

      // Host approves/declines user
      socket.on('approve-user', (data) => {
        const { userId, approve } = data;
        const session = this.sessionService.getSession(socket.sessionId);
        
        if (session && session.hostId === socket.id) {
          if (approve) {
            const user = this.sessionService.approveUser(session.id, userId);
            if (user) {
              socket.to(userId).emit('join-approved', {
                sessionId: session.id,
                hostName: session.hostName
              });

              this.io.sockets.sockets.get(userId)?.join(session.id);
              
              this.io.to(session.id).emit('participant-updated', {
                participants: Array.from(session.participants.values())
              });
            }
          } else {
            this.sessionService.removeUser(session.id, userId);
            socket.to(userId).emit('join-declined');
          }
        }
      });

      // WebRTC signaling
      socket.on('webrtc-offer', (data) => {
        socket.to(data.target).emit('webrtc-offer', {
          offer: data.offer,
          sender: socket.id
        });
      });

      socket.on('webrtc-answer', (data) => {
        socket.to(data.target).emit('webrtc-answer', {
          answer: data.answer,
          sender: socket.id
        });
      });

      socket.on('ice-candidate', (data) => {
        socket.to(data.target).emit('ice-candidate', {
          candidate: data.candidate,
          sender: socket.id
        });
      });

      socket.on('start-streaming', () => {
        if (socket.sessionId) {
          socket.to(socket.sessionId).emit('host-streaming-started');
        }
      });

      socket.on('stop-streaming', () => {
        if (socket.sessionId) {
          socket.to(socket.sessionId).emit('host-streaming-stopped');
        }
      });

      socket.on('disconnect', () => {
        this.handleDisconnect(socket);
      });
    });
  }

  findSessionByCode(code) {
    for (const [id, session] of this.sessionService.sessions) {
      if (session.code === code) {
        return session;
      }
    }
    return null;
  }

  broadcastPublicSessions() {
    const publicSessions = this.sessionService.getPublicSessions();
    this.io.emit('public-sessions-updated', publicSessions);
  }

  handleDisconnect(socket) {
    if (socket.userType === 'host') {
      if (socket.sessionId) {
        this.sessionService.closeSession(socket.sessionId);
        this.io.to(socket.sessionId).emit('session-ended');
        this.broadcastPublicSessions();
      }
    } else {
      if (socket.sessionId) {
        this.sessionService.removeUser(socket.sessionId, socket.id);
        const session = this.sessionService.getSession(socket.sessionId);
        if (session) {
          this.io.to(socket.sessionId).emit('participant-updated', {
            participants: Array.from(session.participants.values())
          });
        }
      }
    }
  }
}

module.exports = SignalingServer;