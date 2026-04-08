import mongoose from "mongoose";
import { MongoMemoryServer } from 'mongodb-memory-server';

export async function connectDB() {
  try {
    // Try connecting to the provided URI with a 2-second timeout
    await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 2000 });
    console.log("✅ MongoDB connected (Local native DB)");
  } catch (err) {
    console.warn(`⚠️ Local MongoDB (${process.env.MONGO_URI}) not found. Starting In-Memory Database...`);
    try {
      const mongoServer = await MongoMemoryServer.create();
      const memUri = mongoServer.getUri();
      await mongoose.connect(memUri);
      console.log("✅ InMemory MongoDB connected dynamically!");
    } catch (memErr) {
      console.error("❌ Failed to start In-Memory DB:", memErr.message);
    }
  }
}
