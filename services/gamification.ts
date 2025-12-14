
import type { UserStats, LevelInfo, Badge, BadgeId, LeaderboardEntry, TelegramUser } from '../types';

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

// We now rely on the DatabaseService (via API) as the source of truth.
// LocalStorage is only used for very basic offline caching to prevent UI flicker,
// but logic prioritizes server data.

export const fetchUserStats = async (user: TelegramUser): Promise<UserStats> => {
  try {
    // Pass name/photo so server can update user profile for leaderboard
    const params = new URLSearchParams({
      userId: user.id.toString(),
      name: user.first_name,
      photo: user.photo_url || ''
    });

    const response = await fetch(`/api/gamification?${params.toString()}`);
    
    if (!response.ok) throw new Error('Failed to fetch stats');
    const serverStats = await response.json();
    
    // Simple Cache for offline fallback
    localStorage.setItem(`ety_stats_${user.id}`, JSON.stringify(serverStats));
    return serverStats;
  } catch (error) {
    console.warn("Gamification API unavailable:", error);
    const local = localStorage.getItem(`ety_stats_${user.id}`);
    return local ? JSON.parse(local) : INITIAL_STATS;
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
    
    // Update local cache
    localStorage.setItem(`ety_stats_${userId}`, JSON.stringify(result.stats));
    
    const newBadgeObjects = result.newBadges.map((id: BadgeId) => BADGES[id]).filter(Boolean);
    
    return { stats: result.stats, newBadges: newBadgeObjects };
  } catch (error) {
    console.error("Gamification update failed:", error);
    // Optimistic UI update could go here, but for "Professional" data integrity, we return current known state
    const local = localStorage.getItem(`ety_stats_${userId}`);
    return { stats: local ? JSON.parse(local) : INITIAL_STATS, newBadges: [] };
  }
};

export const fetchLeaderboard = async (): Promise<LeaderboardEntry[]> => {
  try {
    const response = await fetch('/api/leaderboard');
    if (!response.ok) throw new Error('Failed to fetch leaderboard');
    return await response.json();
  } catch (error) {
    console.error(error);
    return [];
  }
};
