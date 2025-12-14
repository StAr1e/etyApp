
// This handler simulates a database connection for Vercel Serverless environment.
// In a real scenario, this would connect to MongoDB/Postgres.

const XP_ACTIONS = {
  SEARCH: 15,
  SUMMARY: 30,
  SHARE: 50,
  DAILY_VISIT: 100
};

// In-Memory Fallback for Serverless (Note: This resets on cold start)
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
    // LEADERBOARD ENDPOINT
    if (request.url?.includes('leaderboard')) {
       // Convert map to array for leaderboard
       const users = Array.from(memDb.values());
       
       // Sort and format
       const leaderboard = users
        .sort((a, b) => b.stats.xp - a.stats.xp)
        .slice(0, 50)
        .map((u, index) => ({
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

    if (request.method === 'GET') {
      const { userId, name, photo } = request.query;
      if (!userId) return response.status(400).json({ error: "userId required" });
      
      let userData = memDb.get(userId.toString());
      
      if (!userData) {
          userData = { 
            userId,
            profile: { name: name || 'Explorer', photo: photo || '' },
            stats: { ...INITIAL_STATS } 
          };
      } else {
          // Update profile if provided
          if (name) userData.profile.name = name;
          if (photo) userData.profile.photo = photo;
      }
      
      let stats = userData.stats;

      // Daily Streak Logic
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
      }

      memDb.set(userId.toString(), userData);
      return response.status(200).json(stats);
    }

    if (request.method === 'POST') {
      const { userId, action } = request.body;
      if (!userId || !action) return response.status(400).json({ error: "Missing data" });

      let userData = memDb.get(userId.toString());
      if (!userData) {
          // If action happens before GET (rare), init default
          userData = { userId, profile: { name: 'Unknown', photo: '' }, stats: { ...INITIAL_STATS } };
      }

      let stats = userData.stats;
      const newBadges: string[] = [];
      const previousLevel = stats.level;

      // Logic
      // @ts-ignore
      const xpGain = XP_ACTIONS[action] || 0;
      stats.xp += xpGain;

      if (action === 'SEARCH') stats.wordsDiscovered++;
      if (action === 'SUMMARY') stats.summariesGenerated++;
      if (action === 'SHARE') stats.shares++;

      stats.level = 1 + Math.floor(Math.sqrt(stats.xp / 50));

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
      
      stats.lastVisit = Date.now();
      memDb.set(userId.toString(), userData);

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
