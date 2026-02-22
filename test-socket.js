const { io } = require("socket.io-client");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const Room = require("./backend/models/Room.js");

(async () => {
  await mongoose.connect("mongodb://127.0.0.1:27017/studyserver");
  const room = await Room.findOne();
  if(!room) { console.log("No rooms"); return; }
  
  const token = jwt.sign({ name: "Debug Bot", email: "debug@bot.com" }, "supersecretkey");
  const socket = io("http://localhost:5000", { auth: { token } });

  socket.on("connect", () => {
    console.log("Socket connected! Emitting join-room for", room._id);
    socket.emit("join-room", { roomId: room._id.toString() });
  });

  socket.on("presence-update", (data) => console.log("PRESENCE UPDATE:", data));
  socket.on("chat-history", () => console.log("CHAT HISTORY received"));
  socket.on("room-goals-update", () => console.log("GOALS received"));
  socket.on("room-info", () => console.log("ROOM INFO received"));

  socket.on("connect_error", (err) => {
    console.log("Connect Error:", err.message);
  });
  
  setTimeout(() => process.exit(0), 2000);
})();
