import { connectToDatabase, User } from '../lib/mongodb.js';

// --- CONSTANTS ---
const XP_ACTIONS: Record<string, number> = {
  SEARCH: 15,
  SUMMARY: 30,
  SHARE: 50,
  DAILY_VISIT: 100
};

const INITIAL_STATS = {
  xp: 0,
  level: 1,
  wordsDiscovered: 0,
  summariesGenerated: 0,
  shares: 0,
  lastVisit: Date.now(),
  currentStreak: 1,
  badges: []
};

// --- DYNAMIC THRESHOLD CONFIG (Must match Client) ---
// We duplicate this here to avoid complex build steps sharing code between API (Node) and UI (React)
const THRESHOLDS = {
  SCHOLAR: [1, 10, 25, 50, 100, 200, 350, 500, 750, 1000, 1500, 2000, 3000, 4000, 5000, 7500, 10000],
  VISIONARY: [1, 5, 10, 25, 50, 75, 100, 150, 200, 300, 400, 500, 750, 1000],
  AMBASSADOR: [1, 3, 5, 10, 20, 35, 50, 75, 100, 150, 200, 300, 500],
  DEVOTEE: [3, 7, 14, 21, 30, 45, 60, 90, 120, 180, 250, 365]
};

// Helper to calculate streak
const updateStreak = (stats: any) => {
  const last = new Date(stats.lastVisit);
  const now = new Date();
  const isSameDay = last.getDate() === now.getDate() && 
                    last.getMonth() === now.getMonth() && 
                    last.getFullYear() === now.getFullYear();

  let xpGained = 0;

  if (!isSameDay) {
    const diffTime = Math.abs(now.getTime() - last.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
    
    // Check if consecutive day
    if (diffDays <= 2) {
      stats.currentStreak = (stats.currentStreak || 0) + 1;
      stats.xp = (stats.xp || 0) + XP_ACTIONS.DAILY_VISIT;
      xpGained = XP_ACTIONS.DAILY_VISIT;
    } else {
      stats.currentStreak = 1;
    }
    stats.lastVisit = Date.now();
  }
  return xpGained;
};

// Helper to check badges dynamically based on tiers
const checkBadges = (stats: any) => {
  const newBadges: string[] = [];
  let bonusXP = 0;
  
  const addBadge = (id: string, tier: number, baseReward: number) => {
    if (!stats.badges.includes(id)) {
      stats.badges.push(id);
      newBadges.push(id);
      bonusXP += (baseReward * tier); // Award bonus XP!
    }
  };

  // 1. SCHOLAR (Words)
  THRESHOLDS.SCHOLAR.forEach((thresh, i) => {
    if (stats.wordsDiscovered >= thresh) addBadge(`scholar_${i+1}`, i+1, 50);
  });

  // 2. VISIONARY (Summaries)
  THRESHOLDS.VISIONARY.forEach((thresh, i) => {
    if (stats.summariesGenerated >= thresh) addBadge(`visionary_${i+1}`, i+1, 75);
  });

  // 3. AMBASSADOR (Shares)
  THRESHOLDS.AMBASSADOR.forEach((thresh, i) => {
    if (stats.shares >= thresh) addBadge(`ambassador_${i+1}`, i+1, 100);
  });

  // 4. DEVOTEE (Streak)
  THRESHOLDS.DEVOTEE.forEach((thresh, i) => {
    if (stats.currentStreak >= thresh) addBadge(`devotee_${i+1}`, i+1, 150);
  });

  return { newBadges, bonusXP };
};

// Retry wrapper
const executeWithRetry = async (operation: () => Promise<any>, retries = 5, initialDelay = 50) => {
  let lastError;
  for (let i = 0; i < retries; i++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;
      if (error.name === 'VersionError' || error.code === 11000) {
        const jitter = Math.random() * 50;
        const delay = (initialDelay * Math.pow(2, i)) + jitter;
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
  throw lastError;
};

export default async function handler(request: any, response: any) {
  try {
    const db = await connectToDatabase();
    
    if (!db) {
       return response.status(503).json({ error: "Database not configured (MONGODB_URI missing)" });
    }

    // --- GET STATS ---
    if (request.method === 'GET') {
      const { userId, name, photo } = request.query;
      if (!userId) return response.status(400).json({ error: "userId required" });
      
      const idStr = userId.toString();

      try {
        const data = await executeWithRetry(async () => {
          let user = await User.findOne({ userId: idStr });
          
          if (!user) {
            user = await User.create({
              userId: idStr,
              profile: { name: name || 'Explorer', photo: photo || '' },
              stats: { ...INITIAL_STATS },
              searchHistory: []
            });
          } else {
            if (name) user.profile.name = name;
            if (photo) user.profile.photo = photo;
          }

          const streakXp = updateStreak(user.stats);
          
          // Check for any missing badges from past activities (migration/catch-up)
          const { newBadges, bonusXP } = checkBadges(user.stats);
          
          if (streakXp > 0 || bonusXP > 0 || newBadges.length > 0 || name || photo) {
            user.stats.xp += bonusXP;
            // Update Level
            user.stats.level = 1 + Math.floor(Math.sqrt(user.stats.xp / 50));
            user.markModified('stats'); 
            await user.save();
          }

          return {
            stats: user.stats,
            history: user.searchHistory || []
          };
        });

        return response.status(200).json(data);
      } catch (e: any) {
        console.error("GET Stats Error:", e);
        return response.status(500).json({ error: "Failed to fetch stats" });
      }
    }

    // --- POST ACTIONS ---
    if (request.method === 'POST') {
      const { userId, action, name, photo, stats: syncedStats, payload } = request.body;
      if (!action) return response.status(400).json({ error: "Missing action" });

      if (action === 'LEADERBOARD') {
        if (userId) {
          const idStr = userId.toString();
          await User.findOneAndUpdate(
            { userId: idStr },
            { 
              $set: { 
                 'profile.name': name || 'Explorer', 
                 'profile.photo': photo || '' 
              },
              ...(syncedStats ? { 
                 $max: { 'stats.xp': syncedStats.xp } 
              } : {})
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
          );
        }

        const topUsers = await User.find({})
          .sort({ 'stats.xp': -1 })
          .limit(50)
          .select('userId profile stats');

        const leaderboard = topUsers.map((u: any, index: number) => ({
          userId: u.userId,
          name: u.profile.name,
          photoUrl: u.profile.photo,
          xp: u.stats.xp,
          level: u.stats.level,
          rank: index + 1,
          badges: u.stats.badges.length
        }));

        return response.status(200).json(leaderboard);
      }

      if (!userId) return response.status(400).json({ error: "userId required" });
      const idStr = userId.toString();

      try {
        const result = await executeWithRetry(async () => {
          let user = await User.findOne({ userId: idStr });
          if (!user) {
             user = new User({
               userId: idStr,
               profile: { name: name || 'Explorer', photo: photo || '' },
               stats: { ...INITIAL_STATS },
               searchHistory: []
             });
             await user.save();
          }

          const stats = user.stats;
          const previousLevel = stats.level;

          // Apply Action XP
          if (action !== 'IMAGE') {
             stats.xp += (XP_ACTIONS[action] || 0);
          }

          if (action === 'SEARCH') {
            stats.wordsDiscovered++;
            if (payload && payload.wordData) {
               if (!user.searchHistory) user.searchHistory = [];
               const existing = user.searchHistory.filter(item => 
                 item.word.toLowerCase() !== payload.wordData.word.toLowerCase()
               );
               user.searchHistory = [{
                 word: payload.wordData.word,
                 timestamp: Date.now(),
                 data: payload.wordData,
                 summary: payload.summary || '',
                 image: '' 
               }, ...existing];
               if (user.searchHistory.length > 50) {
                 user.searchHistory = user.searchHistory.slice(0, 50);
               }
            }
          }

          if (action === 'SUMMARY') {
            stats.summariesGenerated++;
            if (payload && payload.word && payload.summary) {
              if (!user.searchHistory) user.searchHistory = [];
              const idx = user.searchHistory.findIndex(h => h.word.toLowerCase() === payload.word.toLowerCase());
              if (idx !== -1) {
                 user.searchHistory[idx].summary = payload.summary;
              }
            }
          }

          if (action === 'IMAGE' && payload && payload.word && payload.image) {
              if (!user.searchHistory) user.searchHistory = [];
              const idx = user.searchHistory.findIndex(h => h.word.toLowerCase() === payload.word.toLowerCase());
              if (idx !== -1) {
                  user.searchHistory[idx].image = payload.image;
              }
          }

          if (action === 'SHARE') stats.shares++;

          // Check Badges & Add Bonus XP
          const { newBadges, bonusXP } = checkBadges(stats);
          stats.xp += bonusXP;

          // Recalculate Level
          stats.level = 1 + Math.floor(Math.sqrt(stats.xp / 50));
          
          stats.lastVisit = Date.now();
          
          user.markModified('stats');
          user.markModified('searchHistory');
          
          await user.save();

          return {
             stats,
             history: user.searchHistory,
             newBadges,
             leveledUp: stats.level > previousLevel
          };
        });

        return response.status(200).json(result);

      } catch (e: any) {
        console.error("POST Gamification Error:", e);
        return response.status(500).json({ error: "Failed to update stats" });
      }
    }

    return response.status(405).json({ error: "Method not allowed" });

  } catch (error: any) {
    console.error("Gamification API Global Error", error);
    return response.status(500).json({ error: "Internal Server Error" });
  }
}