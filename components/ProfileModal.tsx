import React from 'react';
import { UserStats, LevelInfo, Badge, TelegramWebApp } from '../types';
import { BADGES, getLevelInfo } from '../services/gamification';
import { X, Trophy, Share2, Crown, Zap, Shield, Flame, BookOpen, Map, Anchor, Search, Lock } from 'lucide-react';

interface ProfileModalProps {
  stats: UserStats;
  onClose: () => void;
  onShowLeaderboard: () => void;
}

const IconMap: Record<string, React.FC<any>> = {
  Search, Map, BookOpen, Anchor, Share2, Flame, Trophy, Crown, Zap, Shield
};

export const ProfileModal: React.FC<ProfileModalProps> = ({ stats, onClose, onShowLeaderboard }) => {
  const levelInfo = getLevelInfo(stats.xp);
  const progress = Math.min(100, Math.max(0, ((stats.xp - levelInfo.minXP) / (levelInfo.nextLevelXP - levelInfo.minXP)) * 100));

  const handleShareStats = () => {
    if (window.Telegram?.WebApp) {
      const tg = window.Telegram.WebApp as TelegramWebApp;
      tg.HapticFeedback.impactOccurred('heavy');
      
      const badgeCount = stats.badges.length;
      const text = `🏆 I am a Level ${stats.level} ${levelInfo.title} on Ety.ai!\n\n✨ ${stats.wordsDiscovered} Words Discovered\n🔥 ${stats.currentStreak} Day Streak\n🎖 ${badgeCount} Badges Earned`;
      
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
             <div className="absolute top-0 right-0 w-64 h-64 bg-purple-500/20 rounded-full blur-[80px] -mr-16 -mt-16 pointer-events-none"></div>
             
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
             
             {/* XP Progress Card */}
             <div className="bg-tg-bg/80 backdrop-blur-xl rounded-3xl p-5 shadow-xl border border-tg-hint/10">
                <div className="flex justify-between items-end mb-3">
                   <div className="text-xs font-bold text-tg-hint uppercase tracking-wider">Progress to Lvl {stats.level + 1}</div>
                   <div className="text-xs font-bold text-tg-button">{Math.floor(levelInfo.nextLevelXP - stats.xp)} XP Left</div>
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

             {/* Stats Grid */}
             <div className="grid grid-cols-3 gap-3">
                <StatTile icon={BookOpen} value={stats.wordsDiscovered} label="Words" color="text-blue-500" bg="bg-blue-500/10" />
                <StatTile icon={Flame} value={stats.currentStreak} label="Streak" color="text-orange-500" bg="bg-orange-500/10" />
                <StatTile icon={Share2} value={stats.shares} label="Shares" color="text-pink-500" bg="bg-pink-500/10" />
             </div>

             {/* Badges Section */}
             <div>
                <div className="flex items-center justify-between mb-4 px-1">
                   <h3 className="font-bold text-tg-text flex items-center gap-2 text-lg">
                     <Shield size={18} className="text-purple-500" />
                     Achievements
                   </h3>
                   <span className="text-xs font-bold bg-tg-secondaryBg text-tg-hint px-2 py-1 rounded-lg">
                     {stats.badges.length} / {Object.keys(BADGES).length}
                   </span>
                </div>
                
                <div className="grid grid-cols-2 gap-3">
                   {Object.values(BADGES).map((badge) => {
                      const isUnlocked = stats.badges.includes(badge.id);
                      const Icon = IconMap[badge.icon] || Shield;

                      return (
                        <div 
                          key={badge.id}
                          className={`relative group overflow-hidden p-4 rounded-2xl border transition-all duration-300 ${
                            isUnlocked 
                              ? 'bg-gradient-to-br from-tg-bg to-tg-secondaryBg border-tg-hint/10 shadow-sm' 
                              : 'bg-tg-secondaryBg/50 border-transparent opacity-60 grayscale'
                          }`}
                        >
                           {isUnlocked && (
                             <div className={`absolute top-0 right-0 w-16 h-16 bg-gradient-to-br ${badge.color} opacity-10 rounded-full blur-xl -mr-6 -mt-6`}></div>
                           )}
                           
                           <div className="flex items-start gap-3">
                              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-sm ${
                                isUnlocked 
                                  ? `bg-gradient-to-br ${badge.color} text-white` 
                                  : 'bg-tg-hint/20 text-tg-hint'
                              }`}>
                                 {isUnlocked ? <Icon size={18} /> : <Lock size={16} />}
                              </div>
                              <div className="min-w-0">
                                 <div className="font-bold text-sm text-tg-text truncate leading-tight mb-1">{badge.name}</div>
                                 <div className="text-[10px] text-tg-hint leading-tight line-clamp-2">
                                   {isUnlocked ? badge.description : 'Locked'}
                                 </div>
                              </div>
                           </div>
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
    </div>
  );
};

const StatTile = ({ icon: Icon, value, label, color, bg }: any) => (
  <div className="bg-tg-bg rounded-2xl p-3 border border-tg-hint/10 shadow-sm flex flex-col items-center justify-center gap-1 group hover:border-tg-hint/20 transition-colors">
     <div className={`p-2 rounded-full ${bg} ${color} mb-1 group-hover:scale-110 transition-transform`}>
        <Icon size={18} />
     </div>
     <div className="font-black text-xl text-tg-text">{value}</div>
     <div className="text-[10px] uppercase font-bold text-tg-hint/80 tracking-wide">{label}</div>
  </div>
);