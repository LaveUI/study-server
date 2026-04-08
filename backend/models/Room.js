import mongoose from "mongoose";

const roomSchema = new mongoose.Schema({
  name: String,
  type: String, // public | private
  host: String, // Tracks the creator of the room (email)
  hostName: String, // Tracks the display name of the host
  hostPicture: String, // Stores the creator's OAuth Avatar URL
  inviteCode: String,
  users: [String],
  tasks: [{
    id: String,
    text: String,
    status: { type: String, default: "todo" }, // todo, doing, done
    assigneeName: String,
    assigneeRole: String,
    assigneePicture: String
  }],
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

export default mongoose.model("Room", roomSchema);
