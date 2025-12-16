import type { UserStats, LevelInfo, Badge, BadgeId, LeaderboardEntry, TelegramUser, SearchHistoryItem, WordData } from '../types';

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
    color: 'from-blue-400 to-blue-600',
    statKey: 'wordsDiscovered',
    threshold: 1
  },
  explorer_10: {
    id: 'explorer_10',
    name: 'Explorer',
    description: 'Discovered 10 unique words.',
    icon: 'Map',
    color: 'from-emerald-400 to-teal-600',
    statKey: 'wordsDiscovered',
    threshold: 10
  },
  linguist_50: {
    id: 'linguist_50',
    name: 'Linguist',
    description: 'A true lover of words. 50 discoveries.',
    icon: 'BookOpen',
    color: 'from-violet-400 to-purple-600',
    statKey: 'wordsDiscovered',
    threshold: 50
  },
  deep_diver: {
    id: 'deep_diver',
    name: 'Deep Diver',
    description: 'Generated 5 AI deep dive summaries.',
    icon: 'Anchor',
    color: 'from-cyan-400 to-blue-500',
    statKey: 'summariesGenerated',
    threshold: 5
  },
  social_butterfly: {
    id: 'social_butterfly',
    name: 'Town Crier',
    description: 'Shared knowledge with others 3 times.',
    icon: 'Share2',
    color: 'from-pink-400 to-rose-600',
    statKey: 'shares',
    threshold: 3
  },
  daily_streak_3: {
    id: 'daily_streak_3',
    name: 'Consistent',
    description: 'Used the app for 3 days in a row.',
    icon: 'Flame',
    color: 'from-amber-400 to-orange-600',
    statKey: 'currentStreak',
    threshold: 3
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

export const fetchUserStats = async (user: TelegramUser): Promise<{ stats: UserStats, history: SearchHistoryItem[] }> => {
  try {
    // Pass name/photo so server can update user profile for leaderboard
    const params = new URLSearchParams({
      userId: user.id.toString(),
      name: user.first_name,
      photo: user.photo_url || ''
    });

    const response = await fetch(`/api/gamification?${params.toString()}`);
    
    if (!response.ok) throw new Error('Failed to fetch stats');
    const result = await response.json();
    
    // Result contains { stats, history }
    const serverStats = result.stats || INITIAL_STATS;
    const serverHistory = result.history || [];

    // Simple Cache for offline fallback
    localStorage.setItem(`ety_stats_${user.id}`, JSON.stringify(serverStats));
    // We don't necessarily overwrite local history entirely, merging happens in App usually,
    // but for now let's assume server is source of truth for stats
    
    return { stats: serverStats, history: serverHistory };
  } catch (error) {
    console.warn("Gamification API unavailable:", error);
    const localStats = localStorage.getItem(`ety_stats_${user.id}`);
    const localHistory = localStorage.getItem('ety_history');
    
    return { 
      stats: localStats ? JSON.parse(localStats) : INITIAL_STATS, 
      history: localHistory ? JSON.parse(localHistory) : []
    };
  }
};

export const trackAction = async (
  userId: number, 
  action: 'SEARCH' | 'SUMMARY' | 'SHARE',
  payload?: { wordData?: WordData, word?: string, summary?: string }
): Promise<{ stats: UserStats, newBadges: Badge[], history?: SearchHistoryItem[] }> => {
  try {
    const response = await fetch('/api/gamification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, action, payload })
    });
    
    if (!response.ok) throw new Error('Failed to update stats');
    
    const result = await response.json();
    
    // Update local cache
    localStorage.setItem(`ety_stats_${userId}`, JSON.stringify(result.stats));
    
    const newBadgeObjects = result.newBadges.map((id: BadgeId) => BADGES[id]).filter(Boolean);
    
    return { stats: result.stats, newBadges: newBadgeObjects, history: result.history };
  } catch (error) {
    console.error("Gamification update failed:", error);
    const local = localStorage.getItem(`ety_stats_${userId}`);
    return { stats: local ? JSON.parse(local) : INITIAL_STATS, newBadges: [] };
  }
};

export const fetchLeaderboard = async (user: TelegramUser | null, stats: UserStats): Promise<LeaderboardEntry[]> => {
  try {
    const body: any = {
      action: 'LEADERBOARD',
      ...(user && {
        userId: user.id,
        name: user.first_name,
        photo: user.photo_url || '',
        stats: stats
      })
    };

    const response = await fetch('/api/gamification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!response.ok) throw new Error('Failed to fetch leaderboard');
    return await response.json();
  } catch (error) {
    console.error(error);
    return [];
  }
};