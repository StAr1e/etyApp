import type { UserStats, LevelInfo, Badge, BadgeId } from '../types';

// --- SHARED DEFINITIONS (Used by UI for rendering) ---

export const getLevelInfo = (xp: number): LevelInfo => {
  // Simple formula: Level = 1 + floor(sqrt(XP / 50))
  const level = 1 + Math.floor(Math.sqrt(xp / 50));
  
  // Calculate boundaries
  const currentLevelBaseXP = 50 * Math.pow(level - 1, 2);
  const nextLevelBaseXP = 50 * Math.pow(level, 2);

  const titles = [
    "Novice Seeker", "Word Watcher", "Curious Mind", "Bookworm", 
    "Vocab Voyager", "Scroll Keeper", "Lexicon Legend", "Word Wizard", 
    "Etymology Elder", "Grand Sage"
  ];
  
  const title = titles[Math.min(level - 1, titles.length - 1)];

  return {
    level,
    title,
    minXP: currentLevelBaseXP,
    nextLevelXP: nextLevelBaseXP
  };
};

export const BADGES: Record<BadgeId, Badge> = {
  first_search: {
    id: 'first_search',
    name: 'First Discovery',
    description: 'Searched for your first word.',
    icon: 'Search',
    color: 'text-blue-500 bg-blue-100'
  },
  explorer_10: {
    id: 'explorer_10',
    name: 'Explorer',
    description: 'Discovered 10 unique words.',
    icon: 'Map',
    color: 'text-green-500 bg-green-100'
  },
  linguist_50: {
    id: 'linguist_50',
    name: 'Linguist',
    description: 'A true lover of words. 50 discoveries.',
    icon: 'BookOpen',
    color: 'text-purple-500 bg-purple-100'
  },
  deep_diver: {
    id: 'deep_diver',
    name: 'Deep Diver',
    description: 'Generated 5 AI deep dive summaries.',
    icon: 'Anchor',
    color: 'text-cyan-500 bg-cyan-100'
  },
  social_butterfly: {
    id: 'social_butterfly',
    name: 'Town Crier',
    description: 'Shared knowledge with others 3 times.',
    icon: 'Share2',
    color: 'text-pink-500 bg-pink-100'
  },
  daily_streak_3: {
    id: 'daily_streak_3',
    name: 'Consistent',
    description: 'Used the app for 3 days in a row.',
    icon: 'Flame',
    color: 'text-orange-500 bg-orange-100'
  }
};

export const INITIAL_STATS: UserStats = {
  xp: 0,
  level: 1,
  wordsDiscovered: 0,
  summariesGenerated: 0,
  shares: 0,
  lastVisit: Date.now(),
  currentStreak: 1,
  badges: []
};

// --- API CLIENT ---

// Helper to push local stats to server (Backup/Restore)
const syncStatsToServer = async (userId: number, stats: UserStats) => {
  try {
    await fetch('/api/gamification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, action: 'SYNC', stats })
    });
    console.log("Stats synced to server");
  } catch (e) {
    console.error("Failed to sync stats", e);
  }
};

export const fetchUserStats = async (userId: number): Promise<UserStats> => {
  const localKey = `ety_stats_${userId}`;
  const localStr = localStorage.getItem(localKey);
  const localStats: UserStats | null = localStr ? JSON.parse(localStr) : null;

  try {
    const response = await fetch(`/api/gamification?userId=${userId}`);
    if (!response.ok) throw new Error('Failed to fetch stats');
    const serverStats = await response.json();
    
    // SMART RECOVERY LOGIC:
    // If the server (likely Vercel Serverless) has reset and returned 0/Low XP,
    // but our localStorage has higher XP, TRUST THE LOCAL STORAGE and restore the server.
    if (localStats && localStats.xp > serverStats.xp) {
        console.log("⚠️ Server state lost (Cold Start). Restoring from device...");
        // Restore server state in background
        syncStatsToServer(userId, localStats);
        return localStats;
    }

    // Normal Case: Server is authority. Update local cache.
    localStorage.setItem(localKey, JSON.stringify(serverStats));
    return serverStats;
  } catch (error) {
    console.warn("Gamification API unavailable, using offline defaults:", error);
    // Fallback to localStorage if API fails (offline mode)
    return localStats || INITIAL_STATS;
  }
};

export const trackAction = async (
  userId: number, 
  action: 'SEARCH' | 'SUMMARY' | 'SHARE'
): Promise<{ stats: UserStats, newBadges: Badge[] }> => {
  try {
    const response = await fetch('/api/gamification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, action })
    });
    
    if (!response.ok) throw new Error('Failed to update stats');
    
    const result = await response.json();
    
    // Cache latest stats locally for offline support
    localStorage.setItem(`ety_stats_${userId}`, JSON.stringify(result.stats));
    
    // Map badge IDs back to Badge objects for the UI
    const newBadgeObjects = result.newBadges.map((id: BadgeId) => BADGES[id]).filter(Boolean);
    
    return { stats: result.stats, newBadges: newBadgeObjects };
  } catch (error) {
    console.error("Gamification update failed:", error);
    // Return existing local stats on failure so UI doesn't break
    const saved = localStorage.getItem(`ety_stats_${userId}`);
    return { stats: saved ? JSON.parse(saved) : INITIAL_STATS, newBadges: [] };
  }
};