import React, { useEffect, useState } from 'react';
import { X, Trophy, Medal, Crown, Star } from 'lucide-react';
import { LeaderboardEntry, TelegramUser, UserStats } from '../types';
import { fetchLeaderboard } from '../services/gamification';

interface LeaderboardModalProps {
  onClose: () => void;
  currentUser: TelegramUser | null;
  currentStats: UserStats;
}

export const LeaderboardModal: React.FC<LeaderboardModalProps> = ({ onClose, currentUser, currentStats }) => {
  const [leaders, setLeaders] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLeaderboard(currentUser, currentStats).then(data => {
      setLeaders(data);
      setLoading(false);
    });
  }, [currentUser, currentStats]);

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 backdrop-blur-md animate-in fade-in duration-300 p-4">
      <div className="absolute inset-0" onClick={onClose}></div>
      
      <div className="bg-tg-bg w-full max-w-lg rounded-[2rem] shadow-2xl flex flex-col max-h-[85vh] relative overflow-hidden">
        
        {/* --- HEADER --- */}
        <div className="bg-gradient-to-r from-tg-secondaryBg to-tg-bg p-6 border-b border-tg-hint/5 flex justify-between items-center z-10">
           <div className="flex items-center gap-4">
             <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center text-white shadow-lg shadow-orange-500/20">
               <Trophy size={24} fill="currentColor" />
             </div>
             <div>
               <h2 className="text-xl font-bold text-tg-text">Leaderboard</h2>
               <p className="text-xs text-tg-hint font-medium uppercase tracking-wider">Top Scholars</p>
             </div>
           </div>
           <button onClick={onClose} className="p-2 bg-tg-secondaryBg hover:bg-tg-hint/10 rounded-full transition-colors text-tg-hint hover:text-tg-text">
             <X size={20} />
           </button>
        </div>

        {/* --- LIST --- */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 no-scrollbar bg-tg-bg/50">
           {loading ? (
             <div className="flex flex-col items-center justify-center h-48 opacity-50 space-y-4">
                <div className="animate-spin rounded-full h-10 w-10 border-4 border-tg-button border-t-transparent"></div>
                <p className="text-sm font-medium">Calculating ranks...</p>
             </div>
           ) : (
             <>
               {/* Top 3 Podium Highlights (if available) */}
               {leaders.length > 0 && (
                 <div className="grid grid-cols-3 gap-2 mb-4">
                    {/* 2nd Place */}
                    {leaders[1] && <PodiumCard entry={leaders[1]} place={2} isMe={leaders[1].userId === currentUser?.id} />}
                    {/* 1st Place */}
                    {leaders[0] && <PodiumCard entry={leaders[0]} place={1} isMe={leaders[0].userId === currentUser?.id} />}
                    {/* 3rd Place */}
                    {leaders[2] && <PodiumCard entry={leaders[2]} place={3} isMe={leaders[2].userId === currentUser?.id} />}
                 </div>
               )}

               {/* Rest of the list */}
               <div className="space-y-2">
                 {leaders.slice(3).map((user) => (
                   <div 
                     key={user.userId} 
                     className={`flex items-center gap-4 p-3 rounded-2xl border transition-all ${
                       user.userId === currentUser?.id 
                        ? 'bg-tg-button/5 border-tg-button/30 shadow-sm' 
                        : 'bg-tg-bg border-tg-hint/5 hover:border-tg-hint/20'
                     }`}
                   >
                     <div className="w-8 font-bold text-tg-hint text-center text-sm">#{user.rank}</div>
                     
                     <div className="relative">
                        {user.photoUrl ? (
                          <img src={user.photoUrl} className="w-10 h-10 rounded-full bg-tg-secondaryBg object-cover ring-2 ring-white dark:ring-black" />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-tg-button to-purple-500 flex items-center justify-center text-white font-bold text-xs ring-2 ring-white dark:ring-black">
                            {user.name[0]}
                          </div>
                        )}
                     </div>

                     <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-tg-text text-sm truncate max-w-[120px]">{user.name}</h3>
                          {user.userId === currentUser?.id && <span className="text-[10px] font-bold bg-tg-button text-white px-1.5 rounded-full">YOU</span>}
                        </div>
                        <p className="text-[10px] text-tg-hint font-medium">Lvl {user.level} Scholar</p>
                     </div>

                     <div className="text-right bg-tg-secondaryBg px-3 py-1.5 rounded-lg min-w-[70px]">
                        <div className="font-black text-tg-text text-sm">{user.xp.toLocaleString()}</div>
                        <div className="text-[8px] font-bold text-tg-hint uppercase">XP</div>
                     </div>
                   </div>
                 ))}
               </div>
             </>
           )}
           
           {!loading && leaders.length === 0 && (
              <div className="text-center py-10 text-tg-hint">
                 <p>No explorers found yet.</p>
              </div>
           )}
        </div>
      </div>
    </div>
  );
};

const PodiumCard = ({ entry, place, isMe }: { entry: LeaderboardEntry, place: number, isMe: boolean }) => {
  const allStyles: Record<number, any> = {
    1: { bg: 'bg-yellow-500/10 border-yellow-500/30', text: 'text-yellow-600', crown: 'text-yellow-500', height: 'h-40' },
    2: { bg: 'bg-gray-400/10 border-gray-400/30', text: 'text-gray-500', crown: 'text-gray-400', height: 'h-36' },
    3: { bg: 'bg-amber-700/10 border-amber-700/30', text: 'text-amber-700', crown: 'text-amber-700', height: 'h-32' }
  };

  const styles = allStyles[place] || allStyles[3];

  return (
    <div className={`flex flex-col items-center justify-end rounded-2xl border ${styles.bg} ${styles.height} p-2 relative ${place === 1 ? 'order-2' : place === 2 ? 'order-1' : 'order-3'}`}>
      {place === 1 && (
        <div className="absolute -top-3">
          <Crown size={24} className="text-yellow-500 fill-yellow-500 animate-bounce" />
        </div>
      )}
      
      <div className="relative mb-2">
        {entry.photoUrl ? (
          <img src={entry.photoUrl} className={`w-12 h-12 rounded-full object-cover ring-2 ${place === 1 ? 'ring-yellow-500' : 'ring-tg-bg'}`} />
        ) : (
          <div className={`w-12 h-12 rounded-full bg-gradient-to-br from-tg-button to-purple-500 flex items-center justify-center text-white font-bold ring-2 ${place === 1 ? 'ring-yellow-500' : 'ring-tg-bg'}`}>
            {entry.name[0]}
          </div>
        )}
        <div className={`absolute -bottom-2 left-1/2 -translate-x-1/2 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white shadow-sm ${place === 1 ? 'bg-yellow-500' : place === 2 ? 'bg-gray-400' : 'bg-amber-700'}`}>
          {place}
        </div>
      </div>

      <div className="text-center w-full">
        <div className="font-bold text-xs truncate w-full px-1">{isMe ? 'You' : entry.name.split(' ')[0]}</div>
        <div className={`font-black text-sm ${styles.text}`}>{entry.xp}</div>
      </div>
    </div>
  );
};