import React, { useState } from 'react';
import { UserStats, Badge, TelegramWebApp } from '../types';
import { getLevelInfo, BADGE_MAP, getNextBadgeForCategory } from '../services/gamification';
import { X, Trophy, Share2, Crown, Zap, Shield, Flame, BookOpen, Anchor, Lock, ArrowRight } from 'lucide-react';

interface ProfileModalProps {
  stats: UserStats;
  onClose: () => void;
  onShowLeaderboard: () => void;
}

const IconMap: Record<string, React.FC<any>> = {
  BookOpen, Anchor, Share2, Flame
};

// Order of display
const CATEGORIES = [
  { key: 'SCHOLAR', label: 'Discoveries' },
  { key: 'VISIONARY', label: 'Deep Dives' },
  { key: 'AMBASSADOR', label: 'Shares' },
  { key: 'DEVOTEE', label: 'Streak' }
];

export const ProfileModal: React.FC<ProfileModalProps> = ({ stats, onClose, onShowLeaderboard }) => {
  const [selectedBadge, setSelectedBadge] = useState<Badge | null>(null);
  
  const levelInfo = getLevelInfo(stats.xp);
  const progress = Math.min(100, Math.max(0, ((stats.xp - levelInfo.minXP) / (levelInfo.nextLevelXP - levelInfo.minXP)) * 100));

  const handleShareStats = () => {
    if (window.Telegram?.WebApp) {
      const tg = window.Telegram.WebApp as TelegramWebApp;
      tg.HapticFeedback.impactOccurred('heavy');
      
      const badgeCount = stats.badges.length;
      const text = `🏆 I am a Level ${stats.level} ${levelInfo.title} on Ety.ai!\n\n✨ ${stats.wordsDiscovered} Words Discovered\n🔥 ${stats.currentStreak} Day Streak\n🎖 ${badgeCount} Achievements`;
      
      try {
        tg.switchInlineQuery(text, ['users', 'groups', 'channels']);
      } catch (e) {
        console.warn(e);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end md:items-center justify-center bg-black/70 backdrop-blur-lg animate-in fade-in duration-300">
       <div className="absolute inset-0" onClick={onClose}></div>
       
       <div className="bg-tg-bg w-full max-w-md md:max-w-lg rounded-t-[2.5rem] md:rounded-3xl shadow-2xl animate-in slide-in-from-bottom duration-300 relative max-h-[92vh] overflow-y-auto no-scrollbar flex flex-col">
          
          {/* --- HERO HEADER --- */}
          <div className="relative overflow-hidden bg-gradient-to-br from-[#1c1c1e] to-[#2c2c2e] dark:from-[#000] dark:to-[#1a1a1a] text-white p-8 pt-12 pb-16 rounded-b-[3rem] shadow-lg shrink-0">
             {/* Dynamic Background */}
             <div className="absolute top-[-50%] left-[-50%] w-[200%] h-[200%] bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-indigo-500/20 via-transparent to-transparent animate-spin-slow pointer-events-none"></div>
             
             {/* Close Button */}
             <button 
                onClick={onClose}
                className="absolute top-5 right-5 p-2 bg-white/10 hover:bg-white/20 rounded-full text-white/80 hover:text-white transition-colors backdrop-blur-md z-20 border border-white/5"
              >
                <X size={20} />
              </button>

             <div className="flex flex-col items-center relative z-10">
                {/* Avatar Ring */}
                <div className="relative mb-6 group">
                  <div className="absolute -inset-1 bg-gradient-to-r from-yellow-400 via-orange-500 to-purple-600 rounded-full blur opacity-75 group-hover:opacity-100 transition duration-1000 group-hover:duration-200 animate-tilt"></div>
                  <div className="relative w-28 h-28 bg-[#1a1a1a] rounded-full flex items-center justify-center shadow-2xl border-[4px] border-[#1a1a1a]">
                     <span className="text-5xl font-black bg-clip-text text-transparent bg-gradient-to-br from-white to-white/60 drop-shadow-sm">{stats.level}</span>
                  </div>
                  <div className="absolute -bottom-3 -right-3 bg-gradient-to-r from-amber-300 to-yellow-500 text-amber-950 text-[10px] font-black tracking-widest px-3 py-1.5 rounded-full border-2 border-[#1a1a1a] shadow-lg flex items-center gap-1">
                     <Crown size={12} fill="currentColor" />
                     LVL
                  </div>
                </div>
                
                <h2 className="text-3xl font-bold font-serif text-center bg-clip-text text-transparent bg-gradient-to-b from-white to-white/70 mb-1">
                  {levelInfo.title}
                </h2>
                
                <div className="flex items-center gap-2 mt-1 px-4 py-1 rounded-full bg-white/5 border border-white/10 backdrop-blur-sm">
                   <Zap size={14} className="text-yellow-400 fill-yellow-400" />
                   <span className="text-sm font-semibold text-white/90 tracking-wide">{stats.xp.toLocaleString()} XP</span>
                </div>
             </div>
          </div>

          {/* --- CONTENT BODY --- */}
          <div className="px-6 -mt-10 relative z-20 flex-1 pb-8 space-y-6">
             
             {/* XP Progress */}
             <div className="bg-tg-bg/80 backdrop-blur-xl rounded-3xl p-5 shadow-xl border border-tg-hint/10">
                <div className="flex justify-between items-end mb-3">
                   <div className="text-xs font-bold text-tg-hint uppercase tracking-wider">Progress to Lvl {stats.level + 1}</div>
                   <div className="text-xs font-bold text-tg-button">{Math.floor(levelInfo.nextLevelXP - stats.xp).toLocaleString()} XP Left</div>
                </div>
                <div className="h-5 bg-tg-secondaryBg rounded-full overflow-hidden border border-tg-hint/5 relative shadow-inner">
                   <div 
                     className="h-full bg-gradient-to-r from-yellow-400 via-orange-500 to-amber-500 transition-all duration-1000 ease-out rounded-full relative shadow-[0_0_10px_rgba(245,158,11,0.5)]"
                     style={{ width: `${progress}%` }}
                   >
                      <div className="absolute inset-0 bg-white/30 animate-[shimmer_2s_infinite] skew-x-12"></div>
                   </div>
                </div>
             </div>

             {/* Dynamic Achievements List */}
             <div>
                <div className="flex items-center justify-between mb-4 px-1">
                   <h3 className="font-bold text-tg-text flex items-center gap-2 text-lg">
                     <Shield size={18} className="text-purple-500" />
                     Achievements
                   </h3>
                   <span className="text-xs font-bold bg-tg-secondaryBg text-tg-hint px-2 py-1 rounded-lg">
                     {stats.badges.length}
                   </span>
                </div>
                
                <div className="space-y-4">
                   {CATEGORIES.map(cat => {
                     // 1. Get Highest Unlocked Badge for this Category
                     const unlockedInCat = stats.badges
                        .map(id => BADGE_MAP[id])
                        .filter(b => b && b.category === cat.key)
                        .sort((a, b) => b.tier - a.tier); // Descending

                     const currentBadge = unlockedInCat[0];
                     
                     // 2. Get Next Locked Badge
                     const nextBadge = getNextBadgeForCategory(cat.key, stats.badges);

                     // Decide what to show: The highest unlocked badge OR the next locked one
                     // If no unlocked, show next locked (Tier 1). If all unlocked (rare), show highest.
                     const displayBadge = nextBadge || currentBadge;
                     const isUnlocked = currentBadge && displayBadge && currentBadge.id === displayBadge.id;
                     
                     if (!displayBadge) return null;

                     const Icon = IconMap[displayBadge.icon] || Shield;
                     const currentVal = (displayBadge.statKey ? stats[displayBadge.statKey] : 0) as number;
                     const threshold = displayBadge.threshold || 1;
                     const percentage = Math.min(100, Math.round((currentVal / threshold) * 100));

                     return (
                        <div key={cat.key}>
                           <div className="text-[10px] font-bold text-tg-hint uppercase tracking-wider mb-2 ml-1">{cat.label}</div>
                           
                           {/* Render Current Highest Badge if exists */}
                           {isUnlocked && (
                             <button 
                               onClick={() => setSelectedBadge(currentBadge)}
                               className="w-full relative group overflow-hidden p-4 rounded-2xl border transition-all duration-300 bg-gradient-to-br from-tg-bg to-tg-secondaryBg border-tg-hint/10 shadow-sm flex items-center gap-4 mb-2"
                             >
                                <div className={`absolute top-0 right-0 w-16 h-16 bg-gradient-to-br ${currentBadge.color} opacity-10 rounded-full blur-xl -mr-6 -mt-6`}></div>
                                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-sm bg-gradient-to-br ${currentBadge.color} text-white`}>
                                   <Icon size={20} />
                                </div>
                                <div className="text-left flex-1">
                                   <div className="font-bold text-tg-text">{currentBadge.name}</div>
                                   <div className="text-xs text-tg-hint">{currentBadge.description}</div>
                                </div>
                                <ArrowRight size={16} className="text-tg-hint/30" />
                             </button>
                           )}

                           {/* Render Next Target (Locked) */}
                           {!isUnlocked && nextBadge && (
                             <button 
                               onClick={() => setSelectedBadge(nextBadge)}
                               className="w-full p-4 rounded-2xl border border-dashed border-tg-hint/20 bg-tg-secondaryBg/30 flex items-center gap-4 relative overflow-hidden active:scale-95 transition-transform text-left"
                             >
                                <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 bg-tg-secondaryBg text-tg-hint">
                                   <Lock size={18} />
                                </div>
                                <div className="flex-1 min-w-0">
                                   <div className="flex justify-between items-center mb-1">
                                      <div className="font-bold text-tg-text/70 text-sm">Next: {nextBadge.name}</div>
                                      <div className="text-[10px] font-mono font-bold text-tg-hint">{currentVal}/{threshold}</div>
                                   </div>
                                   <div className="h-2 bg-tg-hint/10 rounded-full overflow-hidden">
                                      <div className="h-full bg-tg-button/50" style={{ width: `${percentage}%` }}></div>
                                   </div>
                                   <div className="text-[10px] text-tg-button mt-1 font-medium">
                                     +{nextBadge.xpReward} XP Reward
                                   </div>
                                </div>
                             </button>
                           )}
                           
                           {/* If we have unlocked one, but there is a next one, show a small "Next Target" preview below */}
                           {isUnlocked && nextBadge && (
                              <div className="pl-16 pr-2">
                                <div className="flex items-center gap-2 text-xs text-tg-hint">
                                   <span className="w-1.5 h-1.5 rounded-full bg-tg-hint/30"></span>
                                   <span>Next: <strong>{nextBadge.name}</strong> at {nextBadge.threshold} (+{nextBadge.xpReward} XP)</span>
                                </div>
                              </div>
                           )}
                        </div>
                     );
                   })}
                </div>
             </div>

             {/* Footer Actions */}
             <div className="pt-2 pb-6 space-y-3">
               <button 
                 onClick={onShowLeaderboard}
                 className="w-full py-4 bg-tg-secondaryBg text-tg-text hover:bg-tg-button/10 rounded-2xl font-bold border border-tg-hint/10 flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
               >
                 <Trophy size={18} className="text-yellow-500" />
                 Global Leaderboard
               </button>
             
               <button 
                 onClick={handleShareStats}
                 className="w-full py-4 bg-gradient-to-r from-tg-button to-blue-600 text-white rounded-2xl font-bold shadow-lg shadow-blue-500/20 flex items-center justify-center gap-2 transition-all active:scale-[0.98] hover:shadow-blue-500/30"
               >
                 <Share2 size={18} />
                 Share Profile
               </button>
             </div>
          </div>
       </div>

       {/* --- BADGE DETAIL POPUP --- */}
       {selectedBadge && (() => {
         const isUnlocked = stats.badges.includes(selectedBadge.id);
         const Icon = IconMap[selectedBadge.icon] || Shield;
         const currentVal = (selectedBadge.statKey ? stats[selectedBadge.statKey] : 0) as number;
         const threshold = selectedBadge.threshold || 1;
         const currentProgress = Math.min(currentVal, threshold);
         
         return (
           <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
               <div className="absolute inset-0" onClick={() => setSelectedBadge(null)}></div>
               
               <div className="bg-tg-bg w-full max-w-xs rounded-3xl p-6 shadow-2xl transform transition-all scale-100 relative overflow-hidden border border-tg-hint/10 animate-in zoom-in-95 duration-200">
                   {/* Background Effects */}
                   {isUnlocked && (
                       <div className={`absolute top-0 inset-x-0 h-32 bg-gradient-to-b ${selectedBadge.color} opacity-20 blur-xl -mt-10`}></div>
                   )}
      
                   <button 
                       onClick={() => setSelectedBadge(null)}
                       className="absolute top-4 right-4 p-2 bg-tg-secondaryBg/80 rounded-full text-tg-hint hover:text-tg-text transition-colors z-20 backdrop-blur-sm"
                   >
                       <X size={16} />
                   </button>
      
                   <div className="flex flex-col items-center relative z-10 space-y-4">
                       <div className={`w-24 h-24 rounded-3xl flex items-center justify-center shadow-lg mb-2 ${
                           isUnlocked 
                           ? `bg-gradient-to-br ${selectedBadge.color} text-white` 
                           : 'bg-tg-secondaryBg text-tg-hint'
                       }`}>
                           {isUnlocked ? <Icon size={48} /> : <Lock size={40} />}
                       </div>
      
                       <div className="text-center w-full">
                           <h3 className="text-2xl font-bold text-tg-text mb-2">{selectedBadge.name}</h3>
                           
                           <div className={`inline-block px-3 py-1 rounded-full text-xs font-black uppercase tracking-widest mb-4 border ${
                               isUnlocked 
                               ? 'bg-green-500/10 text-green-600 border-green-500/20' 
                               : 'bg-tg-secondaryBg text-tg-hint border-tg-hint/10'
                           }`}>
                               {isUnlocked ? 'Unlocked' : `${currentProgress} / ${threshold}`}
                           </div>
                           
                           <div className="bg-tg-secondaryBg/50 p-4 rounded-2xl border border-tg-hint/5">
                             <p className="text-tg-text/90 leading-relaxed text-sm font-medium">
                                 {selectedBadge.description}
                             </p>
                           </div>
                           
                           {/* XP Reward Note */}
                           <div className="mt-4 flex items-center justify-center gap-1 text-xs font-bold text-tg-button">
                              <Zap size={12} fill="currentColor" />
                              <span>{selectedBadge.xpReward} XP Reward</span>
                           </div>
                       </div>
                   </div>
               </div>
           </div>
         );
       })()}
    </div>
  );
};