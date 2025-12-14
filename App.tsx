
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { SearchBar } from './components/SearchBar';
import { WordCard } from './components/WordCard';
import { ProfileModal } from './components/ProfileModal';
import { LeaderboardModal } from './components/LeaderboardModal';
import type { WordData, SearchHistoryItem, TelegramUser, UserStats } from './types';
import { fetchWordDetails, fetchWordSummary } from './services/geminiService';
import { INITIAL_STATS, fetchUserStats, trackAction, getLevelInfo } from './services/gamification';
import { Sparkles, X, Wand2, User as UserIcon, AlertTriangle, CloudOff, Trophy, Crown, ChevronRight, Home, LayoutList, Search, BookOpen } from 'lucide-react';

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
  const [levelUpToast, setLevelUpToast] = useState<{show: boolean, level: number}>({show: false, level: 0});
  
  // Summary State
  const [summary, setSummary] = useState<string | null>(null);
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  
  const hasInitialized = useRef(false);

  // --- Handlers ---

  const handleGamificationAction = async (action: 'SEARCH' | 'SUMMARY' | 'SHARE') => {
    if (!user) return; 

    // Server is source of truth now
    const { stats, newBadges } = await trackAction(user.id, action);
    
    if (stats.level > userStats.level) {
      setLevelUpToast({ show: true, level: stats.level });
      setTimeout(() => setLevelUpToast({ show: false, level: 0 }), 4000);
      if (window.Telegram?.WebApp) window.Telegram.WebApp.HapticFeedback.notificationOccurred('success');
    }
    
    if (newBadges.length > 0) {
      if (window.Telegram?.WebApp) window.Telegram.WebApp.HapticFeedback.notificationOccurred('success');
    }

    setUserStats(stats);
  };

  const handleLogin = () => {
    if (window.Telegram?.WebApp?.initDataUnsafe?.user) {
      setUser(window.Telegram.WebApp.initDataUnsafe.user);
    } else {
      if (import.meta.env.DEV) {
          setUser({ id: 12345, first_name: "TestUser", photo_url: "" } as TelegramUser);
      }
    }
  };

  const handleBack = useCallback(() => {
     if (showSummaryModal) {
       setShowSummaryModal(false);
       if (window.Telegram?.WebApp) window.Telegram.WebApp.MainButton.show();
       return;
     }

     if (showProfile) {
       setShowProfile(false);
       return;
     }

     if (showLeaderboard) {
       setShowLeaderboard(false);
       return;
     }

     setView('home');
     setWordData(null);
     setSummary(null);
     if (window.Telegram?.WebApp) {
       window.Telegram.WebApp.HapticFeedback.selectionChanged();
     }
  }, [showSummaryModal, showProfile, showLeaderboard]);

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
      if(user) handleGamificationAction('SUMMARY'); 
      
      if (window.Telegram?.WebApp) window.Telegram.WebApp.MainButton.hide();
    } catch (e) {
      console.error(e);
    } finally {
      if (window.Telegram?.WebApp) window.Telegram.WebApp.MainButton.hideProgress();
    }
  }, [wordData, user, userStats]);

  const handleSearch = async (term: string) => {
    if (!term) return;
    setIsLoading(true);
    setError(null);
    setWordData(null); 
    setSummary(null);

    try {
      if (window.Telegram?.WebApp) window.Telegram.WebApp.HapticFeedback.impactOccurred('light');
      
      const data = await fetchWordDetails(term);
      setWordData(data);
      setView('result');
      if(user) handleGamificationAction('SEARCH'); 

      const newHistory = [
        { word: data.word, timestamp: Date.now() },
        ...history.filter(h => h.word.toLowerCase() !== data.word.toLowerCase())
      ].slice(0, 10); 
      
      setHistory(newHistory);
      localStorage.setItem('ety_history', JSON.stringify(newHistory));

    } catch (err: any) {
      console.error(err);
      setError(err.message || "An unexpected error occurred.");
      if (window.Telegram?.WebApp) window.Telegram.WebApp.HapticFeedback.notificationOccurred('error');
    } finally {
      setIsLoading(false);
    }
  };

  // --- Lifecycle & Telegram SDK ---

  useEffect(() => {
    if (hasInitialized.current) return;
    hasInitialized.current = true;

    if (window.Telegram?.WebApp) {
      const tg = window.Telegram.WebApp;
      tg.expand();
      tg.ready();
      tg.setHeaderColor(tg.themeParams.bg_color || '#ffffff');
      tg.setBackgroundColor(tg.themeParams.bg_color || '#ffffff');

      if (tg.initDataUnsafe?.user) {
        setUser(tg.initDataUnsafe.user);
      }

      tg.MainButton.setParams({
        text: '✨ AI DEEP DIVE',
        color: tg.themeParams.button_color || '#2481cc',
        text_color: tg.themeParams.button_text_color || '#ffffff'
      });
    }
    
    const saved = localStorage.getItem('ety_history');
    if (saved) setHistory(JSON.parse(saved));

    const params = new URLSearchParams(window.location.search);
    const deepLinkWord = params.get('word') || params.get('startapp') || window.Telegram?.WebApp?.initDataUnsafe?.start_param;

    if (deepLinkWord) setTimeout(() => handleSearch(deepLinkWord), 100);
  }, []);

  useEffect(() => {
    if (user) fetchUserStats(user).then(setUserStats);
  }, [user]);

  // Handle Back Button
  useEffect(() => {
    if (!window.Telegram?.WebApp) return;
    const tg = window.Telegram.WebApp;
    const onBack = () => handleBack();

    if (view === 'result' || showProfile || showLeaderboard || showSummaryModal) {
      tg.BackButton.show();
      tg.BackButton.onClick(onBack);
    } else {
      tg.BackButton.hide();
      tg.BackButton.offClick(onBack);
    }
    return () => tg.BackButton.offClick(onBack);
  }, [view, showProfile, showLeaderboard, showSummaryModal]);

  const levelInfo = getLevelInfo(userStats.xp);
  const nextLevelProgress = ((userStats.xp - levelInfo.minXP) / (levelInfo.nextLevelXP - levelInfo.minXP)) * 100;

  return (
    <div className="min-h-screen bg-tg-bg text-tg-text font-sans flex flex-col overflow-hidden relative selection:bg-tg-button selection:text-white">
      
      {/* Dynamic Background */}
      <div className="fixed top-0 left-0 w-full h-64 bg-gradient-to-b from-tg-button/5 to-transparent pointer-events-none z-0"></div>
      
      {/* Header Bar */}
      <div className="pt-4 px-6 pb-2 flex justify-between items-center relative z-20">
         <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-tg-button to-purple-600 flex items-center justify-center text-white font-serif font-bold text-lg shadow-glow">
              Æ
            </div>
            <span className="font-bold text-lg tracking-tight">Ety.ai</span>
         </div>

         {/* Stats Chip */}
         {user && (
           <button onClick={() => setShowProfile(true)} className="flex items-center gap-2 bg-tg-secondaryBg/80 backdrop-blur-md px-3 py-1 rounded-full border border-tg-hint/10 shadow-sm active:scale-95 transition-transform">
              <div className="w-5 h-5 rounded-full bg-yellow-500 text-white flex items-center justify-center text-[10px] font-bold">
                 {userStats.level}
              </div>
              <div className="flex flex-col items-start leading-none">
                 <span className="text-[10px] text-tg-hint font-bold uppercase">XP</span>
                 <span className="text-xs font-bold">{userStats.xp}</span>
              </div>
           </button>
         )}
      </div>

      {/* Main Scrollable Content */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden relative z-10 pb-24">
         
         {/* Home View */}
         <div className={`transition-all duration-500 px-6 ${view === 'home' ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-10 hidden'}`}>
            <div className="mt-8 mb-12 text-center">
               <h1 className="text-4xl font-serif font-black mb-2 bg-clip-text text-transparent bg-gradient-to-br from-tg-text to-tg-text/60">
                 Explore Words
               </h1>
               <p className="text-tg-hint font-medium">Uncover the hidden history of language.</p>
            </div>

            <div className="max-w-md mx-auto relative z-30">
               <SearchBar 
                  onSearch={handleSearch} 
                  isLoading={isLoading} 
                  history={history}
                  onHistorySelect={(term) => handleSearch(term)}
               />
            </div>
            
            {/* Quick Actions Grid for Gamification */}
            <div className="mt-12 grid grid-cols-2 gap-4 max-w-md mx-auto">
                <button 
                   onClick={() => setShowLeaderboard(true)}
                   className="p-4 rounded-2xl bg-gradient-to-br from-yellow-500/10 to-orange-500/10 border border-yellow-500/20 flex flex-col items-center gap-2 hover:bg-yellow-500/20 transition-colors"
                >
                   <Trophy className="text-yellow-600" size={24} />
                   <span className="font-bold text-sm text-yellow-800 dark:text-yellow-200">Leaderboard</span>
                </button>
                <button 
                   onClick={() => user ? setShowProfile(true) : handleLogin()}
                   className="p-4 rounded-2xl bg-gradient-to-br from-tg-button/10 to-purple-500/10 border border-tg-button/20 flex flex-col items-center gap-2 hover:bg-tg-button/20 transition-colors"
                >
                   <UserIcon className="text-tg-button" size={24} />
                   <span className="font-bold text-sm text-tg-button">My Profile</span>
                </button>
            </div>
         </div>

         {/* Result View */}
         {view === 'result' && wordData && (
            <div className="animate-in slide-in-from-bottom-10 fade-in duration-500 px-4 md:px-6 py-6">
                <WordCard data={wordData} onShare={() => user && handleGamificationAction('SHARE')} />
                
                {!window.Telegram?.WebApp && (
                   <button 
                     onClick={handleGenerateSummary}
                     className="w-full py-4 mt-6 bg-gradient-to-r from-tg-button to-blue-600 text-white rounded-xl font-bold text-lg shadow-lg flex items-center justify-center gap-3"
                   >
                     <Wand2 size={22} />
                     Generate Deep Dive
                   </button>
                )}
            </div>
         )}
         
         {/* Loaders & Errors */}
         {isLoading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-tg-bg/50 backdrop-blur-sm z-50">
               <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-lg animate-bounce">
                  <Sparkles className="text-tg-button" size={24} />
               </div>
               <p className="mt-4 font-serif italic text-tg-hint">Consulting the archives...</p>
            </div>
         )}

         {error && (
            <div className="mx-6 mt-8 p-4 bg-red-50 text-red-800 rounded-xl flex items-center gap-3 border border-red-100">
               <AlertTriangle size={20} />
               <span className="text-sm font-medium">{error}</span>
            </div>
         )}
      </div>

      {/* Professional Bottom Nav (Mobile App Feel) */}
      <div className="fixed bottom-0 left-0 right-0 bg-tg-bg/90 backdrop-blur-xl border-t border-tg-hint/10 pb-safe pt-2 px-6 flex justify-around items-center z-40 h-[70px]">
         <button onClick={() => handleBack()} className={`flex flex-col items-center gap-1 ${view === 'home' ? 'text-tg-button' : 'text-tg-hint'}`}>
            <Home size={24} strokeWidth={view === 'home' ? 2.5 : 2} />
            <span className="text-[10px] font-bold">Home</span>
         </button>
         <div className="w-px h-8 bg-tg-hint/10"></div>
         <button onClick={() => setShowLeaderboard(true)} className={`flex flex-col items-center gap-1 ${showLeaderboard ? 'text-tg-button' : 'text-tg-hint'}`}>
            <Trophy size={24} strokeWidth={showLeaderboard ? 2.5 : 2} />
            <span className="text-[10px] font-bold">Ranks</span>
         </button>
         <div className="w-px h-8 bg-tg-hint/10"></div>
         <button onClick={() => user ? setShowProfile(true) : handleLogin()} className={`flex flex-col items-center gap-1 ${showProfile ? 'text-tg-button' : 'text-tg-hint'}`}>
             <div className="relative">
               {user?.photo_url ? (
                 <img src={user.photo_url} className={`w-6 h-6 rounded-full border-2 ${showProfile ? 'border-tg-button' : 'border-transparent'}`} />
               ) : (
                 <UserIcon size={24} strokeWidth={showProfile ? 2.5 : 2} />
               )}
             </div>
            <span className="text-[10px] font-bold">Profile</span>
         </button>
      </div>

      {/* Modals */}
      {levelUpToast.show && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[200] animate-in slide-in-from-top fade-in">
           <div className="bg-gradient-to-r from-yellow-400 to-orange-500 text-white px-6 py-3 rounded-full shadow-xl flex items-center gap-3 font-bold border-2 border-white/30">
              <Trophy size={20} className="animate-bounce" />
              <span>Level Up! Rank {levelUpToast.level} Achieved!</span>
           </div>
        </div>
      )}

      {showSummaryModal && summary && (
        <div className="fixed inset-0 z-[120] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
           <div className="absolute inset-0" onClick={() => setShowSummaryModal(false)}></div>
           <div className="bg-tg-bg w-full max-w-lg rounded-3xl p-8 shadow-2xl relative max-h-[80vh] overflow-y-auto">
              <button onClick={() => setShowSummaryModal(false)} className="absolute top-4 right-4 p-2 bg-tg-secondaryBg rounded-full"><X size={20}/></button>
              <h2 className="text-2xl font-serif font-bold mb-4 flex items-center gap-2 text-tg-button"><Wand2/> Deep Dive</h2>
              <div className="prose prose-lg dark:prose-invert font-serif leading-relaxed text-tg-text/90">
                 {summary}
              </div>
           </div>
        </div>
      )}

      {showProfile && <ProfileModal stats={userStats} onClose={() => setShowProfile(false)} />}
      {showLeaderboard && <LeaderboardModal onClose={() => setShowLeaderboard(false)} currentUserId={user?.id} />}
    </div>
  );
}
