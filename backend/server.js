import express from "express";
import cors from "cors";
import http from "http";
import https from "https";
import { Server } from "socket.io";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { OAuth2Client } from "google-auth-library";
import dotenv from "dotenv";

import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { connectDB } from "./db.js";
import Room from "./models/Room.js";
import Message from "./models/Message.js";

/* ---------------- Setup ---------------- */

dotenv.config();
connectDB();

const app = express();
const server = http.createServer(app);

mongoose.connection.once("open", async () => {
  try {
    const publicRoomCount = await Room.countDocuments({ type: "public" });
    if (publicRoomCount === 0) {
      await Room.insertMany([
        { name: "Lofi Study Lounge", type: "public", host: "System", hostName: "System", hostPicture: "https://api.dicebear.com/7.x/bottts/svg?seed=Lofi" },
        { name: "Silent Library", type: "public", host: "System", hostName: "System", hostPicture: "https://api.dicebear.com/7.x/bottts/svg?seed=Library" },
        { name: "Pomodoro Focus", type: "public", host: "System", hostName: "System", hostPicture: "https://api.dicebear.com/7.x/bottts/svg?seed=Pomodoro" }
      ]);
      console.log("🌱 Seeded default public rooms");
    }
  } catch (err) {
    console.error("Failed to seed rooms:", err);
  }
});

const io = new Server(server, {
  cors: {
    origin: "*", // Universal entry required for Render/Vercel/Atlas interactions
    methods: ["GET", "POST"],
  },
});

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5000;

/* ---------------- In-memory Stores ---------------- */

const timers = {};
const onlineUsers = {};
let pomodoroTimers = {};
let roomGoals = {};


/* ---------------- REST API & STATIC SERVING ---------------- */

app.use(express.static(path.join(__dirname, "../src")));

app.get("/", (req, res) => {
  res.redirect("/pages/dashboard.html");
});

/* ---------- Render Keep-Alive (Free Tier Fix) ---------- */

app.get("/ping", (req, res) => res.send("pong"));

const RENDER_URL = process.env.RENDER_EXTERNAL_URL;
if (RENDER_URL) {
  setInterval(() => {
    https.get(`${RENDER_URL}/ping`, (res) => {
      console.log(`🚀 Self-ping successful: Status ${res.statusCode} (Server is awake)`);
    }).on('error', (err) => {
      console.error("❌ Self-ping failed:", err.message);
    });
  }, 14 * 60 * 1000); // Ping every 14 minutes
}

/* ---------- Get Public Rooms ---------- */

app.get("/rooms", async (req, res) => {
  try {
    const rooms = await Room.find({ type: "public" });
    res.json(rooms);
  } catch {
    res.status(500).json({ error: "Failed to load rooms" });
  }
});

/* ---------- Get User's Private Rooms (Dashboard lookup) ---------- */

app.get("/rooms/my-rooms/:username", async (req, res) => {
  try {
    const username = req.params.username;
    // Find private rooms where this user is the host
    const rooms = await Room.find({ host: username, type: "private" });
    res.json(rooms);
  } catch {
    res.status(500).json({ error: "Failed to load your rooms" });
  }
});

/* ---------- Create Room (Host Enabled) ---------- */

app.post("/rooms", async (req, res) => {
  try {
    const { name, host, hostName, hostPicture } = req.body;

    if (!name || !host) {
      return res.status(400).json({ error: "name and host required" });
    }

    const room = new Room({
      name,
      type: "private",
      host,
      hostName,
      hostPicture,
      inviteCode: crypto.randomBytes(4).toString("hex"),
    });

    await room.save();
    res.status(201).json(room);
  } catch {
    res.status(500).json({ error: "Room creation failed" });
  }
});

/* ---------- Invite Lookup ---------- */

app.get("/rooms/invite/:code", async (req, res) => {
  try {
    const room = await Room.findOne({
      type: "private",
      inviteCode: req.params.code,
    });

    if (!room) {
      return res.status(404).json({ error: "Invalid invite link" });
    }

    res.json(room);
  } catch {
    res.status(500).json({ error: "Invite lookup failed" });
  }
});

/* ---------- Delete Room ---------- */

app.delete("/rooms/:id", async (req, res) => {
  try {
    const roomId = req.params.id;
    const deletedRoom = await Room.findByIdAndDelete(roomId);

    if (!deletedRoom) {
      return res.status(404).json({ error: "Room not found" });
    }

    res.json({ success: true, message: "Room deleted successfully" });
  } catch {
    res.status(500).json({ error: "Failed to delete room" });
  }
});

/* ---------------- Google Auth ---------------- */

app.post("/auth/google", async (req, res) => {
  try {
    const { credential } = req.body;

    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();

    const user = {
      name: payload.name,
      email: payload.email,
      picture: payload.picture,
    };

    const token = jwt.sign(user, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    res.json({ token, user });
  } catch {
    res.status(401).json({ error: "Invalid Google token" });
  }
});

/* ---------------- Guest Auth (Local Dev) ---------------- */

app.post("/auth/guest", (req, res) => {
  try {
    const user = {
      name: `Guest_${Math.floor(Math.random() * 1000)}`,
      email: `guest${Date.now()}@example.com`,
      picture: `https://api.dicebear.com/7.x/bottts/svg?seed=${Date.now()}`,
    };

    const token = jwt.sign(user, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    res.json({ token, user });
  } catch {
    res.status(500).json({ error: "Failed to create guest session" });
  }
});

/* ---------------- Socket Auth ---------------- */

io.use((socket, next) => {
  const token = socket.handshake.auth?.token;

  if (!token) return next(new Error("Authentication required"));

  try {
    const user = jwt.verify(token, process.env.JWT_SECRET);
    socket.user = user;
    next();
  } catch {
    next(new Error("Invalid token"));
  }
});

/* ---------------- Socket.IO ---------------- */

io.on("connection", (socket) => {
  console.log("🟢 Connected:", socket.user.name);

  /* ================= JOIN ROOM ================= */

  socket.on("join-room", async ({ roomId }) => {
    try {
      console.log(`-> JOIN REQUEST FROM: ${socket.user?.name} | ROOM: ${roomId}`);
      if (!roomId || !mongoose.Types.ObjectId.isValid(roomId)) {
        console.log("-> JOIN REJECTED: INVALID ROOM ID");
        return;
      }

      const room = await Room.findById(roomId);
      if (!room) return;

      // ===== PRIVATE ROOM CAPACITY CAP (max 8 users) =====
      if (room.type === "private") {
        const roomSockets = await io.in(roomId).fetchSockets();
        if (roomSockets.length >= 8) {
          socket.emit("room-full", { message: "This room is full (max 8 users)." });
          console.log(`-> JOIN REJECTED: ROOM FULL (${roomSockets.length}/8) | ROOM: ${roomId}`);
          return;
        }
      }

      socket.join(roomId);
      socket.roomId = roomId;

      // 👇 HOST CHECK
      socket.isHost = room.host === socket.user.email;

      /* ----- Presence ----- */

      if (!onlineUsers[roomId]) {
        onlineUsers[roomId] = new Map();
      }

      onlineUsers[roomId].set(socket.user.name, "online");

      const publicUsers = Array.from(onlineUsers[roomId].entries())
        .map(([name, status]) => ({ name, status }))
        .filter(u => u.status !== "ghost");

      io.to(roomId).emit("presence-update", {
        users: publicUsers,
        count: publicUsers.length,
      });

      /* ----- Send Chat History & Goals ----- */

      const messages = await Message.find({ roomId })
        .sort({ createdAt: 1 })
        .limit(50);

      socket.emit("chat-history", messages);
      socket.emit("agile-tasks-update", room.tasks || []);

      socket.emit("room-info", {
        name: room.name,
        type: room.type,
        inviteCode: room.inviteCode
      });

    } catch (err) {
      console.error("Join room error:", err);
    }
  });

  /* ================= PRESENCE STATUS ================= */

  socket.on("change-status", ({ status }) => {
    const { roomId } = socket;
    if (!roomId || !onlineUsers[roomId]) return;

    if (onlineUsers[roomId].has(socket.user.name)) {
      onlineUsers[roomId].set(socket.user.name, status);

      const publicUsers = Array.from(onlineUsers[roomId].entries())
        .map(([name, s]) => ({ name, status: s }))
        .filter(u => u.status !== "ghost");

      io.to(roomId).emit("presence-update", {
        users: publicUsers,
        count: publicUsers.length,
      });
    }
  });

  /* ================= VIDEO SIGNALING ================= */

  socket.on("video-ready", ({ roomId, isVideoOff }) => {
    socket.to(roomId).emit("video-ready", {
      sender: socket.id,
      name: socket.user?.name,
      picture: socket.user?.picture,
      isVideoOff
    });
  });

  socket.on("client-state-change", ({ roomId, isMuted, isVideoOff }) => {
    socket.to(roomId).emit("client-state-change", {
      userId: socket.id,
      isMuted,
      isVideoOff
    });
  });

  socket.on("video-offer", ({ offer, target, isVideoOff }) => {
    io.to(target).emit("video-offer", {
      offer,
      sender: socket.id,
      name: socket.user?.name,
      picture: socket.user?.picture,
      isVideoOff
    });
  });

  socket.on("video-answer", ({ answer, target, isVideoOff }) => {
    io.to(target).emit("video-answer", {
      answer,
      sender: socket.id,
      name: socket.user?.name,
      picture: socket.user?.picture,
      isVideoOff
    });
  });

  socket.on("ice-candidate", ({ candidate, target }) => {
    io.to(target).emit("ice-candidate", {
      candidate,
      sender: socket.id,
    });
  });

  /* ================= CHAT ================= */

  socket.on("chat-message", async ({ roomId, message }) => {
    try {
      console.log(`-> CHAT MSG FROM: ${socket.user?.name} | ROOM: ${roomId}`);
      if (!roomId || !mongoose.Types.ObjectId.isValid(roomId)) return;
      if (!message) return;

      const savedMessage = await Message.create({
        roomId,
        user: socket.user.name,
        message: message.trim(),
      });

      io.to(roomId).emit("chat-message", {
        user: savedMessage.user,
        message: savedMessage.message,
        createdAt: savedMessage.createdAt,
      });
    } catch (err) {
      console.error("Chat error:", err);
    }
  });

  /* ================= HOST CONTROLS ================= */

  socket.on("mute-all", ({ roomId }) => {
    if (!socket.isHost) return;
    io.to(roomId).emit("force-mute");
  });

  /* ================= AGILE TASK BOARD (PERSISTENT) ================= */

  socket.on("add-agile-task", async ({ roomId, text }) => {
    if (!roomId || !text) return;
    
    try {
      const room = await Room.findById(roomId);
      if (!room) return;
      
      room.tasks.push({
        id: Date.now().toString(),
        text: text,
        status: "todo",
        assigneeName: null,
        assigneeRole: null,
        assigneePicture: null
      });
      
      await room.save();
      io.to(roomId).emit("agile-tasks-update", room.tasks);
    } catch(err) {
      console.error("Task add failed:", err);
    }
  });

  socket.on("update-task-status", async ({ roomId, taskId, status }) => {
    if (!roomId || !taskId || !status) return;

    try {
      const room = await Room.findById(roomId);
      if (!room) return;
      
      const task = room.tasks.find(t => t.id === taskId);
      if (task) {
        task.status = status;
        await room.save();
        io.to(roomId).emit("agile-tasks-update", room.tasks);
      }
    } catch(err) {}
  });

  socket.on("claim-task", async ({ roomId, taskId, user, role }) => {
    if (!roomId || !taskId || !user) return;

    try {
      const room = await Room.findById(roomId);
      if (!room) return;
      
      const task = room.tasks.find(t => t.id === taskId);
      if (task) {
        task.assigneeName = user.name;
        task.assigneePicture = user.picture;
        task.assigneeRole = role || "Member";
        await room.save();
        io.to(roomId).emit("agile-tasks-update", room.tasks);
      }
    } catch(err) {}
  });

  socket.on("delete-task", async ({ roomId, taskId }) => {
    if (!roomId || !taskId) return;

    try {
      const room = await Room.findById(roomId);
      if (!room) return;
      
      room.tasks = room.tasks.filter(t => t.id !== taskId);
      await room.save();
      io.to(roomId).emit("agile-tasks-update", room.tasks);
    } catch(err) {}
  });

  /* ================= TIMER ================= */
  /* ================= POMODORO TIMER ================= */

  socket.on("pomodoro-start", ({ roomId, focus, breakTime }) => {

    if (!roomId || !focus || !breakTime) return;

    // Clear existing timer
    if (pomodoroTimers[roomId]) {
      clearInterval(pomodoroTimers[roomId].interval);
    }

    let timeLeft = focus;
    let phase = "focus";

    // Store timer state
    pomodoroTimers[roomId] = {
      focus,
      breakTime,
      timeLeft,
      phase,
      interval: null
    };

    // Immediately send first update (no delay)
    io.to(roomId).emit("pomodoro-update", {
      timeLeft,
      phase
    });

    pomodoroTimers[roomId].interval = setInterval(() => {

      timeLeft--;
      pomodoroTimers[roomId].timeLeft = timeLeft;

      if (timeLeft <= 0) {

        if (phase === "focus") {
          phase = "break";
          timeLeft = breakTime;
        } else {
          phase = "focus";
          timeLeft = focus;
        }

        pomodoroTimers[roomId].phase = phase;
        pomodoroTimers[roomId].timeLeft = timeLeft;
      }

      io.to(roomId).emit("pomodoro-update", {
        timeLeft,
        phase
      });

    }, 1000);
  });


  /* ================= STOP POMODORO ================= */

  socket.on("pomodoro-stop", ({ roomId }) => {

    if (!roomId || !pomodoroTimers[roomId]) return;

    clearInterval(pomodoroTimers[roomId].interval);
    delete pomodoroTimers[roomId];

    io.to(roomId).emit("pomodoro-stopped");
  });

  /* ================= STOP TIMER ================= */


  socket.on("timer-start", ({ roomId, duration }) => {

    if (!roomId || !duration) return;

    if (!timers[roomId]) {
      timers[roomId] = {};
    }

    if (timers[roomId].running) return;

    timers[roomId] = {
      timeLeft: duration,
      running: true
    };

    timers[roomId].interval = setInterval(() => {

      timers[roomId].timeLeft--;

      io.to(roomId).emit("timer-update", {
        timeLeft: timers[roomId].timeLeft,
        running: true
      });

      if (timers[roomId].timeLeft <= 0) {

        clearInterval(timers[roomId].interval);

        timers[roomId].running = false;

        io.to(roomId).emit("timer-update", {
          timeLeft: 0,
          running: false
        });
      }

    }, 1000);
  });

  socket.on("timer-reset", ({ roomId }) => {

    if (!roomId || !timers[roomId]) return;

    clearInterval(timers[roomId].interval);

    timers[roomId] = {
      timeLeft: 25 * 60,
      running: false
    };

    io.to(roomId).emit("timer-update", {
      timeLeft: timers[roomId].timeLeft,
      running: false
    });
  });


  /* ================= DISCONNECT ================= */

  socket.on("disconnect", () => {
    const { roomId } = socket;
    if (!roomId) return;

    io.to(roomId).emit("user-disconnected", socket.id);

    if (onlineUsers[roomId]) {
      onlineUsers[roomId].delete(socket.user.name);

      const publicUsers = Array.from(onlineUsers[roomId].entries())
        .map(([name, status]) => ({ name, status }))
        .filter(u => u.status !== "ghost");

      io.to(roomId).emit("presence-update", {
        users: publicUsers,
        count: publicUsers.length,
      });

      if (onlineUsers[roomId].size === 0) {

        // 🔥 Clear Pomodoro if room empty
        if (pomodoroTimers[roomId]) {
          clearInterval(pomodoroTimers[roomId].interval);
          delete pomodoroTimers[roomId];
        }

        delete onlineUsers[roomId];
      }

    }


    console.log("🔴 Disconnected:", socket.user.name);
  });
});

/* ---------------- Start Server ---------------- */

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
