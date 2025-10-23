class SessionService {
  constructor() {
    this.sessions = new Map();
    this.publicSessions = new Set();
  }

  createSession(hostId, hostName, isPublic = true, maxParticipants = 10) {
    const sessionId = this.generateSessionCode();
    
    const session = {
      id: sessionId,
      code: sessionId,
      hostId: hostId,
      hostName: hostName,
      isPublic: isPublic,
      maxParticipants: maxParticipants,
      participants: new Map(),
      pendingRequests: new Map(),
      isActive: true,
      createdAt: new Date()
    };

    this.sessions.set(sessionId, session);
    
    if (isPublic) {
      this.publicSessions.add(sessionId);
    }

    return session;
  }

  generateSessionCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  getSession(sessionId) {
    return this.sessions.get(sessionId);
  }

  getPublicSessions() {
    const publicSessionsList = [];
    
    for (const sessionId of this.publicSessions) {
      const session = this.sessions.get(sessionId);
      if (session && session.isActive) {
        publicSessionsList.push({
          id: session.id,
          code: session.code,
          hostName: session.hostName,
          participantCount: session.participants.size,
          createdAt: session.createdAt
        });
      }
    }
    
    return publicSessionsList;
  }

  addPendingRequest(sessionId, userId, userName) {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.pendingRequests.set(userId, { userId, userName, timestamp: new Date() });
      return true;
    }
    return false;
  }

  approveUser(sessionId, userId) {
    const session = this.sessions.get(sessionId);
    if (session && session.pendingRequests.has(userId)) {
      const user = session.pendingRequests.get(userId);
      session.pendingRequests.delete(userId);
      session.participants.set(userId, user);
      return user;
    }
    return null;
  }

  removeUser(sessionId, userId) {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.participants.delete(userId);
      session.pendingRequests.delete(userId);
    }
  }

  closeSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (session) {
      if (session.isPublic) {
        this.publicSessions.delete(sessionId);
      }
      this.sessions.delete(sessionId);
    }
  }
}

module.exports = SessionService;