import React from 'react';
import { UserStats, LevelInfo, Badge, TelegramWebApp } from '../types';
import { BADGES, getLevelInfo } from '../services/gamification';
import { X, Trophy, Share2, Crown, Zap, Shield, Flame, BookOpen, Map, Anchor, Search } from 'lucide-react';

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
    <div className="fixed inset-0 z-[100] flex items-end md:items-center justify-center bg-black/60 backdrop-blur-md animate-in fade-in duration-300 p-0 md:p-4">
       <div className="absolute inset-0" onClick={onClose}></div>
       
       <div className="bg-tg-bg w-full max-w-md md:max-w-lg rounded-t-[2rem] md:rounded-3xl shadow-2xl animate-in slide-in-from-bottom duration-300 relative border-t md:border border-white/20 dark:border-white/5 max-h-[90vh] overflow-y-auto no-scrollbar">
          
          {/* Header */}
          <div className="relative overflow-hidden bg-gradient-to-br from-tg-button to-purple-600 p-8 text-white">
             <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none"></div>
             
             <button 
                onClick={onClose}
                className="absolute top-6 right-6 p-2 bg-white/20 hover:bg-white/30 rounded-full text-white transition-colors backdrop-blur-md z-10"
              >
                <X size={20} />
              </button>

             <div className="flex flex-col items-center relative z-10">
                <div className="relative mb-4">
                  <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center shadow-lg border-4 border-white/30">
                     <span className="text-4xl font-black text-tg-button">{stats.level}</span>
                  </div>
                  <div className="absolute -bottom-2 -right-2 bg-amber-400 text-amber-900 text-xs font-bold px-2 py-1 rounded-full border-2 border-white shadow-sm flex items-center gap-1">
                     <Crown size={12} fill="currentColor" />
                     LVL
                  </div>
                </div>
                
                <h2 className="text-2xl font-bold font-serif">{levelInfo.title}</h2>
                <div className="flex items-center gap-2 mt-2 opacity-90 text-sm font-medium">
                   <Zap size={14} className="text-yellow-300" fill="currentColor" />
                   <span>{stats.xp} Total XP</span>
                </div>
             </div>
          </div>

          {/* Progress Section */}
          <div className="px-8 pt-8 pb-4">
             <div className="flex justify-between text-xs font-bold text-tg-hint uppercase tracking-wider mb-2">
                <span>Level {stats.level}</span>
                <span>Level {stats.level + 1}</span>
             </div>
             <div className="h-4 bg-tg-secondaryBg rounded-full overflow-hidden border border-tg-hint/10 relative">
                <div 
                  className="h-full bg-gradient-to-r from-tg-button to-purple-500 transition-all duration-1000 ease-out rounded-full relative"
                  style={{ width: `${progress}%` }}
                >
                   <div className="absolute inset-0 bg-white/20 animate-[shimmer_2s_infinite]"></div>
                </div>
             </div>
             <p className="text-center text-xs text-tg-hint mt-2">
               {Math.floor(levelInfo.nextLevelXP - stats.xp)} XP to next rank
             </p>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-3 gap-4 px-8 py-4">
             <div className="bg-tg-secondaryBg rounded-xl p-3 text-center border border-tg-hint/10">
                <div className="text-tg-button mb-1 flex justify-center"><BookOpen size={20} /></div>
                <div className="font-black text-xl text-tg-text">{stats.wordsDiscovered}</div>
                <div className="text-[10px] uppercase font-bold text-tg-hint">Words</div>
             </div>
             <div className="bg-tg-secondaryBg rounded-xl p-3 text-center border border-tg-hint/10">
                <div className="text-orange-500 mb-1 flex justify-center"><Flame size={20} /></div>
                <div className="font-black text-xl text-tg-text">{stats.currentStreak}</div>
                <div className="text-[10px] uppercase font-bold text-tg-hint">Day Streak</div>
             </div>
             <div className="bg-tg-secondaryBg rounded-xl p-3 text-center border border-tg-hint/10">
                <div className="text-pink-500 mb-1 flex justify-center"><Share2 size={20} /></div>
                <div className="font-black text-xl text-tg-text">{stats.shares}</div>
                <div className="text-[10px] uppercase font-bold text-tg-hint">Shares</div>
             </div>
          </div>

          {/* Badges Section */}
          <div className="px-8 py-4">
             <h3 className="font-bold text-tg-text mb-4 flex items-center gap-2">
               <Trophy size={18} className="text-yellow-500" />
               Badges ({stats.badges.length})
             </h3>
             
             <div className="grid grid-cols-1 gap-3">
                {Object.values(BADGES).map((badge) => {
                   const isUnlocked = stats.badges.includes(badge.id);
                   const Icon = IconMap[badge.icon] || Shield;

                   return (
                     <div 
                       key={badge.id}
                       className={`flex items-center gap-4 p-3 rounded-2xl border transition-all ${
                         isUnlocked 
                           ? 'bg-tg-bg border-tg-hint/10 shadow-sm opacity-100' 
                           : 'bg-tg-secondaryBg border-transparent opacity-50 grayscale'
                       }`}
                     >
                        <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${isUnlocked ? badge.color : 'bg-gray-200 dark:bg-gray-700 text-gray-400'}`}>
                           <Icon size={20} />
                        </div>
                        <div>
                           <div className="font-bold text-tg-text flex items-center gap-2">
                             {badge.name}
                             {isUnlocked && <CheckBadge />}
                           </div>
                           <div className="text-xs text-tg-hint font-medium">{badge.description}</div>
                        </div>
                     </div>
                   );
                })}
             </div>
          </div>

          {/* Social Leaderboard Action */}
          <div className="p-8 pt-4">
            <button 
              onClick={onShowLeaderboard}
              className="w-full mb-3 py-4 bg-tg-secondaryBg text-tg-text hover:bg-tg-button/10 rounded-xl font-bold text-lg border border-tg-hint/10 flex items-center justify-center gap-2 transition-transform active:scale-[0.98]"
            >
              <Trophy size={20} className="text-yellow-500" />
              View Global Leaderboard
            </button>
          
            <button 
              onClick={handleShareStats}
              className="w-full py-4 bg-gradient-to-r from-yellow-400 to-orange-500 hover:from-yellow-500 hover:to-orange-600 text-white rounded-xl font-bold text-lg shadow-lg shadow-orange-500/20 flex items-center justify-center gap-2 transition-transform active:scale-[0.98]"
            >
              <Share2 size={20} />
              Share Stats to Group
            </button>
            <p className="text-center text-xs text-tg-hint mt-3 opacity-70">
              Challenge your friends to beat your Etymology Rank!
            </p>
          </div>
       </div>
    </div>
  );
};

const CheckBadge = () => (
  <svg className="w-4 h-4 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
  </svg>
);