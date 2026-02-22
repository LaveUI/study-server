import mongoose from "mongoose";

const roomSchema = new mongoose.Schema({
  name: String,
  type: String, // public | private
  host: String, // Tracks the creator of the room (email)
  hostName: String, // Tracks the display name of the host
  inviteCode: String,
  users: [String],
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

export default mongoose.model("Room", roomSchema);
