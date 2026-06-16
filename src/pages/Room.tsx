import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Mic, MicOff, Video, VideoOff, MonitorUp, PhoneOff, MessageSquare, Users, PenTool, X, Copy, Check, LayoutGrid, Maximize, Lock } from 'lucide-react';
import { socket } from '../socket';
import Whiteboard, { getHashColor } from '../components/Whiteboard';

// ===== Remote video component =====
function RemoteVideo({ stream, peerName, peerID, isMainView, isVideoOff }: { stream?: MediaStream; peerName: string; peerID: string; isMainView?: boolean; isVideoOff?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!ref.current || !stream) return;

    ref.current.srcObject = stream;

    // Force video update when tracks arrive asynchronously
    const handleTrackUpdate = () => {
      if (ref.current) ref.current.srcObject = stream;
    };

    stream.addEventListener('addtrack', handleTrackUpdate);
    return () => stream.removeEventListener('addtrack', handleTrackUpdate);
  }, [stream]);

  return (
    <div className="apple-panel" style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden', borderRadius: '16px', display: 'flex', flexDirection: 'column', background: isMainView ? '#000' : undefined }}>
      <video playsInline autoPlay ref={ref} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: isMainView ? 'contain' : 'cover', opacity: isVideoOff ? 0 : 1 }} />
      {isVideoOff && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--panel-bg-secondary)' }}>
          <div style={{ width: isMainView ? '120px' : '60px', height: isMainView ? '120px' : '60px', borderRadius: '50%', background: 'var(--primary)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: isMainView ? '3rem' : '1.5rem', fontWeight: 600 }}>
            {peerName.charAt(0).toUpperCase()}
          </div>
        </div>
      )}

      {/* Name Label */}
      <div style={{ position: 'absolute', bottom: '1rem', left: '1rem', background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(10px)', color: 'white', padding: '0.4rem 0.8rem', borderRadius: '8px', fontSize: '0.9rem', maxWidth: 'calc(100% - 2rem)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', zIndex: 10 }}>
        {peerName}
      </div>

      {/* Color Boundary Overlay */}
      <div style={{ position: 'absolute', inset: 0, border: `1px solid ${getHashColor(peerID)}`, borderRadius: '16px', pointerEvents: 'none', zIndex: 20 }}></div>
    </div>
  );
}

interface PeerInfo {
  peerID: string;
  pc: RTCPeerConnection;
  peerName: string;
  stream?: MediaStream;
  iceQueue?: any[];
  isVideoOff?: boolean;
}

export default function Room() {
  const { id: roomId } = useParams();
  const navigate = useNavigate();

  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [mediaError, setMediaError] = useState('');
  const [activeTab, setActiveTab] = useState<'chat' | 'participants' | 'whiteboard' | null>(null);
  const activeTabRef = useRef(activeTab);
  const [messages, setMessages] = useState<{ user: string; text: string }[]>([]);
  const [unreadChatCount, setUnreadChatCount] = useState(0);

  useEffect(() => {
    activeTabRef.current = activeTab;
    if (activeTab === 'chat') {
      setUnreadChatCount(0);
    }
  }, [activeTab]);
  const [chatInput, setChatInput] = useState('');
  const [userName, setUserName] = useState('User');
  const [peers, setPeers] = useState<PeerInfo[]>([]);
  const [copied, setCopied] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);

  // Layout mode states
  const [layoutMode, setLayoutMode] = useState<'grid' | 'pinned'>('pinned');
  const [pinnedPeerId, setPinnedPeerId] = useState<string | 'local' | null>(null);

  // Layout state
  const [sidebarWidth, setSidebarWidth] = useState(window.innerWidth * 0.25);
  const isResizing = useRef(false);

  // Dynamically set default widths based on the opened tool
  useEffect(() => {
    if (activeTab === 'chat' || activeTab === 'participants') {
      setSidebarWidth(window.innerWidth * 0.25);
    } else if (activeTab === 'whiteboard') {
      setSidebarWidth(window.innerWidth * 0.4);
    }
  }, [activeTab]);

  // Controls UI state
  const [showControls, setShowControls] = useState(true);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleUserActivity = useCallback(() => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => {
      setShowControls(false);
    }, 3000);
  }, []);

  useEffect(() => {
    socket.emit('toggle-video', isVideoOff);
  }, [isVideoOff, peers.length]);

  useEffect(() => {
    handleUserActivity();
    return () => {
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    };
  }, [handleUserActivity]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing.current) return;
      const newWidth = window.innerWidth - e.clientX - 24; // 24px right margin
      if (newWidth >= 300 && newWidth <= window.innerWidth * 0.8) {
        setSidebarWidth(newWidth);
      }
    };
    const handleMouseUp = () => {
      if (isResizing.current) {
        isResizing.current = false;
        document.body.style.cursor = 'default';
        window.dispatchEvent(new Event('resize')); // Force canvas to update resolution
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  const myVideoRef = useRef<HTMLVideoElement>(null);
  const peersRef = useRef<PeerInfo[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const joinedRef = useRef(false); // prevent double-join from strict mode

  // ===== Native WebRTC Peer Creation =====
  const iceServers = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:global.stun.twilio.com:3478' }
    ]
  };

  const createPeer = useCallback((userToSignal: string, callerID: string, callerName: string) => {
    const pc = new RTCPeerConnection(iceServers);
    const remoteStream = new MediaStream();

    const stream = streamRef.current;
    if (stream) {
      stream.getTracks().forEach(track => pc.addTrack(track, stream));
    } else {
      // Force WebRTC to negotiate even without a camera
      pc.addTransceiver('video', { direction: 'recvonly' });
      pc.addTransceiver('audio', { direction: 'recvonly' });
    }

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('sending-signal', { userToSignal, callerID, signal: { type: 'candidate', candidate: event.candidate }, callerName });
      }
    };

    pc.onnegotiationneeded = async () => {
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('sending-signal', { userToSignal, callerID, signal: pc.localDescription, callerName });
      } catch (err) {
        console.error('Error creating offer:', err);
      }
    };

    pc.ontrack = (event) => {
      remoteStream.addTrack(event.track);
    };

    return { pc, remoteStream };
  }, []);

  const addPeer = useCallback((callerID: string) => {
    const pc = new RTCPeerConnection(iceServers);
    const remoteStream = new MediaStream();

    const stream = streamRef.current;
    if (stream) {
      stream.getTracks().forEach(track => pc.addTrack(track, stream));
    } else {
      pc.addTransceiver('video', { direction: 'recvonly' });
      pc.addTransceiver('audio', { direction: 'recvonly' });
    }

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('returning-signal', { signal: { type: 'candidate', candidate: event.candidate }, callerID });
      }
    };

    pc.ontrack = (event) => {
      remoteStream.addTrack(event.track);
    };

    return { pc, remoteStream };
  }, []);

  // ===== Main effect =====
  useEffect(() => {
    let isCancelled = false;

    peersRef.current = [];
    setPeers([]);

    socket.connect();

    // Read user name
    let name = 'User';
    try {
      const userStr = localStorage.getItem('user');
      if (userStr) {
        const user = JSON.parse(userStr);
        if (user?.name) { name = user.name; setUserName(user.name); }
      }
    } catch (_e) { /* ignore */ }

    // ===== Register ALL listeners BEFORE joining =====

    socket.on('all-users', (users: Array<{ socketId: string; userName: string }>) => {
      console.log('[WebRTC] Received all-users:', users.length, 'existing users');

      const newPeers: PeerInfo[] = [];
      users.forEach((user) => {
        // Don't peer with ourselves
        if (user.socketId === socket.id) return;
        // Avoid duplicate
        if (peersRef.current.some(p => p.peerID === user.socketId)) return;

        console.log('[WebRTC] Creating initiator peer for', user.userName, user.socketId);
        const { pc, remoteStream } = createPeer(user.socketId, socket.id!, name);
        newPeers.push({ peerID: user.socketId, pc, peerName: user.userName, stream: remoteStream });
      });

      peersRef.current = [...peersRef.current, ...newPeers];
      setPeers([...peersRef.current]);
    });

    socket.on('user-joined', async (payload: { signal: any; callerID: string; callerName: string }) => {
      console.log('[WebRTC] Received user-joined from', payload.callerName, payload.callerID, payload.signal.type);

      let existingPeer = peersRef.current.find(p => p.peerID === payload.callerID);
      if (!existingPeer) {
        console.log('[WebRTC] Creating responder peer for', payload.callerID);
        const { pc, remoteStream } = addPeer(payload.callerID);
        existingPeer = { peerID: payload.callerID, pc, peerName: payload.callerName || 'User', stream: remoteStream, iceQueue: [] };
        peersRef.current.push(existingPeer);
        setPeers([...peersRef.current]);
      }

      try {
        if (payload.signal.type === 'offer') {
          await existingPeer.pc.setRemoteDescription(new RTCSessionDescription(payload.signal));
          if (existingPeer.iceQueue) {
            for (const c of existingPeer.iceQueue) {
              await existingPeer.pc.addIceCandidate(new RTCIceCandidate(c));
            }
            existingPeer.iceQueue = [];
          }
          const answer = await existingPeer.pc.createAnswer();
          await existingPeer.pc.setLocalDescription(answer);
          socket.emit('returning-signal', { signal: existingPeer.pc.localDescription, callerID: payload.callerID });
        } else if (payload.signal.type === 'candidate') {
          if (existingPeer.pc.remoteDescription && existingPeer.pc.remoteDescription.type) {
            await existingPeer.pc.addIceCandidate(new RTCIceCandidate(payload.signal.candidate));
          } else {
            existingPeer.iceQueue = existingPeer.iceQueue || [];
            existingPeer.iceQueue.push(payload.signal.candidate);
          }
        }
      } catch (err) {
        console.error('Error handling user-joined signal:', err);
      }
    });

    socket.on('receiving-returned-signal', async (payload: { signal: any; id: string }) => {
      console.log('[WebRTC] Received return signal from', payload.id, payload.signal.type);
      const item = peersRef.current.find(p => p.peerID === payload.id);
      if (item) {
        try {
          if (payload.signal.type === 'answer') {
            await item.pc.setRemoteDescription(new RTCSessionDescription(payload.signal));
            if (item.iceQueue) {
              for (const c of item.iceQueue) {
                await item.pc.addIceCandidate(new RTCIceCandidate(c));
              }
              item.iceQueue = [];
            }
          } else if (payload.signal.type === 'candidate') {
            if (item.pc.remoteDescription && item.pc.remoteDescription.type) {
              await item.pc.addIceCandidate(new RTCIceCandidate(payload.signal.candidate));
            } else {
              item.iceQueue = item.iceQueue || [];
              item.iceQueue.push(payload.signal.candidate);
            }
          }
        } catch (err) {
          console.error('Error receiving returned signal:', err);
        }
      }
    });

    const handleReceiveMessage = (data: { userId: string; message: string }) => {
      setMessages(prev => [...prev, { user: data.userId, text: data.message }]);
      if (activeTabRef.current !== 'chat') {
        setUnreadChatCount(prev => prev + 1);
      }
    };
    socket.on('receive-message', handleReceiveMessage);

    const handleUserDisconnected = (socketId: string) => {
      console.log('[WebRTC] User disconnected:', socketId);
      const peerObj = peersRef.current.find(p => p.peerID === socketId);
      if (peerObj) peerObj.pc.close();
      peersRef.current = peersRef.current.filter(p => p.peerID !== socketId);
      setPeers([...peersRef.current]);
    };
    socket.on('user-disconnected', handleUserDisconnected);

    // Video toggle sync
    const handlePeerVideoToggled = ({ peerId, isVideoOff }: { peerId: string, isVideoOff: boolean }) => {
      setPeers(prev => prev.map(p => p.peerID === peerId ? { ...p, isVideoOff } : p));
    };
    socket.on('peer-video-toggled', handlePeerVideoToggled);

    // ===== Get media then join =====
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      console.warn('[Media] MediaDevices API not available (requires HTTPS/localhost).');
      if (!isCancelled) {
        setMediaError('Camera/Microphone requires HTTPS or localhost. Joining in text-only mode.');
        setIsMuted(true);
        setIsVideoOff(true);
        socket.emit('join-room', roomId, name);
      }
    } else {
      navigator.mediaDevices.getUserMedia({ video: true, audio: true })
        .then((stream) => {
          if (isCancelled) {
            stream.getTracks().forEach(t => t.stop());
            return;
          }
          console.log('[Media] Got local stream');
          streamRef.current = stream;
          if (myVideoRef.current) {
            myVideoRef.current.srcObject = stream;
          }
          // NOW join the room
          console.log('[Socket] Emitting join-room for', roomId, name);
          socket.emit('join-room', roomId, name);
        })
        .catch((err) => {
          if (isCancelled) return;
          console.error('[Media] Error:', err);
          setMediaError('Camera/Microphone permission denied. You can still chat.');
          setIsMuted(true);
          setIsVideoOff(true);
          socket.emit('join-room', roomId, name);
        });
    }

    // ===== Cleanup =====
    return () => {
      isCancelled = true;
      socket.off('all-users');
      socket.off('user-joined');
      socket.off('receiving-returned-signal');
      socket.off('receive-message', handleReceiveMessage);
      socket.off('user-disconnected', handleUserDisconnected);
      socket.off('peer-video-toggled', handlePeerVideoToggled);
      peersRef.current.forEach(p => p.pc.close());
      peersRef.current = [];
      socket.disconnect();

      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
      if (myVideoRef.current) {
        myVideoRef.current.srcObject = null;
      }
    };
  }, [roomId, createPeer, addPeer]);

  // ===== Controls =====
  const toggleMute = () => {
    if (streamRef.current) {
      streamRef.current.getAudioTracks().forEach(t => { t.enabled = !t.enabled; });
      setIsMuted(m => !m);
    }
  };

  const toggleVideo = () => {
    if (!streamRef.current) return;

    if (!isVideoOff) {
      // Turn OFF camera: stop the video track entirely (camera light goes off)
      streamRef.current.getVideoTracks().forEach(t => t.stop());
      setIsVideoOff(true);
    } else {
      // Turn ON camera: re-acquire video track
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        alert("Camera access is not supported or requires a secure context (HTTPS).");
        return;
      }
      navigator.mediaDevices.getUserMedia({ video: true })
        .then((newStream) => {
          const newVideoTrack = newStream.getVideoTracks()[0];
          if (!streamRef.current || !newVideoTrack) return;

          // Replace the old track in our local stream
          const oldVideoTrack = streamRef.current.getVideoTracks()[0];
          if (oldVideoTrack) {
            streamRef.current.removeTrack(oldVideoTrack);
          }
          streamRef.current.addTrack(newVideoTrack);

          // Update local video preview
          if (myVideoRef.current) {
            myVideoRef.current.srcObject = streamRef.current;
          }

          // Replace the track in every active peer connection
          peersRef.current.forEach(({ pc }) => {
            try {
              const sender = pc.getSenders().find(
                (s) => s.track?.kind === 'video'
              );
              if (sender) {
                sender.replaceTrack(newVideoTrack);
              } else {
                pc.addTrack(newVideoTrack, streamRef.current!);
              }
            } catch (e) {
              console.warn('Could not replace track for peer:', e);
            }
          });

          setIsVideoOff(false);
        })
        .catch(err => {
          console.error('Could not re-acquire camera:', err);
        });
    }
  };

  const revertToCamera = async () => {
    setIsScreenSharing(false);
    try {
      const cameraStream = await navigator.mediaDevices.getUserMedia({ video: true });
      const cameraTrack = cameraStream.getVideoTracks()[0];

      if (streamRef.current) {
        const oldVideo = streamRef.current.getVideoTracks()[0];
        if (oldVideo) {
          streamRef.current.removeTrack(oldVideo);
          oldVideo.stop();
        }
        streamRef.current.addTrack(cameraTrack);
      }

      peersRef.current.forEach(peer => {
        const sender = peer.pc.getSenders().find(s => s.track?.kind === 'video');
        if (sender) sender.replaceTrack(cameraTrack);
      });

      if (myVideoRef.current) {
        myVideoRef.current.srcObject = streamRef.current;
      }
    } catch (err) {
      console.error("Failed to restore camera:", err);
      setIsVideoOff(true);
    }
  };

  const toggleScreenShare = async () => {
    try {
      if (!isScreenSharing) {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
          alert("Screen sharing is not supported in this browser or requires a secure context (HTTPS).");
          return;
        }
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const screenTrack = screenStream.getVideoTracks()[0];

        peersRef.current.forEach(peer => {
          const sender = peer.pc.getSenders().find(s => s.track?.kind === 'video');
          if (sender) sender.replaceTrack(screenTrack);
        });

        if (myVideoRef.current) {
          const previewStream = new MediaStream([screenTrack]);
          myVideoRef.current.srcObject = previewStream;
        }

        setIsScreenSharing(true);
        setIsVideoOff(false);

        screenTrack.onended = () => {
          revertToCamera();
        };
      } else {
        revertToCamera();
      }
    } catch (err) {
      console.error("Screen sharing error:", err);
    }
  };

  const leaveRoom = () => {
    // Destroy all peers
    peersRef.current.forEach(p => p.pc.close());
    peersRef.current = [];

    // Stop ALL tracks (camera + mic) — camera light goes off
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (myVideoRef.current) {
      myVideoRef.current.srcObject = null;
    }

    socket.disconnect();
    navigate('/dashboard');
  };

  const sendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (chatInput.trim()) {
      socket.emit('send-message', { text: chatInput, userName });
      setChatInput('');
    }
  };

  const copyRoomId = () => {
    navigator.clipboard.writeText(roomId || '');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isOwnMessage = (msgUser: string) => msgUser === userName || msgUser === socket.id;

  // ===== Render =====
  return (
    <div className="room-container">

      {/* Main Video Area */}
      <div className="room-main" onMouseMove={handleUserActivity} onClick={handleUserActivity}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', zIndex: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div className="apple-panel" style={{ padding: '0.5rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem', borderRadius: '12px', background: 'var(--panel-bg)', boxShadow: '0 2px 10px rgba(0,0,0,0.05)' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Room</span>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>{roomId}</h3>
              <div style={{ width: '1px', height: '16px', background: 'var(--border-color)', margin: '0 0.25rem' }}></div>
              <button className="icon-btn secondary" onClick={copyRoomId} title="Copy Room ID" style={{ width: '28px', height: '28px', padding: 0 }}>
                {copied ? <Check size={14} color="var(--success)" /> : <Copy size={14} />}
              </button>
            </div>

            <div className="apple-panel" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 0.8rem', borderRadius: '12px', background: '#34C75910', boxShadow: 'none' }}>
              <Lock size={14} color="var(--success)" />
              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--success)' }}>E2E Encrypted</span>
            </div>

            {mediaError && <div style={{ color: '#FF3B30', fontSize: '0.85rem', fontWeight: 500, padding: '0.5rem 0.8rem', borderRadius: '12px', background: '#FF3B3010' }}>{mediaError}</div>}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div className="apple-panel" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.8rem', borderRadius: '12px', background: 'var(--panel-bg)', boxShadow: '0 2px 10px rgba(0,0,0,0.05)' }}>
              <Users size={16} color="var(--text-secondary)" />
              <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>{peers.length + 1}</span>
            </div>

            <button
              className="apple-panel"
              onClick={() => setLayoutMode(layoutMode === 'grid' ? 'pinned' : 'grid')}
              title={layoutMode === 'grid' ? "Switch to Pinned View" : "Switch to Grid View"}
              style={{ padding: '0.5rem 0.8rem', display: 'flex', alignItems: 'center', gap: '0.5rem', borderRadius: '12px', border: 'none', cursor: 'pointer', color: 'var(--text-primary)', background: 'var(--panel-bg)', boxShadow: '0 2px 10px rgba(0,0,0,0.05)' }}
            >
              {layoutMode === 'grid' ? <Maximize size={16} /> : <LayoutGrid size={16} />}
              <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{layoutMode === 'grid' ? 'Focus' : 'Grid'}</span>
            </button>

            <div className="apple-panel" style={{ background: '#FF3B3010', color: '#FF3B30', padding: '0.5rem 0.8rem', borderRadius: '12px', fontSize: '0.8rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.4rem', boxShadow: 'none' }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#FF3B30' }}></div>
              REC
            </div>
          </div>
        </div>

        {/* Video Area */}
        {layoutMode === 'grid' ? (
          <div className="video-grid" style={{ gridTemplateColumns: `repeat(auto-fit, minmax(${peers.length === 0 ? '320px' : '220px'}, 1fr))` }}>
            {/* Local Video */}
            <div className="apple-panel" onClick={() => { setPinnedPeerId('local'); setLayoutMode('pinned'); }} style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden', borderRadius: '16px', display: 'flex', flexDirection: 'column', minHeight: '180px', cursor: 'pointer' }}>
              <video
                ref={(node) => {
                  myVideoRef.current = node;
                  if (node && streamRef.current && node.srcObject !== streamRef.current) {
                    node.srcObject = streamRef.current;
                  }
                }}
                autoPlay muted playsInline
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', transform: isScreenSharing ? 'none' : 'scaleX(-1)', opacity: isVideoOff && !isScreenSharing ? 0 : 1 }}
              />
              {isVideoOff && !isScreenSharing && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--panel-bg-secondary)' }}>
                  <div style={{ width: '90px', height: '90px', borderRadius: '50%', background: 'var(--primary)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2.5rem', fontWeight: 600 }}>
                    {userName.charAt(0).toUpperCase()}
                  </div>
                </div>
              )}
              <div style={{ position: 'absolute', bottom: '1rem', left: '1rem', background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(10px)', color: 'white', padding: '0.4rem 0.8rem', borderRadius: '8px', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                {userName} (You) {isMuted && <MicOff size={14} color="#FF3B30" />}
              </div>
            </div>

            {/* Remote Videos */}
            {peers.map(peerObj => (
              <div key={peerObj.peerID} onClick={() => { setPinnedPeerId(peerObj.peerID); setLayoutMode('pinned'); }} style={{ width: '100%', height: '100%', cursor: 'pointer' }}>
                <RemoteVideo stream={peerObj.stream} peerName={peerObj.peerName} peerID={peerObj.peerID} isVideoOff={peerObj.isVideoOff} />
              </div>
            ))}

            {/* Waiting placeholder */}
            {peers.length === 0 && (
              <div className="apple-panel" style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--panel-bg-secondary)', minHeight: '180px' }}>
                <div style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
                  <Users size={48} style={{ opacity: 0.5, marginBottom: '1rem' }} />
                  <p style={{ fontWeight: 500 }}>Waiting for others to join...</p>
                  <p style={{ fontSize: '0.85rem', marginTop: '0.5rem', opacity: 0.7 }}>Share the Room ID to invite people</p>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="pinned-layout-container">
            {/* Remote Strip (Left Column) */}
            {peers.length > 0 && (
              <div className="remote-video-strip">
                {/* Show all peers that are NOT currently pinned */}
                {peers.filter(p => p.peerID !== (pinnedPeerId || peers[0]?.peerID)).map(peerObj => (
                  <div key={peerObj.peerID} className="mini-remote-video" onClick={() => setPinnedPeerId(peerObj.peerID)} title={`Pin ${peerObj.peerName}`}>
                    <RemoteVideo stream={peerObj.stream} peerName={peerObj.peerName} peerID={peerObj.peerID} isVideoOff={peerObj.isVideoOff} />
                  </div>
                ))}
              </div>
            )}

            {/* Main Pinned Video (Right / Main Area) */}
            <div className="main-video-view">
              {pinnedPeerId === 'local' || (peers.length === 0) ? (
                <>
                  {/* Just one big local video */}
                  <div className="apple-panel" style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden', borderRadius: '16px', background: '#000' }}>
                    <video
                      ref={(node) => {
                        myVideoRef.current = node;
                        if (node && streamRef.current && node.srcObject !== streamRef.current) {
                          node.srcObject = streamRef.current;
                        }
                      }}
                      autoPlay muted playsInline
                      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', transform: isScreenSharing ? 'none' : 'scaleX(-1)', opacity: isVideoOff && !isScreenSharing ? 0 : 1 }}
                    />
                    {isVideoOff && !isScreenSharing && (
                      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--panel-bg-secondary)' }}>
                        <div style={{ width: '120px', height: '120px', borderRadius: '50%', background: 'var(--primary)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '3rem', fontWeight: 600 }}>
                          {userName.charAt(0).toUpperCase()}
                        </div>
                      </div>
                    )}
                    <div style={{ position: 'absolute', bottom: '1.5rem', left: '1.5rem', background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(10px)', color: 'white', padding: '0.6rem 1rem', borderRadius: '8px', fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', maxWidth: 'calc(100% - 3rem)', zIndex: 10 }}>
                      <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{userName} (You)</div>
                      {isMuted && <MicOff size={16} color="#FF3B30" style={{ flexShrink: 0 }} />}
                    </div>

                    {/* Color Boundary Overlay */}
                    <div style={{ position: 'absolute', inset: 0, border: `2px solid ${getHashColor(socket.id || '')}`, borderRadius: '16px', pointerEvents: 'none', zIndex: 20 }}></div>
                  </div>
                </>
              ) : (
                (() => {
                  const targetPeer = peers.find(p => p.peerID === pinnedPeerId) || peers[0];
                  if (!targetPeer) return null;
                  return <RemoteVideo stream={targetPeer.stream} peerName={targetPeer.peerName} peerID={targetPeer.peerID} isMainView={true} isVideoOff={targetPeer.isVideoOff} />;
                })()
              )}

              {/* Floating Local Video (Bottom Right over Main View) */}
              {pinnedPeerId !== 'local' && peers.length > 0 && (
                <div className="floating-local-video apple-panel" onClick={() => setPinnedPeerId('local')} title="Pin me">
                  <video
                    ref={(node) => {
                      myVideoRef.current = node;
                      if (node && streamRef.current && node.srcObject !== streamRef.current) {
                        node.srcObject = streamRef.current;
                      }
                    }}
                    autoPlay muted playsInline
                    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', transform: isScreenSharing ? 'none' : 'scaleX(-1)', opacity: isVideoOff && !isScreenSharing ? 0 : 1 }}
                  />
                  {isVideoOff && !isScreenSharing && (
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--panel-bg-secondary)' }}>
                      <div style={{ width: '60px', height: '60px', borderRadius: '50%', background: 'var(--primary)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', fontWeight: 600 }}>
                        {userName.charAt(0).toUpperCase()}
                      </div>
                    </div>
                  )}
                  <div style={{ position: 'absolute', bottom: '0.5rem', left: '0.5rem', background: 'rgba(0,0,0,0.65)', color: 'white', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem', maxWidth: 'calc(100% - 1rem)', zIndex: 10 }}>
                    <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>You</div>
                    {isMuted && <MicOff size={10} color="#FF3B30" style={{ flexShrink: 0 }} />}
                  </div>

                  {/* Color Boundary Overlay */}
                  <div style={{ position: 'absolute', inset: 0, border: `2px solid ${getHashColor(socket.id || '')}`, borderRadius: '16px', pointerEvents: 'none', zIndex: 20 }}></div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Controls Bar */}
        <div className={`apple-panel controls-bar ${showControls ? '' : 'hidden'}`} onMouseEnter={() => {
          // Keep controls visible if hovering directly over them
          setShowControls(true);
          if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
        }} onMouseLeave={handleUserActivity}>
          <button className={`icon-btn ${isMuted ? 'destructive' : 'secondary'}`} onClick={toggleMute} style={{ width: '48px', height: '48px' }}>
            {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
          </button>
          <button className={`icon-btn ${isVideoOff ? 'destructive' : 'secondary'}`} onClick={toggleVideo} style={{ width: '48px', height: '48px' }}>
            {isVideoOff ? <VideoOff size={20} /> : <Video size={20} />}
          </button>
          <button className={`icon-btn ${isScreenSharing ? 'primary' : 'secondary'}`} onClick={toggleScreenShare} style={{ width: '48px', height: '48px', background: isScreenSharing ? 'var(--primary)' : undefined, color: isScreenSharing ? 'white' : undefined }}>
            <MonitorUp size={20} />
          </button>

          <div style={{ width: '1px', height: '32px', background: 'var(--border-color)', margin: '0 0.5rem' }}></div>

          <button className="icon-btn" onClick={() => setActiveTab(activeTab === 'chat' ? null : 'chat')} style={{ position: 'relative', width: '48px', height: '48px', background: activeTab === 'chat' ? 'var(--primary)' : 'var(--panel-bg-secondary)', color: activeTab === 'chat' ? 'white' : 'var(--primary)' }}>
            <MessageSquare size={20} />
            {unreadChatCount > 0 && (
              <div style={{ position: 'absolute', top: '-4px', right: '-4px', background: '#FF3B30', color: 'white', borderRadius: '50%', width: '20px', height: '20px', fontSize: '0.7rem', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', border: '2px solid var(--panel-bg)', zIndex: 10, pointerEvents: 'none' }}>
                {unreadChatCount > 9 ? '9+' : unreadChatCount}
              </div>
            )}
          </button>
          <button className="icon-btn" onClick={() => setActiveTab(activeTab === 'participants' ? null : 'participants')} style={{ width: '48px', height: '48px', background: activeTab === 'participants' ? 'var(--primary)' : 'var(--panel-bg-secondary)', color: activeTab === 'participants' ? 'white' : 'var(--primary)' }}>
            <Users size={20} />
          </button>
          <button className="icon-btn" onClick={() => setActiveTab(activeTab === 'whiteboard' ? null : 'whiteboard')} style={{ width: '48px', height: '48px', background: activeTab === 'whiteboard' ? 'var(--primary)' : 'var(--panel-bg-secondary)', color: activeTab === 'whiteboard' ? 'white' : 'var(--primary)' }}>
            <PenTool size={20} />
          </button>

          <div style={{ width: '1px', height: '32px', background: 'var(--border-color)', margin: '0 0.5rem' }}></div>

          <button onClick={leaveRoom} className="destructive" style={{ borderRadius: '100px', padding: '0.75rem 1.5rem', fontWeight: 600 }}>
            <PhoneOff size={18} style={{ marginRight: '0.5rem' }} /> Leave
          </button>
        </div>
      </div>

      {/* Sidebar Wrapper */}
      {activeTab && (
        <div style={{ position: 'relative', display: 'flex', width: `${sidebarWidth}px`, margin: '1.5rem 1.5rem 1.5rem 0', flexShrink: 0 }}>
          {/* Resize Handle */}
          <div
            onMouseDown={() => {
              isResizing.current = true;
              document.body.style.cursor = 'col-resize';
            }}
            style={{ width: '12px', cursor: 'col-resize', position: 'absolute', left: '-6px', top: 0, bottom: 0, zIndex: 10 }}
          />

          <div className="apple-panel room-sidebar" style={{ width: '100%', margin: 0 }}>
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--panel-bg-secondary)' }}>
              <h3 style={{ margin: 0, textTransform: 'capitalize', fontSize: '1.1rem' }}>{activeTab}</h3>
              <button className="icon-btn secondary" onClick={() => setActiveTab(null)} style={{ padding: '0.4rem', color: 'var(--text-secondary)' }}>
                <X size={18} />
              </button>
            </div>

            {/* Chat */}
            {activeTab === 'chat' && (
              <>
                <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem', background: 'var(--panel-bg)' }}>
                  {messages.length === 0 ? (
                    <div style={{ textAlign: 'center', color: 'var(--text-secondary)', marginTop: '3rem' }}>
                      <MessageSquare size={40} style={{ opacity: 0.3, marginBottom: '1rem' }} />
                      <p>No messages yet. Say hello!</p>
                    </div>
                  ) : (
                    messages.map((msg, idx) => (
                      <div key={idx} style={{ alignSelf: isOwnMessage(msg.user) ? 'flex-end' : 'flex-start', maxWidth: '85%' }}>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.3rem', marginLeft: '0.5rem' }}>
                          {isOwnMessage(msg.user) ? 'You' : msg.user.substring(0, 20)}
                        </div>
                        <div style={{
                          background: isOwnMessage(msg.user) ? 'var(--primary)' : 'var(--panel-bg-secondary)',
                          color: isOwnMessage(msg.user) ? 'white' : 'var(--text-primary)',
                          padding: '0.8rem 1rem', borderRadius: '18px',
                          borderBottomRightRadius: isOwnMessage(msg.user) ? '4px' : '18px',
                          borderBottomLeftRadius: !isOwnMessage(msg.user) ? '4px' : '18px',
                        }}>
                          {msg.text}
                        </div>
                      </div>
                    ))
                  )}
                </div>
                <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--border-color)', background: 'var(--panel-bg-secondary)' }}>
                  <form onSubmit={sendMessage} style={{ display: 'flex', gap: '0.75rem' }}>
                    <input type="text" placeholder="Message..." value={chatInput} onChange={e => setChatInput(e.target.value)}
                      style={{ flex: 1, borderRadius: '100px', padding: '0.75rem 1.25rem', border: '1px solid var(--border-color)', background: 'var(--panel-bg)' }} />
                    <button type="submit" style={{ borderRadius: '100px', padding: '0.75rem 1.25rem' }}>Send</button>
                  </form>
                </div>
              </>
            )}

            {/* Participants */}
            {activeTab === 'participants' && (
              <div style={{ padding: '0', flex: 1, background: 'var(--panel-bg)', overflowY: 'auto' }}>
                <div style={{ padding: '1rem 1.5rem', display: 'flex', alignItems: 'center', gap: '1rem', borderBottom: '1px solid var(--border-color)' }}>
                  <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'var(--primary)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: '1.2rem' }}>
                    {userName.charAt(0).toUpperCase()}
                  </div>
                  <div style={{ flex: 1, fontWeight: 500 }}>{userName} (You)</div>
                  {isMuted ? <MicOff size={18} color="#FF3B30" /> : <Mic size={18} color="var(--text-secondary)" />}
                </div>
                {peers.map(peerObj => (
                  <div key={peerObj.peerID} style={{ padding: '1rem 1.5rem', display: 'flex', alignItems: 'center', gap: '1rem', borderBottom: '1px solid var(--border-color)' }}>
                    <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'var(--panel-bg-secondary)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: '1.2rem' }}>
                      {peerObj.peerName?.charAt(0).toUpperCase() || 'U'}
                    </div>
                    <div style={{ flex: 1, fontWeight: 500 }}>{peerObj.peerName || 'User'}</div>
                    <Mic size={18} color="var(--text-secondary)" />
                  </div>
                ))}
              </div>
            )}

            {/* Whiteboard */}
            {activeTab === 'whiteboard' && (
              <div style={{ flex: 1, overflow: 'hidden' }}>
                <Whiteboard peers={peers} localUserName={userName} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
