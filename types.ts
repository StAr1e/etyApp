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
}

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

// Minimal definition for Telegram WebApp
export interface TelegramWebApp {
  initData: string;
  initDataUnsafe: {
    user?: TelegramUser;
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
  HapticFeedback: {
    impactOccurred: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void;
    notificationOccurred: (type: 'error' | 'success' | 'warning') => void;
    selectionChanged: () => void;
  };
}

declare global {
  interface Window {
    Telegram?: {
      WebApp: TelegramWebApp;
    };
    webkitAudioContext: typeof AudioContext;
  }
}