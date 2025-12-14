// This handler simulates a database connection for Vercel Serverless environment.
// IMPORTANT: We inline types here because importing from '../types' outside the api directory
// can cause build failures in some serverless configurations.

const XP_ACTIONS = {
  SEARCH: 15,
  SUMMARY: 30,
  SHARE: 50,
  DAILY_VISIT: 100
};

// --- LOGIC (Shared with Client for consistency, but enforced here) ---

const calculateLevel = (xp: number) => {
  return 1 + Math.floor(Math.sqrt(xp / 50));
};

const checkBadges = (stats: any, newBadges: string[]) => {
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
};

// In-Memory Fallback for Serverless (Note: This resets on cold start)
// The server.js implementation handles persistence for the Node server.
const memDb = new Map<string, any>();

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

export default async function handler(request: any, response: any) {
  try {
    if (request.method === 'GET') {
      const { userId } = request.query;
      if (!userId) return response.status(400).json({ error: "userId required" });
      
      let stats = memDb.get(userId.toString()) || { ...INITIAL_STATS };
      
      // Daily Streak Logic check on GET
      const last = new Date(stats.lastVisit);
      const now = new Date();
      const isSameDay = last.getDate() === now.getDate() && last.getMonth() === now.getMonth() && last.getFullYear() === now.getFullYear();
      
      if (!isSameDay) {
          const diffTime = Math.abs(now.getTime() - last.getTime());
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
          if (diffDays <= 2) {
             stats.currentStreak += 1;
             stats.xp += XP_ACTIONS.DAILY_VISIT;
          } else {
             stats.currentStreak = 1;
          }
          stats.lastVisit = Date.now();
          memDb.set(userId.toString(), stats);
      }

      return response.status(200).json(stats);
    }

    if (request.method === 'POST') {
      const { userId, action } = request.body;
      if (!userId || !action) return response.status(400).json({ error: "Missing data" });

      let stats = memDb.get(userId.toString()) || { ...INITIAL_STATS };
      const newBadges: string[] = [];
      const previousLevel = stats.level;

      // 1. Award XP
      // @ts-ignore
      const xpGain = XP_ACTIONS[action] || 0;
      stats.xp += xpGain;

      // 2. Increment Counters
      if (action === 'SEARCH') stats.wordsDiscovered++;
      if (action === 'SUMMARY') stats.summariesGenerated++;
      if (action === 'SHARE') stats.shares++;

      // 3. Recalculate Level
      stats.level = calculateLevel(stats.xp);

      // 4. Check Badges
      checkBadges(stats, newBadges);
      
      // Update DB
      stats.lastVisit = Date.now();
      memDb.set(userId.toString(), stats);

      return response.status(200).json({
         stats,
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