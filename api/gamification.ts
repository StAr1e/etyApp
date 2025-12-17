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

// --- DYNAMIC THRESHOLD CONFIG ---
const THRESHOLDS = {
  SCHOLAR: [1, 10, 25, 50, 100, 200, 350, 500, 750, 1000, 1500, 2000, 3000, 4000, 5000, 7500, 10000],
  VISIONARY: [1, 5, 10, 25, 50, 75, 100, 150, 200, 300, 400, 500, 750, 1000],
  AMBASSADOR: [1, 3, 5, 10, 20, 35, 50, 75, 100, 150, 200, 300, 500],
  DEVOTEE: [3, 7, 14, 21, 30, 45, 60, 90, 120, 180, 250, 365]
};

// --- LOGIC HELPERS ---

// Check if badges need to be awarded based on current stats
const getNewBadges = (stats: any) => {
  const newBadges: string[] = [];
  let bonusXP = 0;
  
  const check = (id: string, tier: number, reward: number, condition: boolean) => {
    if (condition && !stats.badges.includes(id)) {
      newBadges.push(id);
      bonusXP += (reward * tier);
    }
  };

  THRESHOLDS.SCHOLAR.forEach((t, i) => check(`scholar_${i+1}`, i+1, 50, stats.wordsDiscovered >= t));
  THRESHOLDS.VISIONARY.forEach((t, i) => check(`visionary_${i+1}`, i+1, 75, stats.summariesGenerated >= t));
  THRESHOLDS.AMBASSADOR.forEach((t, i) => check(`ambassador_${i+1}`, i+1, 100, stats.shares >= t));
  THRESHOLDS.DEVOTEE.forEach((t, i) => check(`devotee_${i+1}`, i+1, 150, stats.currentStreak >= t));

  return { newBadges, bonusXP };
};

// Calculate Level from XP
const calculateLevel = (xp: number) => 1 + Math.floor(Math.sqrt(xp / 50));

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

      // 1. Fetch User (Create if missing)
      // We explicitly type user as 'any' to avoid TS conflicts between Model return types and re-assignments
      let user: any = await User.findOne({ userId: idStr });
      
      if (!user) {
         user = await User.create({
            userId: idStr,
            profile: { name: name || 'Explorer', photo: photo || '' },
            stats: { ...INITIAL_STATS },
            searchHistory: []
         });
      }

      // 2. Check Streak (Atomic Update if needed)
      const last = new Date(user.stats.lastVisit);
      const now = new Date();
      const isSameDay = last.getDate() === now.getDate() && 
                        last.getMonth() === now.getMonth() && 
                        last.getFullYear() === now.getFullYear();

      if (!isSameDay) {
        const diffTime = Math.abs(now.getTime() - last.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        let streakUpdate: any = {};
        if (diffDays <= 2) {
           streakUpdate = { 
             $inc: { 'stats.currentStreak': 1, 'stats.xp': XP_ACTIONS.DAILY_VISIT },
             $set: { 'stats.lastVisit': Date.now() }
           };
        } else {
           streakUpdate = {
             $set: { 'stats.currentStreak': 1, 'stats.lastVisit': Date.now() }
           };
        }
        
        // Apply atomic streak update
        // user is definitely defined here because we just created/fetched it.
        const updated = await User.findOneAndUpdate(
            { userId: idStr },
            streakUpdate,
            { new: true }
        );
        if (updated) user = updated;
      }
      
      // 3. Post-Check Badges (in case of streak update or migration)
      const { newBadges, bonusXP } = getNewBadges(user.stats);
      if (newBadges.length > 0 || bonusXP > 0) {
          const updates: any = { 
            $addToSet: { 'stats.badges': { $each: newBadges } },
            $inc: { 'stats.xp': bonusXP }
          };
          // Apply badges
          const updated = await User.findOneAndUpdate({ userId: idStr }, updates, { new: true });
          if (updated) user = updated;
          
          // Re-check Level after bonus XP
          const correctLevel = calculateLevel(user.stats.xp);
          if (user.stats.level !== correctLevel) {
              const leveledUp = await User.findOneAndUpdate(
                  { userId: idStr }, 
                  { $set: { 'stats.level': correctLevel } }, 
                  { new: true }
              );
              if (leveledUp) user = leveledUp;
          }
      }

      return response.status(200).json({ stats: user.stats, history: user.searchHistory || [] });
    }

    // --- POST ACTIONS ---
    if (request.method === 'POST') {
      const { userId, action, name, photo, stats: syncedStats, payload } = request.body;
      if (!action) return response.status(400).json({ error: "Missing action" });

      // LEADERBOARD LOGIC
      if (action === 'LEADERBOARD') {
        if (userId) {
          await User.findOneAndUpdate(
            { userId: userId.toString() },
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
          
        return response.status(200).json(topUsers.map((u: any, index: number) => ({
          userId: u.userId,
          name: u.profile.name,
          photoUrl: u.profile.photo,
          xp: u.stats.xp,
          level: u.stats.level,
          rank: index + 1,
          badges: u.stats.badges.length
        })));
      }

      if (!userId) return response.status(400).json({ error: "userId required" });
      const idStr = userId.toString();

      // --- PHASE 1: ATOMIC ACTION UPDATE ---
      const now = Date.now();
      let update: any = { 
          $set: { 'stats.lastVisit': now },
          $setOnInsert: { 
              'profile.name': name || 'Explorer', 
              'profile.photo': photo || '',
              'stats.level': 1,
              'stats.badges': []
          }
      };

      if (action === 'SEARCH') {
          update.$inc = { 'stats.xp': XP_ACTIONS.SEARCH, 'stats.wordsDiscovered': 1 };
          if (payload?.wordData) {
              const item = {
                  word: payload.wordData.word,
                  timestamp: now,
                  data: payload.wordData,
                  summary: payload.summary || '',
                  image: ''
              };
              update.$push = {
                  searchHistory: {
                      $each: [item],
                      $position: 0,
                      $slice: 50
                  }
              };
          }
      } else if (action === 'SHARE') {
          update.$inc = { 'stats.xp': XP_ACTIONS.SHARE, 'stats.shares': 1 };
      } else if (action === 'SUMMARY') {
           update.$inc = { 'stats.xp': XP_ACTIONS.SUMMARY, 'stats.summariesGenerated': 1 };
      }

      // Execute Phase 1
      let user: any = await User.findOneAndUpdate(
          { userId: idStr },
          update,
          { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      // Handle specific History updates for SUMMARY/IMAGE
      if ((action === 'SUMMARY' || action === 'IMAGE') && payload?.word) {
          const historyField = action === 'SUMMARY' ? 'searchHistory.$.summary' : 'searchHistory.$.image';
          const value = action === 'SUMMARY' ? payload.summary : payload.image;
          
          if (value) {
              const historyUpdate = await User.findOneAndUpdate(
                  { userId: idStr, 'searchHistory.word': payload.word },
                  { $set: { [historyField]: value } },
                  { new: true }
              );
              if (historyUpdate) user = historyUpdate;
          }
      }

      // --- PHASE 2: BADGES & LEVEL CHECK ---
      const previousLevel = user.stats.level;
      const { newBadges, bonusXP } = getNewBadges(user.stats);
      
      let phase2Update: any = {};
      let needsPhase2 = false;

      if (bonusXP > 0) {
          phase2Update.$inc = { 'stats.xp': bonusXP };
          needsPhase2 = true;
      }
      
      if (newBadges.length > 0) {
          phase2Update.$addToSet = { 'stats.badges': { $each: newBadges } };
          needsPhase2 = true;
      }

      const projectedXP = user.stats.xp + bonusXP;
      const correctLevel = calculateLevel(projectedXP);
      
      if (correctLevel > user.stats.level) {
          if (!phase2Update.$set) phase2Update.$set = {};
          phase2Update.$set['stats.level'] = correctLevel;
          needsPhase2 = true;
      }

      if (needsPhase2) {
          const updated = await User.findOneAndUpdate(
              { userId: idStr },
              phase2Update,
              { new: true }
          );
          if (updated) user = updated;
      }

      return response.status(200).json({ 
          stats: user.stats, 
          history: user.searchHistory || [],
          newBadges,
          leveledUp: user.stats.level > previousLevel
      });
    }

    return response.status(405).json({ error: "Method not allowed" });

  } catch (error: any) {
    console.error("Gamification API Global Error", error);
    return response.status(500).json({ error: "Internal Server Error" });
  }
}