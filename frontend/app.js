// Socket connection
const socket = io();

// Global variables
let currentMode = 'host';
let currentJoinMode = 'public';
let sessionPrivacy = 'public';
let isStreaming = false;
let isHost = false;
let currentSessionId = null;

let pendingRequests = [];
let connectedUsers = [];

// WebRTC variables
let peerConnection;
let localStream;

// Initialize when page loads
document.addEventListener('DOMContentLoaded', function() {
    loadPublicSessions();
});

// Load public sessions from server
async function loadPublicSessions() {
    try {
        const response = await fetch('/api/sessions/public');
        const sessions = await response.json();
        displayPublicSessions(sessions);
    } catch (error) {
        console.error('Error loading public sessions:', error);
        document.getElementById('public-sessions-list').innerHTML = 
            '<p style="color: #999; text-align: center;">Error loading sessions</p>';
    }
}

// Display public sessions
function displayPublicSessions(sessions) {
    const container = document.getElementById('public-sessions-list');
    
    if (sessions.length === 0) {
        container.innerHTML = '<p style="color: #999; text-align: center;">No public sessions available</p>';
        return;
    }

    container.innerHTML = sessions.map(session => `
        <div class="session-card">
            <div class="session-details">
                <h4>${session.hostName}'s Session</h4>
                <p>${session.participantCount} listener(s) • Started recently</p>
            </div>
            <button class="join-session-btn" onclick="joinPublicSession('${session.code}', '${session.hostName}')">
                Join
            </button>
        </div>
    `).join('');
}

// Socket event listeners
socket.on('session-created', (data) => {
    document.getElementById('session-code').textContent = data.sessionCode;
    
    const badge = document.getElementById('session-badge');
    const description = document.getElementById('code-description');
    
    if (data.isPublic) {
        badge.textContent = '🌍 PUBLIC SESSION';
        badge.className = 'session-type-badge badge-public';
        description.textContent = 'Visible to everyone - Share code or let them find you';
    } else {
        badge.textContent = '🔒 PRIVATE SESSION';
        badge.className = 'session-type-badge badge-private';
        description.textContent = 'Only people with this code can join';
    }
    
    document.getElementById('host-active').style.display = 'block';
    isHost = true;
    currentSessionId = data.sessionId;
    
    alert(`Session Created!\n\nCode: ${data.sessionCode}\n\n${data.isPublic ? 'Your session is visible in the public list!' : 'Share this code with people you want to join'}`);
});

socket.on('pending-request', (data) => {
    addPendingRequest(data.userName, data.userId);
});

socket.on('participant-updated', (data) => {
    connectedUsers = data.participants;
    renderConnectedUsers();
});

socket.on('join-pending', (data) => {
    document.getElementById('guest-active').style.display = 'block';
});

socket.on('join-approved', (data) => {
    document.getElementById('guest-status').style.display = 'none';
    document.getElementById('guest-connected').style.display = 'block';
    document.getElementById('host-session-name').textContent = data.hostName;
    currentSessionId = data.sessionId;
    
    // Initialize WebRTC for guest
    initializeWebRTC();
});

socket.on('join-declined', () => {
    alert('Host declined your join request');
    document.getElementById('guest-active').style.display = 'none';
});

socket.on('join-error', (data) => {
    alert('Error: ' + data.message);
});

socket.on('public-sessions-updated', (sessions) => {
    displayPublicSessions(sessions);
});

socket.on('session-ended', () => {
    alert('Host ended the session');
    document.getElementById('guest-active').style.display = 'none';
    currentSessionId = null;
});

socket.on('host-streaming-started', () => {
    console.log('Host started streaming audio');
});

socket.on('host-streaming-stopped', () => {
    console.log('Host stopped streaming audio');
});

// UI Functions
function switchMode(mode) {
    currentMode = mode;
    
    document.querySelectorAll('.mode-selector .mode-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    event.target.classList.add('active');
    
    document.querySelectorAll('.container > .section').forEach(section => {
        section.classList.remove('active');
    });
    document.getElementById(`${mode}-section`).classList.add('active');
}

function switchJoinMode(mode) {
    currentJoinMode = mode;
    
    document.querySelectorAll('#join-section .mode-selector .mode-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    event.target.classList.add('active');
    
    document.getElementById('public-join').classList.remove('active');
    document.getElementById('private-join').classList.remove('active');
    document.getElementById(`${mode}-join`).classList.add('active');
}

function selectPrivacy(type) {
    sessionPrivacy = type;
    document.querySelectorAll('.privacy-option').forEach(opt => {
        opt.classList.remove('selected');
    });
    event.target.closest('.privacy-option').classList.add('selected');
}

function createSession() {
    const hostName = document.getElementById('host-name').value || 'Host';
    
    socket.emit('create-session', {
        hostName: hostName,
        isPublic: sessionPrivacy === 'public'
    });
}

function joinPublicSession(code, hostName) {
    const guestName = prompt('Enter your name:');
    if (!guestName) return;
    
    socket.emit('join-request', {
        sessionCode: code,
        userName: guestName
    });
}

function joinPrivateSession() {
    const name = document.getElementById('guest-name').value;
    const code = document.getElementById('join-code').value.toUpperCase();
    
    if (!name) {
        alert('Please enter your name');
        return;
    }
    
    if (!code || code.length !== 6) {
        alert('Please enter a valid 6-digit session code');
        return;
    }
    
    socket.emit('join-request', {
        sessionCode: code,
        userName: name
    });
}

function addPendingRequest(name, userId) {
    pendingRequests.push({ id: userId, name: name });
    renderPendingRequests();
}

function renderPendingRequests() {
    const list = document.getElementById('pending-list');
    if (pendingRequests.length === 0) {
        list.innerHTML = '<p style="color: #999; text-align: center;">No pending requests</p>';
        return;
    }
    
    list.innerHTML = pendingRequests.map(req => `
        <div class="participant">
            <span class="participant-name">${req.name}</span>
            <div class="participant-actions">
                <button class="approve-btn" onclick="approveUser('${req.id}')">✓ Approve</button>
                <button class="decline-btn" onclick="declineUser('${req.id}')">✗ Decline</button>
            </div>
        </div>
    `).join('');
}

function renderConnectedUsers() {
    const list = document.getElementById('connected-list');
    if (connectedUsers.length === 0) {
        list.innerHTML = '<p style="color: #999; text-align: center;">No one connected yet</p>';
        return;
    }
    
    list.innerHTML = connectedUsers.map(user => `
        <div class="participant">
            <span class="participant-name">🎧 ${user.userName}</span>
            <div class="participant-actions">
                <button class="kick-btn" onclick="kickUser('${user.userId}')">Kick</button>
            </div>
        </div>
    `).join('');
    
    document.getElementById('participant-count').textContent = connectedUsers.length;
}

function approveUser(userId) {
    socket.emit('approve-user', { userId: userId, approve: true });
    pendingRequests = pendingRequests.filter(req => req.id !== userId);
    renderPendingRequests();
}

function declineUser(userId) {
    socket.emit('approve-user', { userId: userId, approve: false });
    pendingRequests = pendingRequests.filter(req => req.id !== userId);
    renderPendingRequests();
}

function kickUser(userId) {
    // This would need additional backend support
    console.log('Kick user:', userId);
}

// WebRTC Functions
async function initializeWebRTC() {
    const configuration = {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' }
        ]
    };
    
    peerConnection = new RTCPeerConnection(configuration);
    
    // Handle incoming audio tracks
    peerConnection.ontrack = (event) => {
        console.log('Received remote track');
        const audioElement = document.getElementById('remote-audio');
        if (audioElement) {
            audioElement.srcObject = event.streams[0];
        }
    };
    
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('ice-candidate', {
                candidate: event.candidate,
                target: currentSessionId
            });
        }
    };
}

async function startAudio() {
  if (!isHost) return;
  
  try {
    // For SYSTEM AUDIO capture (what's playing from your computer)
    localStream = await navigator.mediaDevices.getDisplayMedia({
      video: true,  // Required for getDisplayMedia, but we'll only use audio
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        sampleRate: 44100,
        channelCount: 2,
        // These help with system audio capture
        suppressLocalAudioPlayback: false
      }
    });
    
    // Stop the video track since we only want audio
    const videoTracks = localStream.getVideoTracks();
    videoTracks.forEach(track => track.stop());
    
    // Add audio tracks to peer connection
    localStream.getAudioTracks().forEach(track => {
      peerConnection.addTrack(track, localStream);
    });
    
    // Create offer
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    
    // Send offer to all participants
    socket.emit('start-streaming');
    
    isStreaming = true;
    alert('System audio sharing started! Participants can now hear what\'s playing from your computer.\n\nYou may see a screen share prompt - this is normal for system audio capture.');
    
  } catch (error) {
    console.error('Error starting system audio stream:', error);
    if (error.name === 'NotAllowedError') {
      alert('Permission denied. Please allow screen/audio sharing to share your system audio.');
    } else {
      alert('Could not access system audio. Please check permissions and try again.');
    }
  }
}

function stopAudio() {
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
    }
    isStreaming = false;
    socket.emit('stop-streaming');
    alert('Audio streaming stopped');
}