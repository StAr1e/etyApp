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
    
    // Check if consecutive day (1 day difference roughly, allowing for 48h window logic)
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

// Helper to check badges
const checkBadges = (stats: any) => {
  const newBadges: string[] = [];
  
  const addBadge = (id: string, condition: boolean) => {
    if (condition && !stats.badges.includes(id)) {
      stats.badges.push(id);
      newBadges.push(id);
    }
  };

  addBadge('first_search', stats.wordsDiscovered >= 1);
  addBadge('explorer_10', stats.wordsDiscovered >= 10);
  addBadge('linguist_50', stats.wordsDiscovered >= 50);
  addBadge('deep_diver', stats.summariesGenerated >= 5);
  addBadge('social_butterfly', stats.shares >= 3);
  addBadge('daily_streak_3', stats.currentStreak >= 3);

  return newBadges;
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

      // Find or Create
      let user = await User.findOne({ userId: idStr });
      
      if (!user) {
        user = await User.create({
          userId: idStr,
          profile: { name: name || 'Explorer', photo: photo || '' },
          stats: { ...INITIAL_STATS },
          searchHistory: []
        });
      } else {
        // Update profile info if changed
        if (name) user.profile.name = name;
        if (photo) user.profile.photo = photo;
      }

      // Check Streak
      const streakXp = updateStreak(user.stats);
      if (streakXp > 0 || name || photo) {
        user.markModified('stats'); 
        await user.save();
      }

      return response.status(200).json({
        stats: user.stats,
        history: user.searchHistory || []
      });
    }

    // --- POST ACTIONS ---
    if (request.method === 'POST') {
      const { userId, action, name, photo, stats: syncedStats, payload } = request.body;
      if (!action) return response.status(400).json({ error: "Missing action" });

      // --- LEADERBOARD ACTION ---
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

      // --- STANDARD GAMIFICATION ACTIONS ---
      if (!userId) return response.status(400).json({ error: "userId required" });
      const idStr = userId.toString();

      let user = await User.findOne({ userId: idStr });
      if (!user) {
         user = new User({
           userId: idStr,
           profile: { name: name || 'Explorer', photo: photo || '' },
           stats: { ...INITIAL_STATS },
           searchHistory: []
         });
      }

      const stats = user.stats;
      const previousLevel = stats.level;

      // Apply Action XP
      const xpGain = XP_ACTIONS[action] || 0;
      stats.xp += xpGain;

      if (action === 'SEARCH') {
        stats.wordsDiscovered++;
        // Save Search History
        if (payload && payload.wordData) {
           // Remove duplicates
           if (!user.searchHistory) user.searchHistory = [];
           user.searchHistory = user.searchHistory.filter(item => 
             item.word.toLowerCase() !== payload.wordData.word.toLowerCase()
           );
           // Add new to top
           user.searchHistory.unshift({
             word: payload.wordData.word,
             timestamp: Date.now(),
             data: payload.wordData,
             summary: payload.summary || '',
             image: '' // Init empty
           });
           // Limit to 50
           if (user.searchHistory.length > 50) {
             user.searchHistory = user.searchHistory.slice(0, 50);
           }
        }
      }

      if (action === 'SUMMARY') {
        stats.summariesGenerated++;
        // Update Summary in History
        if (payload && payload.word && payload.summary) {
          if (!user.searchHistory) user.searchHistory = [];
          const idx = user.searchHistory.findIndex(h => h.word.toLowerCase() === payload.word.toLowerCase());
          if (idx !== -1) {
             user.searchHistory[idx].summary = payload.summary;
          }
        }
      }

      if (action === 'IMAGE') {
          // No XP for image loading, but we update history
          if (payload && payload.word && payload.image) {
              if (!user.searchHistory) user.searchHistory = [];
              const idx = user.searchHistory.findIndex(h => h.word.toLowerCase() === payload.word.toLowerCase());
              if (idx !== -1) {
                  user.searchHistory[idx].image = payload.image;
              }
          }
      }

      if (action === 'SHARE') stats.shares++;

      // Recalculate Level
      stats.level = 1 + Math.floor(Math.sqrt(stats.xp / 50));

      // Check Badges
      const newBadges = checkBadges(stats);
      
      stats.lastVisit = Date.now();
      
      user.markModified('stats');
      user.markModified('searchHistory'); // Explicitly mark history as modified
      await user.save();

      return response.status(200).json({
         stats,
         history: user.searchHistory,
         newBadges,
         leveledUp: stats.level > previousLevel
      });
    }

    return response.status(405).json({ error: "Method not allowed" });

  } catch (error: any) {
    console.error("Gamification API Error", error);
    return response.status(500).json({ error: "Internal Server Error" });
  }
}
