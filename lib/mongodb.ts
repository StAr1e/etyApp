import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  // In development/build, this might not be set. 
  // We allow the code to proceed so it doesn't crash builds, 
  // but runtime functions will need to handle the missing URI.
}

// Global cached connection for Serverless re-use
let cached = (global as any).mongoose;

if (!cached) {
  cached = (global as any).mongoose = { conn: null, promise: null };
}

export async function connectToDatabase() {
  if (!MONGODB_URI) {
    console.warn("MONGODB_URI is not defined. Features requiring database will fail or use fallback.");
    return null;
  }

  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    const opts = {
      bufferCommands: false,
    };

    cached.promise = mongoose.connect(MONGODB_URI, opts).then((mongoose) => {
      return mongoose;
    });
  }

  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    throw e;
  }

  return cached.conn;
}

// --- SCHEMA DEFINITION ---

const UserSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true, index: true }, // Store as String to prevent BigInt issues
  profile: {
    name: { type: String, default: 'Explorer' },
    photo: { type: String, default: '' }
  },
  stats: {
    xp: { type: Number, default: 0 },
    level: { type: Number, default: 1 },
    wordsDiscovered: { type: Number, default: 0 },
    summariesGenerated: { type: Number, default: 0 },
    shares: { type: Number, default: 0 },
    lastVisit: { type: Number, default: Date.now },
    currentStreak: { type: Number, default: 1 },
    badges: { type: [String], default: [] }
  }
}, { timestamps: true });

// Prevent compiling model multiple times in HMR/Serverless
export const User = mongoose.models.User || mongoose.model('User', UserSchema);
