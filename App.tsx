import React, { useEffect, useState, useCallback, useRef } from 'react';
import { SearchBar } from './components/SearchBar';
import { WordCard } from './components/WordCard';
import { ProfileModal } from './components/ProfileModal';
import { LeaderboardModal } from './components/LeaderboardModal';
import { HistoryModal } from './components/HistoryModal'; // Import new modal
import type { WordData, SearchHistoryItem, TelegramUser, UserStats } from './types';
import { fetchWordDetails, fetchWordSummary } from './services/geminiService';
import { INITIAL_STATS, fetchUserStats, trackAction, getLevelInfo } from './services/gamification';
import { Sparkles, X, Wand2, User as UserIcon, AlertTriangle, CloudOff, Trophy, Crown, ChevronRight, Zap, Clock } from 'lucide-react';

export default function App() {
  const [wordData, setWordData] = useState<WordData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<SearchHistoryItem[]>([]);
  const [view, setView] = useState<'home' | 'result'>('home');
  const [user, setUser] = useState<TelegramUser | null>(null);
  
  // Gamification State
  const [userStats, setUserStats] = useState<UserStats>(INITIAL_STATS);
  const [showProfile, setShowProfile] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false); // New State
  const [levelUpToast, setLevelUpToast] = useState<{show: boolean, level: number}>({show: false, level: 0});
  
  // Summary State
  const [summary, setSummary] = useState<string | null>(null);
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  
  // Ref to prevent double-fetching in React Strict Mode
  const hasInitialized = useRef(false);

  // --- Handlers ---

  const handleGamificationAction = async (
      action: 'SEARCH' | 'SUMMARY' | 'SHARE', 
      payload?: { wordData?: WordData, word?: string, summary?: string }
    ) => {
    if (!user) return; // Cannot track if no user ID

    // Send payload (word data) to server to persist history
    const { stats, newBadges, history: serverHistory } = await trackAction(user.id, action, payload);
    
    // Check for level up
    if (stats.level > userStats.level) {
      setLevelUpToast({ show: true, level: stats.level });
      setTimeout(() => setLevelUpToast({ show: false, level: 0 }), 4000);
      if (window.Telegram?.WebApp) window.Telegram.WebApp.HapticFeedback.notificationOccurred('success');
    }
    
    // Show badge toast 
    if (newBadges.length > 0) {
      if (window.Telegram?.WebApp) window.Telegram.WebApp.HapticFeedback.notificationOccurred('success');
    }

    setUserStats(stats);
    
    // Update local history if server returned it (source of truth)
    if (serverHistory && serverHistory.length > 0) {
      setHistory(serverHistory);
      localStorage.setItem('ety_history', JSON.stringify(serverHistory));
    }
  };

  const handleLogin = () => {
    if (window.Telegram?.WebApp?.initDataUnsafe?.user) {
      setUser(window.Telegram.WebApp.initDataUnsafe.user);
    } else {
      console.warn("User data not available. Please open this app within Telegram.");
      // Dev mock user if needed
      if (import.meta.env.DEV) {
          setUser({ id: 12345, first_name: "TestUser" } as TelegramUser);
      }
    }
  };

  const handleBack = useCallback(() => {
     if (showSummaryModal) {
       setShowSummaryModal(false);
       if (window.Telegram?.WebApp) window.Telegram.WebApp.MainButton.show();
       return;
     }

     if (showLeaderboard) {
       setShowLeaderboard(false);
       if (view === 'home') setShowProfile(true); 
       return;
     }

     if (showProfile) {
       setShowProfile(false);
       return;
     }

     if (showHistoryModal) {
       setShowHistoryModal(false);
       return;
     }

     setView('home');
     setWordData(null);
     setSummary(null);
     if (window.Telegram?.WebApp) {
       window.Telegram.WebApp.HapticFeedback.selectionChanged();
     }
  }, [showSummaryModal, showProfile, showLeaderboard, showHistoryModal, view]);

  const handleGenerateSummary = useCallback(async () => {
    if (!wordData) return;
    
    if (window.Telegram?.WebApp) {
      window.Telegram.WebApp.MainButton.showProgress(false);
      window.Telegram.WebApp.HapticFeedback.impactOccurred('medium');
    }

    try {
      const text = await fetchWordSummary(wordData.word);
      setSummary(text);
      setShowSummaryModal(true);
      
      // Update history and stats on server
      if(user) {
          handleGamificationAction('SUMMARY', { 
              word: wordData.word, 
              summary: text 
          }); 
      }
      
      // Optimistic local update (in case server request fails or takes time)
      const updatedHistory = history.map(item => {
        if (item.word.toLowerCase() === wordData.word.toLowerCase()) {
           return { ...item, summary: text };
        }
        return item;
      });
      setHistory(updatedHistory);
      localStorage.setItem('ety_history', JSON.stringify(updatedHistory));
      
      if (window.Telegram?.WebApp) window.Telegram.WebApp.MainButton.hide();
    } catch (e) {
      console.error(e);
    } finally {
      if (window.Telegram?.WebApp) window.Telegram.WebApp.MainButton.hideProgress();
    }
  }, [wordData, user, history]); 

  const handleSearch = async (term: string) => {
    if (!term) return;
    setIsLoading(true);
    setError(null);
    setWordData(null); 
    setSummary(null);

    try {
      if (window.Telegram?.WebApp) window.Telegram.WebApp.HapticFeedback.impactOccurred('light');
      
      // 1. Check if we have this exact word with DATA in history first (Client Cache)
      const localCached = history.find(h => h.word.toLowerCase() === term.toLowerCase() && h.data);
      let data: WordData;

      if (localCached && localCached.data) {
          console.log("Loading from Local History Cache");
          data = localCached.data;
      } else {
          // 2. Fetch from API
          data = await fetchWordDetails(term);
      }
      
      setWordData(data);
      setView('result');

      if(user) {
         // This will save the full data to DB, so next time it is fetched from DB history
         handleGamificationAction('SEARCH', { wordData: data }); 
      } else {
         // Local-only fallback update
         const newItem: SearchHistoryItem = { 
            word: data.word, 
            timestamp: Date.now(),
            data: data 
         };
         const newHistory = [
            newItem,
            ...history.filter(h => h.word.toLowerCase() !== data.word.toLowerCase())
         ].slice(0, 50); 
         setHistory(newHistory);
         localStorage.setItem('ety_history', JSON.stringify(newHistory));
      }

    } catch (err: any) {
      console.error(err);
      setError(err.message || "An unexpected error occurred.");
      if (window.Telegram?.WebApp) window.Telegram.WebApp.HapticFeedback.notificationOccurred('error');
    } finally {
      setIsLoading(false);
    }
  };

  // Restores a word from history without API call
  const handleRestoreFromHistory = (item: SearchHistoryItem) => {
     setError(null); 
     
     if (item.data) {
       setWordData(item.data);
       setSummary(item.summary || null);
       setView('result');
       setShowHistoryModal(false);
     } else {
       setShowHistoryModal(false);
       handleSearch(item.word);
     }
  };

  const handleDeleteHistory = (timestamp: number) => {
     const newHistory = history.filter(h => h.timestamp !== timestamp);
     setHistory(newHistory);
     localStorage.setItem('ety_history', JSON.stringify(newHistory));
     // Note: We currently don't have an API to delete individual history items from server, 
     // but local deletion improves UX immediately.
  };

  const handleClearHistory = () => {
     setHistory([]);
     localStorage.removeItem('ety_history');
  };

  // --- Lifecycle & Telegram SDK ---

  useEffect(() => {
    if (hasInitialized.current) return;
    hasInitialized.current = true;

    // 1. Initialize Telegram WebApp
    if (window.Telegram?.WebApp) {
      const tg = window.Telegram.WebApp;
      tg.expand();
      tg.ready();

      if (tg.initDataUnsafe?.user) {
        setUser(tg.initDataUnsafe.user);
      }

      tg.MainButton.setParams({
        text: '✨ AI DEEP DIVE',
        color: tg.themeParams.button_color || '#2481cc',
        text_color: tg.themeParams.button_text_color || '#ffffff'
      });
    }
    
    // 2. Load History from Local Storage (Immediate Display)
    const saved = localStorage.getItem('ety_history');
    if (saved) {
      try {
        setHistory(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to parse history", e);
      }
    }

    // 3. Handle Deep Linking
    const params = new URLSearchParams(window.location.search);
    const deepLinkWord = params.get('word') || 
                         params.get('startapp') || 
                         window.Telegram?.WebApp?.initDataUnsafe?.start_param;

    if (deepLinkWord) {
      setTimeout(() => handleSearch(deepLinkWord), 100);
    }

  }, []);

  // Fetch Stats & History when User is Identified
  useEffect(() => {
    if (user) {
        fetchUserStats(user).then(({ stats, history: serverHistory }) => {
            setUserStats(stats);
            // Merge server history if available
            if (serverHistory && serverHistory.length > 0) {
               setHistory(serverHistory);
               localStorage.setItem('ety_history', JSON.stringify(serverHistory));
            }
        });
    }
  }, [user]);

  // Manage Native Buttons State
  useEffect(() => {
    if (!window.Telegram?.WebApp) return;
    const tg = window.Telegram.WebApp;

    const onMainBtnClick = () => handleGenerateSummary();
    const onBackBtnClick = () => handleBack();

    if (view === 'result' && !showProfile && !showLeaderboard && !showHistoryModal) {
      tg.BackButton.show();
      tg.BackButton.onClick(onBackBtnClick);

      if (!showSummaryModal) {
        tg.MainButton.show();
        tg.MainButton.onClick(onMainBtnClick);
      } else {
        tg.MainButton.hide();
      }

    } else if (showProfile || showLeaderboard || showHistoryModal) {
       tg.BackButton.show();
       tg.BackButton.onClick(onBackBtnClick);
       tg.MainButton.hide();
    } else {
      tg.BackButton.hide();
      tg.MainButton.hide();
      tg.BackButton.offClick(onBackBtnClick);
      tg.MainButton.offClick(onMainBtnClick);
    }

    return () => {
      tg.MainButton.offClick(onMainBtnClick);
      tg.BackButton.offClick(onBackBtnClick);
    };
  }, [view, showSummaryModal, showProfile, showLeaderboard, showHistoryModal, handleGenerateSummary, handleBack]);

  const isQuotaError = error?.toLowerCase().includes("limit") || error?.toLowerCase().includes("quota");
  const levelInfo = getLevelInfo(userStats.xp);
  const nextLevelProgress = ((userStats.xp - levelInfo.minXP) / (levelInfo.nextLevelXP - levelInfo.minXP)) * 100;

  return (
    <div className="min-h-screen bg-tg-bg text-tg-text font-sans relative overflow-x-hidden selection:bg-tg-button selection:text-white">
      
      {/* Ambient Background Glow (Theme Aware) */}
      <div className="fixed top-[-20%] left-[-10%] w-[60%] h-[50%] bg-tg-button rounded-full blur-[120px] opacity-[0.08] pointer-events-none z-0"></div>
      <div className="fixed bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-purple-500 rounded-full blur-[100px] opacity-[0.05] pointer-events-none z-0"></div>

      {/* Content Container */}
      <div className="w-full max-w-2xl mx-auto relative z-10 min-h-screen flex flex-col p-4 md:p-6">
        
        {/* Top Bar: Split Layout (History/Stats Left, User Right) */}
        <div className={`flex justify-between items-center transition-all duration-300 ${view === 'result' ? 'opacity-0 h-0 pointer-events-none' : 'opacity-100 mb-8'}`}>
           
           <div className="flex items-center gap-3">
             {/* History Button */}
             <button 
                onClick={() => setShowHistoryModal(true)}
                className="w-10 h-10 rounded-full bg-tg-secondaryBg border border-tg-hint/10 flex items-center justify-center text-tg-text shadow-sm hover:bg-tg-button/10 transition-colors"
                title="Search History"
             >
                <Clock size={20} />
             </button>

             {/* Enhanced Level / XP Pill */}
             <button onClick={() => setShowProfile(true)} className="flex items-center gap-2 group">
                <div className="relative w-10 h-10">
                   {/* Progress Ring Background */}
                   <svg className="w-10 h-10 -rotate-90" viewBox="0 0 36 36">
                      <path className="text-tg-secondaryBg" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeWidth="4" />
                      <path 
                        className="text-tg-button transition-all duration-1000 ease-out" 
                        strokeDasharray={`${nextLevelProgress}, 100`} 
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" 
                        fill="none" 
                        stroke="currentColor" 
                        strokeWidth="4"
                        strokeLinecap="round" 
                      />
                   </svg>
                   <div className="absolute inset-0 flex items-center justify-center font-black text-sm text-tg-text">
                     {userStats.level}
                   </div>
                   {userStats.badges.length > 0 && (
                     <div className="absolute -bottom-1 -right-1 text-yellow-500 drop-shadow-sm">
                        <Crown size={12} fill="currentColor" />
                     </div>
                   )}
                </div>
                
                <div className="hidden sm:flex flex-col items-start leading-none">
                   <span className="text-[10px] font-bold text-tg-hint uppercase tracking-wider">Level {userStats.level}</span>
                   <span className="text-sm font-bold text-tg-text group-hover:text-tg-button transition-colors truncate max-w-[120px]">
                     {levelInfo.title}
                   </span>
                </div>
             </button>
           </div>
           
           {/* User Profile / Login */}
           {user ? (
             <button onClick={() => setShowProfile(true)} className="flex items-center gap-2 bg-tg-secondaryBg border border-tg-hint/10 pl-1 pr-3 py-1 rounded-full shadow-sm animate-in fade-in cursor-pointer hover:bg-tg-button/5 transition-colors backdrop-blur-md bg-opacity-80">
               {user.photo_url ? (
                 <img src={user.photo_url} alt="Profile" className="w-8 h-8 rounded-full ring-2 ring-white dark:ring-black object-cover" />
               ) : (
                 <div className="w-8 h-8 bg-gradient-to-br from-tg-button to-purple-500 rounded-full flex items-center justify-center text-white text-xs font-bold ring-2 ring-white dark:ring-black">
                   {user.first_name[0]}
                 </div>
               )}
               <div className="flex flex-col items-start leading-none">
                 <span className="text-xs font-bold text-tg-text truncate max-w-[80px]">{user.first_name}</span>
                 <span className="text-[10px] text-tg-hint font-medium flex items-center gap-0.5">
                   <Zap size={8} className="text-yellow-500 fill-yellow-500" />
                   {userStats.xp}
                 </span>
               </div>
             </button>
           ) : (
             <button 
               onClick={handleLogin}
               className="flex items-center gap-2 text-xs font-bold bg-tg-button/10 text-tg-button hover:bg-tg-button hover:text-white px-3 py-1.5 rounded-full transition-all"
             >
               <UserIcon size={14} />
               Sign In
             </button>
           )}
        </div>

        {/* Branding Header */}
        <header className={`flex flex-col items-center justify-center transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] ${view === 'result' ? 'h-0 overflow-hidden opacity-0 scale-95' : 'flex-1 max-h-[40vh] opacity-100 scale-100'}`}>
          <div className="text-center">
             <div className="relative inline-block">
               <div className="absolute inset-0 bg-tg-button blur-[40px] opacity-20 rounded-full"></div>
               <img 
                 src="/logo.png" 
                 alt="Ety.ai" 
                 className="relative z-10 w-28 h-28 mx-auto mb-6 object-contain animate-float drop-shadow-xl" 
                 onError={(e) => {
                   e.currentTarget.style.display = 'none';
                   e.currentTarget.parentElement?.querySelector('.fallback-logo')?.classList.remove('hidden');
                 }}
               />
               <div className="fallback-logo hidden w-20 h-20 bg-gradient-to-br from-tg-button to-purple-600 rounded-2xl mx-auto mb-6 flex items-center justify-center shadow-lg shadow-tg-button/30 text-white rotate-3 hover:rotate-6 transition-transform">
                 <span className="font-serif font-black text-4xl">Æ</span>
               </div>
             </div>
             <h1 className="text-3xl md:text-4xl font-black tracking-tight text-tg-text mb-2">Ety.ai</h1>
             <p className="text-tg-hint font-medium text-base">Uncover the stories behind words</p>
          </div>
        </header>

        {/* Main Search Area */}
        <main className={`relative z-10 transition-all duration-500 ${view === 'result' ? 'mt-4' : 'mt-8'}`}>
          
          <div className={`${view === 'result' ? '' : 'max-w-md mx-auto'}`}>
            <SearchBar 
              onSearch={handleSearch} 
              isLoading={isLoading} 
              history={history}
              onHistorySelect={(term) => {
                 // Try to find full data in history first
                 const historyItem = history.find(h => h.word.toLowerCase() === term.toLowerCase());
                 if (historyItem) {
                    handleRestoreFromHistory(historyItem);
                 } else {
                    handleSearch(term);
                 }
              }}
            />
          </div>

          {/* Loading State */}
          {isLoading && (
            <div className="mt-12 text-center animate-in fade-in zoom-in duration-300">
              <div className="w-16 h-16 mx-auto bg-tg-secondaryBg rounded-full mb-4 flex items-center justify-center relative">
                 <div className="absolute inset-0 border-4 border-tg-button/20 rounded-full"></div>
                 <div className="absolute inset-0 border-4 border-tg-button border-t-transparent rounded-full animate-spin"></div>
                 <Sparkles className="text-tg-button" size={24} />
              </div>
              <p className="text-tg-text font-serif italic text-lg animate-pulse">Consulting the archives...</p>
            </div>
          )}

          {/* Error State */}
          {error && (
            <div className={`mt-6 mx-auto max-w-md p-5 rounded-2xl flex items-start gap-4 shadow-sm border animate-in slide-in-from-bottom-2 ${
                isQuotaError 
                 ? "bg-amber-50 dark:bg-amber-900/10 text-amber-900 dark:text-amber-100 border-amber-200 dark:border-amber-800/30" 
                 : "bg-red-50 dark:bg-red-900/10 text-red-700 dark:text-red-200 border-red-200 dark:border-red-800/30"
            }`}>
              <div className={`p-2 rounded-full shrink-0 ${isQuotaError ? 'bg-amber-100 dark:bg-amber-800' : 'bg-red-100 dark:bg-red-800'}`}>
                {isQuotaError ? <CloudOff size={20} /> : <AlertTriangle size={20} />}
              </div>
              <div>
                 <p className="font-bold text-base mb-1">{isQuotaError ? "Daily Limit Reached" : "Connection Error"}</p>
                 <p className="text-sm opacity-90 leading-relaxed">{error}</p>
                 {!isQuotaError && error.includes("API Key missing") && (
                   <p className="text-xs mt-3 font-mono bg-black/5 dark:bg-white/5 p-2 rounded border border-black/5">
                     ENV: GEMINI_API_KEY missing
                   </p>
                 )}
              </div>
            </div>
          )}

          {/* Results View */}
          {view === 'result' && wordData && !isLoading && (
             <div className="mt-6 animate-in fade-in slide-in-from-bottom-8 duration-700">
                {!window.Telegram?.WebApp && (
                  <button 
                    onClick={handleBack}
                    className="mb-4 text-tg-hint hover:text-tg-text flex items-center gap-2 text-sm font-bold uppercase tracking-wide transition-colors group"
                  >
                    <span className="group-hover:-translate-x-1 transition-transform">&larr;</span> Search
                  </button>
                )}
                
                <WordCard data={wordData} onShare={() => user && handleGamificationAction('SHARE')} />
                
                {!window.Telegram?.WebApp && (
                   <button 
                     onClick={handleGenerateSummary}
                     className="w-full py-4 mt-6 bg-gradient-to-r from-tg-button to-blue-600 text-white rounded-xl font-bold text-lg shadow-lg shadow-tg-button/30 flex items-center justify-center gap-3 hover:scale-[1.02] active:scale-[0.98] transition-all"
                   >
                     <Wand2 size={22} />
                     Generate Deep Dive
                   </button>
                )}
             </div>
          )}
        </main>
      </div>

      {/* Level Up Toast */}
      {levelUpToast.show && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[200] animate-in fade-in slide-in-from-top duration-500 w-[90%] max-w-sm">
           <div className="bg-gradient-to-r from-yellow-400 to-orange-500 text-white p-4 rounded-2xl shadow-2xl flex items-center gap-4 border-2 border-white/20">
              <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center text-white animate-bounce">
                <Trophy size={24} fill="currentColor" />
              </div>
              <div>
                <div className="font-black text-lg uppercase tracking-wide">Level Up!</div>
                <div className="text-sm font-medium opacity-95">You reached Rank {levelUpToast.level}</div>
              </div>
           </div>
        </div>
      )}

      {/* Summary Modal */}
      {showSummaryModal && summary && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/40 backdrop-blur-md animate-in fade-in duration-300 p-0 md:p-4">
           <div className="absolute inset-0" onClick={() => setShowSummaryModal(false)}></div>
           <div 
             className="bg-tg-bg w-full max-w-md md:max-w-xl rounded-t-[2rem] md:rounded-3xl p-8 shadow-2xl animate-in slide-in-from-bottom duration-300 relative border-t md:border border-white/20 dark:border-white/5 max-h-[85vh] overflow-y-auto no-scrollbar"
           >
              <div className="w-12 h-1.5 bg-tg-hint/20 rounded-full mx-auto mb-6 md:hidden"></div>
              
              <button 
                onClick={() => setShowSummaryModal(false)}
                className="absolute top-6 right-6 p-2 bg-tg-secondaryBg rounded-full text-tg-hint hover:text-tg-text transition-colors hover:rotate-90 duration-300"
              >
                <X size={20} />
              </button>
              
              <div className="flex items-center gap-3 mb-6 text-tg-button">
                 <div className="p-2.5 bg-tg-button/10 rounded-xl">
                    <Wand2 size={24} />
                 </div>
                 <h2 className="text-2xl font-bold font-serif text-tg-text">Deep Dive</h2>
              </div>
              
              <div className="prose prose-lg dark:prose-invert text-tg-text/90 leading-relaxed font-serif first-letter:text-5xl first-letter:font-bold first-letter:float-left first-letter:mr-3 first-letter:mt-[-4px] first-letter:text-tg-button">
                <p>{summary}</p>
              </div>

              <div className="mt-8 pt-6 border-t border-tg-hint/10">
                <button 
                  onClick={() => setShowSummaryModal(false)}
                  className="w-full py-3.5 bg-tg-secondaryBg text-tg-text font-bold rounded-xl hover:bg-tg-hint/10 transition-colors"
                >
                  Close
                </button>
              </div>
           </div>
        </div>
      )}

      {/* Profile Modal */}
      {showProfile && (
        <ProfileModal 
          stats={userStats} 
          onClose={() => setShowProfile(false)} 
          onShowLeaderboard={() => {
            setShowProfile(false);
            setShowLeaderboard(true);
          }}
        />
      )}

      {/* Leaderboard Modal */}
      {showLeaderboard && (
        <LeaderboardModal 
          onClose={() => setShowLeaderboard(false)} 
          currentUser={user}
          currentStats={userStats}
        />
      )}

      {/* History Modal */}
      {showHistoryModal && (
        <HistoryModal 
           history={history}
           onClose={() => setShowHistoryModal(false)}
           onSelect={handleRestoreFromHistory}
           onClear={handleClearHistory}
           onDelete={handleDeleteHistory}
        />
      )}
    </div>
  );
}