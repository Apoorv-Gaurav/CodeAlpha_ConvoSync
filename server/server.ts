import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { User } from './models/User';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/convosync';
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret';

// Connect to MongoDB
mongoose.connect(MONGO_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch((err) => console.error('MongoDB connection error:', err));

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// ======== Auth Routes ========

app.post('/api/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists with this email' });
    }
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    const newUser = new User({ name, email, password: hashedPassword });
    await newUser.save();
    const token = jwt.sign({ id: newUser._id, name: newUser.name }, JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({ token, user: { id: newUser._id, name: newUser.name, email: newUser.email } });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Server error during registration' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: 'Invalid credentials' });
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: 'Invalid credentials' });
    const token = jwt.sign({ id: user._id, name: user.name }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user._id, name: user.name, email: user.email } });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error during login' });
  }
});

app.get('/', (_req, res) => {
  res.send('ConvoSync Signaling Server is running');
});

// ======== Room state tracking ========
// Map<roomId, Array<{socketId, userName}>>
const rooms = new Map<string, Array<{ socketId: string; userName: string }>>();
// Map<roomId, Array<Strokes>>
const roomStrokes = new Map<string, any[]>();

// ======== Socket.IO ========
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Track which room this socket joined (to avoid double-join)
  let currentRoom: string | null = null;
  let currentUserName: string | null = null;

  socket.on('join-room', (roomId: string, userName: string) => {
    // Prevent double-join from React Strict Mode
    if (currentRoom === roomId) {
      console.log(`[SKIP] ${userName} (${socket.id}) already in room ${roomId}`);
      return;
    }

    // If they were in another room, leave it first
    if (currentRoom) {
      socket.leave(currentRoom);
      removeFromRoom(currentRoom, socket.id);
    }

    currentRoom = roomId;
    currentUserName = userName;
    socket.join(roomId);
    console.log(`User ${userName} (Socket: ${socket.id}) joined room: ${roomId}`);

    // Get existing users BEFORE adding new user
    const existingUsers = rooms.get(roomId) || [];

    // Send the list of existing users to the new joiner
    socket.emit('all-users', existingUsers.map(u => ({ socketId: u.socketId, userName: u.userName })));

    // Add new user to room
    const roomUsers = rooms.get(roomId) || [];
    roomUsers.push({ socketId: socket.id, userName });
    rooms.set(roomId, roomUsers);
  });

  // WebRTC signaling
  socket.on('sending-signal', (payload: { userToSignal: string; callerID: string; signal: any; callerName: string }) => {
    io.to(payload.userToSignal).emit('user-joined', {
      signal: payload.signal,
      callerID: payload.callerID,
      callerName: payload.callerName
    });
  });

  socket.on('returning-signal', (payload: { callerID: string; signal: any }) => {
    io.to(payload.callerID).emit('receiving-returned-signal', {
      signal: payload.signal,
      id: socket.id
    });
  });

  // Chat
  socket.on('send-message', (data: any) => {
    if (!currentRoom) return;
    const name = data.userName || currentUserName || 'User';
    const text = data.text || data;
    io.to(currentRoom).emit('receive-message', {
      userId: name,
      message: text,
      timestamp: new Date().toISOString()
    });
  });

  // Whiteboard
  socket.on('draw', (drawData: any) => {
    if (currentRoom) {
      const strokes = roomStrokes.get(currentRoom) || [];
      strokes.push(drawData);
      roomStrokes.set(currentRoom, strokes);
      socket.to(currentRoom).emit('draw', drawData);
    }
  });

  socket.on('clear-board', () => {
    if (currentRoom) {
      roomStrokes.delete(currentRoom);
      socket.to(currentRoom).emit('clear-board');
    }
  });

  socket.on('request-strokes', () => {
    if (currentRoom) {
      socket.emit('initial-strokes', roomStrokes.get(currentRoom) || []);
    }
  });

  // Video State Sync
  socket.on('toggle-video', (isVideoOff: boolean) => {
    if (currentRoom) {
      socket.to(currentRoom).emit('peer-video-toggled', { peerId: socket.id, isVideoOff });
    }
  });

  // Disconnect
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    if (currentRoom) {
      removeFromRoom(currentRoom, socket.id);
      socket.to(currentRoom).emit('user-disconnected', socket.id);
    }
  });
});

function removeFromRoom(roomId: string, socketId: string) {
  const users = rooms.get(roomId);
  if (!users) return;
  const updated = users.filter(u => u.socketId !== socketId);
  if (updated.length === 0) {
    rooms.delete(roomId);
  } else {
    rooms.set(roomId, updated);
  }
}

server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
