import type { UserStats, LevelInfo, Badge, BadgeId, LeaderboardEntry, TelegramUser, SearchHistoryItem, WordData } from '../types';

// --- LEVELING LOGIC ---

export const getLevelInfo = (xp: number): LevelInfo => {
  // Formula: Level = 1 + floor(sqrt(XP / 50))
  // To reach level 100, you need approx 490,000 XP.
  const level = 1 + Math.floor(Math.sqrt(xp / 50));
  
  // Calculate boundaries
  const currentLevelBaseXP = 50 * Math.pow(level - 1, 2);
  const nextLevelBaseXP = 50 * Math.pow(level, 2);

  const titles = [
    "Novice Seeker", "Word Watcher", "Curious Mind", "Bookworm", 
    "Vocab Voyager", "Scroll Keeper", "Lexicon Legend", "Word Wizard", 
    "Etymology Elder", "Grand Sage", "Language Lord", "Keeper of Origins",
    "Omniscient", "Time Traveler", "The First Speaker"
  ];
  
  // Use the last title for levels beyond the list
  const title = titles[Math.min(Math.floor((level - 1) / 5), titles.length - 1)];

  return {
    level,
    title,
    minXP: currentLevelBaseXP,
    nextLevelXP: nextLevelBaseXP
  };
};

// --- DYNAMIC BADGE GENERATION ---

// Roman numerals for Tiers
const toRoman = (num: number) => {
  const roman = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV", "XV", "XVI", "XVII", "XVIII", "XIX", "XX"];
  return roman[num] || num.toString();
};

const TIER_COLORS = [
  'from-gray-400 to-gray-600',       // I
  'from-emerald-400 to-teal-600',    // II
  'from-blue-400 to-indigo-600',     // III
  'from-violet-400 to-purple-600',   // IV
  'from-fuchsia-400 to-pink-600',    // V
  'from-rose-400 to-red-600',        // VI
  'from-orange-400 to-amber-600',    // VII
  'from-yellow-300 to-yellow-600',   // VIII (Gold)
  'from-cyan-300 to-cyan-600',       // IX (Diamondish)
  'from-slate-700 to-black',         // X (Black)
];

const getTierColor = (tier: number) => TIER_COLORS[(tier - 1) % TIER_COLORS.length];

// Generate milestones dynamically
// 1. SCHOLAR (Words)
// 2. VISIONARY (Summaries)
// 3. AMBASSADOR (Shares)
// 4. DEVOTEE (Streak)

export const generateAllBadges = (): Badge[] => {
  const badges: Badge[] = [];

  // 1. SCHOLAR (Words Discovered)
  // 1, 10, 25, 50, 100, 250, 500, 1000...
  const wordThresholds = [1, 10, 25, 50, 100, 200, 350, 500, 750, 1000, 1500, 2000, 3000, 4000, 5000, 7500, 10000];
  wordThresholds.forEach((thresh, i) => {
    const tier = i + 1;
    badges.push({
      id: `scholar_${tier}`,
      category: 'SCHOLAR',
      tier,
      name: `Scholar ${toRoman(tier)}`,
      description: `Discover ${thresh} unique words.`,
      icon: 'BookOpen',
      color: getTierColor(tier),
      statKey: 'wordsDiscovered',
      threshold: thresh,
      xpReward: 50 * tier // Increasing rewards
    });
  });

  // 2. VISIONARY (Summaries)
  // 1, 5, 10, 25, 50, 100...
  const summaryThresholds = [1, 5, 10, 25, 50, 75, 100, 150, 200, 300, 400, 500, 750, 1000];
  summaryThresholds.forEach((thresh, i) => {
    const tier = i + 1;
    badges.push({
      id: `visionary_${tier}`,
      category: 'VISIONARY',
      tier,
      name: `Visionary ${toRoman(tier)}`,
      description: `Generate ${thresh} AI deep dives.`,
      icon: 'Anchor',
      color: getTierColor(tier),
      statKey: 'summariesGenerated',
      threshold: thresh,
      xpReward: 75 * tier
    });
  });

  // 3. AMBASSADOR (Shares)
  // 1, 3, 5, 10, 20, 50...
  const shareThresholds = [1, 3, 5, 10, 20, 35, 50, 75, 100, 150, 200, 300, 500];
  shareThresholds.forEach((thresh, i) => {
    const tier = i + 1;
    badges.push({
      id: `ambassador_${tier}`,
      category: 'AMBASSADOR',
      tier,
      name: `Ambassador ${toRoman(tier)}`,
      description: `Share word cards ${thresh} times.`,
      icon: 'Share2',
      color: getTierColor(tier),
      statKey: 'shares',
      threshold: thresh,
      xpReward: 100 * tier
    });
  });

  // 4. DEVOTEE (Streak)
  // 3, 7, 14, 30, 60, 90, 180, 365...
  const streakThresholds = [3, 7, 14, 21, 30, 45, 60, 90, 120, 180, 250, 365];
  streakThresholds.forEach((thresh, i) => {
    const tier = i + 1;
    badges.push({
      id: `devotee_${tier}`,
      category: 'DEVOTEE',
      tier,
      name: `Devotee ${toRoman(tier)}`,
      description: `Maintain a ${thresh}-day visit streak.`,
      icon: 'Flame',
      color: getTierColor(tier),
      statKey: 'currentStreak',
      threshold: thresh,
      xpReward: 150 * tier
    });
  });

  return badges;
};

// Create a lookup map for fast access
const ALL_BADGES = generateAllBadges();
export const BADGE_MAP = ALL_BADGES.reduce((acc, b) => {
  acc[b.id] = b;
  return acc;
}, {} as Record<BadgeId, Badge>);

// Helper: Get user's current progress for a specific category (e.g., What is next Scholar badge?)
export const getNextBadgeForCategory = (category: string, earnedBadgeIds: BadgeId[]): Badge | null => {
  const categoryBadges = ALL_BADGES.filter(b => b.category === category);
  // Find the first one NOT in earnedBadgeIds
  return categoryBadges.find(b => !earnedBadgeIds.includes(b.id)) || null;
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
    const params = new URLSearchParams({
      userId: user.id.toString(),
      name: user.first_name,
      photo: user.photo_url || ''
    });

    const response = await fetch(`/api/gamification?${params.toString()}`);
    
    if (!response.ok) throw new Error('Failed to fetch stats');
    const result = await response.json();
    
    const serverStats = result.stats || INITIAL_STATS;
    const serverHistory = result.history || [];

    localStorage.setItem(`ety_stats_${user.id}`, JSON.stringify(serverStats));
    
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
  payload?: { wordData?: WordData, word?: string, summary?: string, image?: string }
): Promise<{ stats: UserStats, newBadges: Badge[], history?: SearchHistoryItem[] }> => {
  try {
    const response = await fetch('/api/gamification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, action, payload })
    });
    
    if (!response.ok) throw new Error('Failed to update stats');
    
    const result = await response.json();
    
    localStorage.setItem(`ety_stats_${userId}`, JSON.stringify(result.stats));
    
    // Map string IDs back to full Badge objects
    const newBadgeObjects = result.newBadges.map((id: BadgeId) => BADGE_MAP[id]).filter(Boolean);
    
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