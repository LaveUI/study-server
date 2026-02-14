import mongoose from "mongoose";

const roomSchema = new mongoose.Schema({
  name: String,
  type: String, // public | private
  inviteCode: String,
  users: [String],
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

export default mongoose.model("Room", roomSchema);
