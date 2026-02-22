import { io } from "socket.io-client";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import Room from "./models/Room.js";
import dotenv from "dotenv";

dotenv.config();

(async () => {
    await mongoose.connect(process.env.MONGO_URI || "mongodb://127.0.0.1:27017/studyserver");
    const room = await Room.findOne();
    if (!room) { console.log("No rooms"); process.exit(1); }

    const token = jwt.sign({ name: "Debug Bot", email: "debug@bot.com" }, process.env.JWT_SECRET || "supersecretkey");
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
