import React, { useEffect, useState, useCallback, useRef } from 'react';
import { SearchBar } from './components/SearchBar';
import { WordCard } from './components/WordCard';
import { WordData, SearchHistoryItem, TelegramUser } from './types';
import { fetchWordDetails, fetchWordSummary } from './services/geminiService';
import { Sparkles, X, Wand2, User as UserIcon, AlertTriangle, CloudOff } from 'lucide-react';

export default function App() {
  const [wordData, setWordData] = useState<WordData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<SearchHistoryItem[]>([]);
  const [view, setView] = useState<'home' | 'result'>('home');
  const [user, setUser] = useState<TelegramUser | null>(null);
  
  // Summary State
  const [summary, setSummary] = useState<string | null>(null);
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  
  // Ref to prevent double-fetching in React Strict Mode
  const hasInitialized = useRef(false);

  // --- Handlers ---

  const handleLogin = () => {
    if (window.Telegram?.WebApp?.initDataUnsafe?.user) {
      setUser(window.Telegram.WebApp.initDataUnsafe.user);
    } else {
      console.warn("User data not available. Please open this app within Telegram.");
    }
  };

  const handleBack = useCallback(() => {
     if (showSummaryModal) {
       setShowSummaryModal(false);
       if (window.Telegram?.WebApp) window.Telegram.WebApp.MainButton.show();
       return;
     }

     setView('home');
     setWordData(null);
     setSummary(null);
     if (window.Telegram?.WebApp) {
       window.Telegram.WebApp.HapticFeedback.selectionChanged();
     }
  }, [showSummaryModal]);

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
      if (window.Telegram?.WebApp) window.Telegram.WebApp.MainButton.hide();
    } catch (e) {
      console.error(e);
    } finally {
      if (window.Telegram?.WebApp) window.Telegram.WebApp.MainButton.hideProgress();
    }
  }, [wordData]);

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
    
    // 2. Load History
    const saved = localStorage.getItem('ety_history');
    if (saved) {
      setHistory(JSON.parse(saved));
    }

    // 3. Handle Deep Linking (Auto-search shared words)
    // Check URL params first (standard web/inline button), then Telegram start_param
    const params = new URLSearchParams(window.location.search);
    const deepLinkWord = params.get('word') || 
                         params.get('startapp') || 
                         window.Telegram?.WebApp?.initDataUnsafe?.start_param;

    if (deepLinkWord) {
      // Small delay to ensure UI is ready
      setTimeout(() => handleSearch(deepLinkWord), 100);
    }

  }, []);

  // Manage Native Buttons State
  useEffect(() => {
    if (!window.Telegram?.WebApp) return;
    const tg = window.Telegram.WebApp;

    const onMainBtnClick = () => handleGenerateSummary();
    const onBackBtnClick = () => handleBack();

    if (view === 'result') {
      tg.BackButton.show();
      tg.BackButton.onClick(onBackBtnClick);

      if (!showSummaryModal) {
        tg.MainButton.show();
        tg.MainButton.onClick(onMainBtnClick);
      } else {
        tg.MainButton.hide();
      }

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
  }, [view, showSummaryModal, handleGenerateSummary, handleBack]);

  const isQuotaError = error?.toLowerCase().includes("limit") || error?.toLowerCase().includes("quota");

  return (
    <div className="min-h-screen bg-tg-bg text-tg-text font-sans p-4 md:p-8 relative overflow-x-hidden">
      
      {/* Content Container */}
      <div className="w-full max-w-md md:max-w-2xl mx-auto relative">
        
        {/* Top Bar / Login Area */}
        <div className={`absolute top-0 left-0 right-0 flex justify-between items-center z-20 transition-opacity ${view === 'result' ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
           <div className="text-xs font-bold text-tg-hint uppercase tracking-wider"></div>
           
           {user ? (
             <div className="flex items-center gap-2 bg-tg-secondaryBg pl-2 pr-3 py-1.5 rounded-full shadow-sm animate-in fade-in cursor-default">
               {user.photo_url ? (
                 <img src={user.photo_url} alt="Profile" className="w-6 h-6 rounded-full" />
               ) : (
                 <div className="w-6 h-6 bg-gradient-to-br from-purple-400 to-blue-500 rounded-full flex items-center justify-center text-white text-xs font-bold">
                   {user.first_name[0]}
                 </div>
               )}
               <span className="text-sm font-semibold text-tg-text truncate max-w-[100px]">{user.first_name}</span>
             </div>
           ) : (
             <button 
               onClick={handleLogin}
               className="flex items-center gap-2 text-sm font-bold text-tg-button hover:bg-tg-button/10 px-3 py-1.5 rounded-full transition-colors"
             >
               <UserIcon size={16} />
               Login
             </button>
           )}
        </div>

        {/* Branding Header */}
        <header className={`flex items-center justify-center py-6 mt-8 md:mt-12 transition-all duration-500 ${view === 'result' ? 'opacity-0 h-0 overflow-hidden py-0 mt-0' : 'opacity-100'}`}>
          <div className="text-center">
             <img 
               src="/logo.png" 
               alt="Ety.ai" 
               className="w-24 h-24 mx-auto mb-4 object-contain animate-in fade-in zoom-in duration-500" 
               onError={(e) => {
                 // Fallback if image fails
                 e.currentTarget.style.display = 'none';
                 e.currentTarget.parentElement?.querySelector('.fallback-logo')?.classList.remove('hidden');
               }}
             />
             <div className="fallback-logo hidden w-16 h-16 bg-gradient-to-tr from-tg-button to-purple-500 rounded-2xl mx-auto mb-3 flex items-center justify-center shadow-lg text-white">
               <span className="font-serif font-bold text-3xl">Æ</span>
             </div>
             <h1 className="text-2xl font-bold tracking-tight">Ety.ai</h1>
             <p className="text-tg-hint text-sm">Discover the stories behind words</p>
          </div>
        </header>

        {/* Main Search Area */}
        <main className="relative z-10 pb-20 md:pb-0">
          <SearchBar 
            onSearch={handleSearch} 
            isLoading={isLoading} 
            history={history}
            onHistorySelect={(term) => handleSearch(term)}
          />

          {/* Loading State */}
          {isLoading && (
            <div className="mt-8 text-center animate-pulse">
              <div className="w-16 h-16 mx-auto bg-tg-secondaryBg rounded-full mb-4 flex items-center justify-center">
                 <Sparkles className="text-tg-button animate-spin-slow" />
              </div>
              <p className="text-tg-hint font-medium">Consulting the archives...</p>
            </div>
          )}

          {/* Error State */}
          {error && (
            <div className={`mt-6 p-4 rounded-xl flex items-start gap-3 border ${
                isQuotaError 
                 ? "bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-200 border-amber-200 dark:border-amber-800/30" 
                 : "bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800/30"
            }`}>
              {isQuotaError ? <CloudOff className="shrink-0 mt-0.5" size={20} /> : <AlertTriangle className="shrink-0 mt-0.5" size={20} />}
              <div>
                 <p className="font-bold text-sm mb-1">{isQuotaError ? "Daily Limit Reached" : "Connection Error"}</p>
                 <p className="text-sm opacity-90 leading-relaxed">{error}</p>
                 {!isQuotaError && error.includes("API Key missing") && (
                   <p className="text-xs mt-2 font-mono bg-black/10 p-2 rounded">
                     Fix: Add GEMINI_API_KEY to Vercel Environment Variables.
                   </p>
                 )}
              </div>
            </div>
          )}

          {/* Results View */}
          {view === 'result' && wordData && !isLoading && (
             <div className="mt-6 animate-in fade-in slide-in-from-bottom-8 duration-500">
                {!window.Telegram?.WebApp && (
                  <button 
                    onClick={handleBack}
                    className="mb-4 text-tg-hint hover:text-tg-text flex items-center gap-1 text-sm font-medium transition-colors"
                  >
                    &larr; Search another word
                  </button>
                )}
                
                <WordCard data={wordData} />
                
                {!window.Telegram?.WebApp && (
                   <button 
                     onClick={handleGenerateSummary}
                     className="w-full py-4 mt-4 bg-gradient-to-r from-tg-button to-purple-600 text-white rounded-xl font-bold shadow-lg flex items-center justify-center gap-2 hover:opacity-90 transition-opacity"
                   >
                     <Wand2 size={20} />
                     Generate AI Deep Dive
                   </button>
                )}
             </div>
          )}

          {/* Empty State */}
          {view === 'home' && !isLoading && !error && history.length === 0 && (
             <div className="mt-12 text-center">
                <p className="text-tg-hint mb-4">Try searching for:</p>
                <div className="flex flex-wrap justify-center gap-2">
                   {['Serendipity', 'Robot', 'Galaxy', 'Whiskey'].map(w => (
                     <button 
                       key={w}
                       onClick={() => handleSearch(w)}
                       className="px-4 py-2 bg-tg-secondaryBg rounded-full text-tg-text text-sm font-medium hover:bg-tg-button/10 hover:text-tg-button transition-colors"
                     >
                       {w}
                     </button>
                   ))}
                </div>
             </div>
          )}
        </main>
      </div>

      {/* Summary Modal */}
      {showSummaryModal && summary && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200 p-4 md:p-0">
           <div className="absolute inset-0" onClick={() => setShowSummaryModal(false)}></div>
           <div 
             className="bg-tg-bg w-full max-w-md md:max-w-xl rounded-t-3xl md:rounded-2xl p-6 shadow-2xl animate-in slide-in-from-bottom md:zoom-in-95 duration-300 relative border-t md:border border-tg-hint/20"
             style={{ maxHeight: '85vh', overflowY: 'auto' }}
           >
              <button 
                onClick={() => setShowSummaryModal(false)}
                className="absolute top-4 right-4 p-2 bg-tg-secondaryBg rounded-full text-tg-hint hover:text-tg-text transition-colors"
              >
                <X size={20} />
              </button>
              
              <div className="flex items-center gap-2 mb-4 text-purple-600">
                 <Wand2 size={24} />
                 <h2 className="text-2xl font-bold font-serif">Deep Dive</h2>
              </div>
              
              <div className="prose prose-lg dark:prose-invert text-tg-text leading-relaxed font-serif">
                <p>{summary}</p>
              </div>

              <button 
                onClick={() => setShowSummaryModal(false)}
                className="w-full mt-8 py-3 bg-tg-secondaryBg text-tg-text font-bold rounded-xl hover:bg-tg-secondaryBg/80 transition-colors"
              >
                Close
              </button>
           </div>
        </div>
      )}
    </div>
  );
}