

export interface RootOrigin {
  term: string;
  language: string;
  meaning: string;
}

export interface WordData {
  word: string;
  phonetic: string;
  partOfSpeech: string;
  definition: string;
  etymology: string;
  roots: RootOrigin[];
  examples: string[];
  synonyms: string[];
  funFact: string;
}

export interface SearchHistoryItem {
  word: string;
  timestamp: number;
  data?: WordData; // Persisted full data
  summary?: string; // Persisted AI summary
  image?: string; // Persisted Generated Image (Base64)
}

// --- Gamification Types ---

export type BadgeId = 'first_search' | 'explorer_10' | 'linguist_50' | 'deep_diver' | 'social_butterfly' | 'daily_streak_3';

export interface Badge {
  id: BadgeId;
  name: string;
  description: string;
  icon: string;
  color: string;
  statKey?: keyof UserStats;
  threshold?: number;
  unlockedAt?: number;
}

export interface UserStats {
  xp: number;
  level: number;
  wordsDiscovered: number;
  summariesGenerated: number;
  shares: number;
  lastVisit: number;
  currentStreak: number;
  badges: BadgeId[];
  rank?: number; // Global ranking
}

export interface LeaderboardEntry {
  userId: number;
  name: string;
  photoUrl?: string;
  xp: number;
  level: number;
  rank: number;
  badges: number;
}

export interface LevelInfo {
  level: number;
  title: string;
  minXP: number;
  nextLevelXP: number;
}

// --- Telegram Types ---

export interface TelegramBackButton {
  isVisible: boolean;
  onClick: (callback: () => void) => void;
  offClick: (callback: () => void) => void;
  show: () => void;
  hide: () => void;
}

export interface TelegramMainButton {
  text: string;
  color: string;
  textColor: string;
  isVisible: boolean;
  isActive: boolean;
  isProgressVisible: boolean;
  setText: (text: string) => void;
  onClick: (callback: () => void) => void;
  offClick: (callback: () => void) => void;
  show: () => void;
  hide: () => void;
  enable: () => void;
  disable: () => void;
  showProgress: (leaveActive: boolean) => void;
  hideProgress: () => void;
  setParams: (params: any) => void;
}

export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  photo_url?: string;
}

export interface TelegramWebApp {
  initData: string;
  initDataUnsafe: {
    user?: TelegramUser;
    start_param?: string;
    [key: string]: any;
  };
  version: string;
  platform: string;
  themeParams: any;
  expand: () => void;
  close: () => void;
  ready: () => void;
  BackButton: TelegramBackButton;
  MainButton: TelegramMainButton;
  switchInlineQuery: (query: string, choose_chat_types?: string[]) => void;
  openLink: (url: string, options?: { try_instant_view?: boolean }) => void;
  openTelegramLink?: (url: string) => void;
  HapticFeedback: {
    impactOccurred: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void;
    notificationOccurred: (type: 'error' | 'success' | 'warning') => void;
    selectionChanged: () => void;
  };
  isVersionAtLeast: (version: string) => boolean;
  setHeaderColor: (color: string) => void;
  setBackgroundColor: (color: string) => void;
}

declare global {
  interface Window {
    Telegram?: {
      WebApp: TelegramWebApp;
    };
    webkitAudioContext: typeof AudioContext;
  }
}
