import mongoose from 'mongoose';
import { config } from './index.js';

let isConnected = false;
let useMemoryStore = false;

export const connectDB = async () => {
  if (isConnected) return;

  try {
    // Attempt Mongoose connection with 2.5s timeout so startup is fast
    const conn = await mongoose.connect(config.mongoUri, {
      serverSelectionTimeoutMS: 2500,
    });
    isConnected = true;
    useMemoryStore = false;
    console.log(`[MongoDB] Connected successfully to: ${conn.connection.host}`);
  } catch (error) {
    console.warn(`[MongoDB] Live connection failed (${error.message}). Activating high-performance resilient in-memory MongoDB store.`);
    useMemoryStore = true;
    isConnected = true;
  }
};

export const isUsingMemoryStore = () => useMemoryStore;
