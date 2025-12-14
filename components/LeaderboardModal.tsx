
import React, { useEffect, useState } from 'react';
import { X, Trophy, Medal, User } from 'lucide-react';
import { LeaderboardEntry } from '../types';
import { fetchLeaderboard } from '../services/gamification';

interface LeaderboardModalProps {
  onClose: () => void;
  currentUserId?: number;
}

export const LeaderboardModal: React.FC<LeaderboardModalProps> = ({ onClose, currentUserId }) => {
  const [leaders, setLeaders] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLeaderboard().then(data => {
      setLeaders(data);
      setLoading(false);
    });
  }, []);

  const getRankIcon = (rank: number) => {
    if (rank === 1) return <Trophy size={20} className="text-yellow-500 fill-yellow-500" />;
    if (rank === 2) return <Medal size={20} className="text-gray-400 fill-gray-400" />;
    if (rank === 3) return <Medal size={20} className="text-amber-700 fill-amber-700" />;
    return <span className="font-bold text-tg-hint w-5 text-center">{rank}</span>;
  };

  const getRankStyle = (rank: number) => {
    if (rank === 1) return "bg-yellow-500/10 border-yellow-500/50";
    if (rank === 2) return "bg-gray-400/10 border-gray-400/50";
    if (rank === 3) return "bg-amber-700/10 border-amber-700/50";
    return "bg-tg-bg border-tg-hint/10";
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-md animate-in fade-in duration-300 p-4">
      <div className="absolute inset-0" onClick={onClose}></div>
      
      <div className="bg-tg-bg w-full max-w-lg rounded-3xl shadow-2xl flex flex-col max-h-[85vh] relative overflow-hidden">
        
        {/* Header */}
        <div className="bg-tg-secondaryBg p-6 border-b border-tg-hint/10 flex justify-between items-center z-10">
           <div className="flex items-center gap-3">
             <div className="p-2 bg-yellow-500/20 text-yellow-600 rounded-xl">
               <Trophy size={24} />
             </div>
             <div>
               <h2 className="text-xl font-bold text-tg-text">Leaderboard</h2>
               <p className="text-xs text-tg-hint font-medium">Top Scholars</p>
             </div>
           </div>
           <button onClick={onClose} className="p-2 hover:bg-tg-button/10 rounded-full transition-colors">
             <X size={24} className="text-tg-text" />
           </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 no-scrollbar bg-tg-bg">
           {loading ? (
             <div className="flex flex-col items-center py-10 opacity-50">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-tg-button"></div>
                <p className="mt-4 text-sm">Fetching ranks...</p>
             </div>
           ) : (
             leaders.map((user) => (
               <div 
                 key={user.userId} 
                 className={`flex items-center gap-4 p-4 rounded-2xl border transition-all ${getRankStyle(user.rank)} ${user.userId === currentUserId ? 'ring-2 ring-tg-button' : ''}`}
               >
                 <div className="w-8 flex items-center justify-center shrink-0">
                    {getRankIcon(user.rank)}
                 </div>
                 
                 <div className="relative">
                    {user.photoUrl ? (
                      <img src={user.photoUrl} className="w-10 h-10 rounded-full bg-tg-secondaryBg object-cover" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-tg-button to-purple-500 flex items-center justify-center text-white font-bold">
                        {user.name[0]}
                      </div>
                    )}
                    {user.rank <= 3 && (
                      <div className="absolute -bottom-1 -right-1 text-[10px]">👑</div>
                    )}
                 </div>

                 <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-tg-text truncate">
                      {user.name} 
                      {user.userId === currentUserId && <span className="ml-2 text-[10px] bg-tg-button text-white px-1.5 py-0.5 rounded-full align-middle">YOU</span>}
                    </h3>
                    <p className="text-xs text-tg-hint">Level {user.level}</p>
                 </div>

                 <div className="text-right">
                    <div className="font-black text-tg-text">{user.xp.toLocaleString()}</div>
                    <div className="text-[10px] font-bold text-tg-hint uppercase">XP</div>
                 </div>
               </div>
             ))
           )}
        </div>
      </div>
    </div>
  );
};
