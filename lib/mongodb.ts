import mongoose, { Model } from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI;

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
      console.log("MongoDB connected via Mongoose");
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

export interface IUser {
  userId: string;
  profile: {
    name: string;
    photo: string;
  };
  stats: {
    xp: number;
    level: number;
    wordsDiscovered: number;
    summariesGenerated: number;
    shares: number;
    lastVisit: number;
    currentStreak: number;
    badges: string[];
  };
}

const UserSchema = new mongoose.Schema<IUser>({
  userId: { type: String, required: true, unique: true, index: true }, 
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
}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Prevent compiling model multiple times in HMR/Serverless
export const User = (mongoose.models.User || mongoose.model<IUser>('User', UserSchema)) as Model<IUser>;