import React, { useState } from 'react';
import { SearchHistoryItem } from '../types';
import { X, Clock, Trash2, Wand2, ChevronRight, FileText, Calendar } from 'lucide-react';

interface HistoryModalProps {
  history: SearchHistoryItem[];
  onClose: () => void;
  onSelect: (item: SearchHistoryItem) => void;
  onClear: () => void;
  onDelete: (timestamp: number) => void;
}

export const HistoryModal: React.FC<HistoryModalProps> = ({ history, onClose, onSelect, onClear, onDelete }) => {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredHistory = history.filter(item => 
    item.word.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 backdrop-blur-md animate-in fade-in duration-300 p-4">
      <div className="absolute inset-0" onClick={onClose}></div>
      
      <div className="bg-tg-bg w-full max-w-lg rounded-[2rem] shadow-2xl flex flex-col max-h-[85vh] relative overflow-hidden border border-tg-hint/10">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-tg-secondaryBg to-tg-bg p-6 border-b border-tg-hint/5 flex justify-between items-center z-10">
           <div className="flex items-center gap-3">
             <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center">
               <Clock size={20} />
             </div>
             <div>
               <h2 className="text-xl font-bold text-tg-text">History</h2>
               <p className="text-xs text-tg-hint font-medium">{history.length} Discoveries</p>
             </div>
           </div>
           <button onClick={onClose} className="p-2 bg-tg-secondaryBg hover:bg-tg-hint/10 rounded-full transition-colors text-tg-hint hover:text-tg-text">
             <X size={20} />
           </button>
        </div>

        {/* Search */}
        <div className="p-4 border-b border-tg-hint/5">
           <input 
             type="text" 
             placeholder="Search history..." 
             value={searchTerm}
             onChange={(e) => setSearchTerm(e.target.value)}
             className="w-full bg-tg-secondaryBg rounded-xl px-4 py-3 text-tg-text placeholder-tg-hint outline-none border border-transparent focus:border-tg-button/30 transition-all"
           />
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 no-scrollbar bg-tg-bg/50">
           {filteredHistory.length > 0 ? (
             filteredHistory.map((item) => (
               <div 
                 key={item.timestamp}
                 className="group relative flex items-center gap-3 p-3 rounded-2xl border border-tg-hint/5 bg-tg-bg hover:border-tg-hint/20 hover:shadow-sm transition-all"
               >
                  {/* Click Area for Selection */}
                  <div 
                    className="flex-1 flex items-center gap-3 min-w-0 cursor-pointer"
                    onClick={() => onSelect(item)}
                  >
                      {/* Icon / Date */}
                      <div className="flex flex-col items-center justify-center w-12 h-12 rounded-xl bg-tg-secondaryBg text-tg-hint shrink-0">
                        <span className="text-xs font-bold uppercase">{new Date(item.timestamp).getDate()}</span>
                        <span className="text-[10px] uppercase">{new Intl.DateTimeFormat('en-US', { month: 'short' }).format(new Date(item.timestamp))}</span>
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-bold text-lg text-tg-text capitalize truncate">{item.word}</h3>
                            {item.summary && (
                              <div className="bg-purple-500/10 text-purple-600 px-1.5 py-0.5 rounded text-[10px] font-bold flex items-center gap-0.5 shrink-0" title="Summary Saved">
                                <Wand2 size={8} /> AI
                              </div>
                            )}
                        </div>
                        <p className="text-xs text-tg-hint truncate">
                            {item.data ? item.data.definition : 'Quick Search'}
                        </p>
                      </div>
                  </div>

                  {/* Actions Area */}
                  <div className="flex items-center gap-1 border-l border-tg-hint/10 pl-2">
                     <button 
                       onClick={() => onSelect(item)}
                       className="p-2 text-tg-hint/50 hover:text-tg-button transition-colors md:hidden"
                     >
                        <ChevronRight size={20} />
                     </button>
                     
                     <button 
                        onClick={(e) => { e.stopPropagation(); onDelete(item.timestamp); }}
                        className="p-2 rounded-lg text-tg-hint/40 hover:text-red-500 hover:bg-red-500/10 transition-colors"
                        title="Delete"
                      >
                         <Trash2 size={18} />
                      </button>
                  </div>
               </div>
             ))
           ) : (
             <div className="flex flex-col items-center justify-center h-64 text-tg-hint opacity-60 text-center p-8">
               <Clock size={48} className="mb-4 opacity-20" />
               <p className="text-sm font-medium">No history found.</p>
               {searchTerm && <p className="text-xs mt-2">Try a different search term.</p>}
             </div>
           )}
        </div>

        {/* Footer */}
        {history.length > 0 && (
          <div className="p-4 border-t border-tg-hint/5 bg-tg-bg/50 backdrop-blur-sm">
             <button 
               onClick={() => {
                 if(confirm('Are you sure you want to clear your entire history?')) onClear();
               }}
               className="w-full py-3 rounded-xl border border-red-500/20 text-red-500 hover:bg-red-500/5 font-bold transition-colors text-sm flex items-center justify-center gap-2"
             >
               <Trash2 size={16} /> Clear All History
             </button>
          </div>
        )}
      </div>
    </div>
  );
};