import React, { useState, useEffect, useRef } from 'react';
import { Search, X, Clock, ArrowRight, CornerDownLeft } from 'lucide-react';
import { SearchHistoryItem } from '../types';

interface SearchBarProps {
  onSearch: (term: string) => void;
  isLoading: boolean;
  history: SearchHistoryItem[];
  onHistorySelect: (term: string) => void;
}

export const SearchBar: React.FC<SearchBarProps> = ({ onSearch, isLoading, history, onHistorySelect }) => {
  const [query, setQuery] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Filter history based on input
  const filteredHistory = query 
    ? history.filter(item => item.word.toLowerCase().includes(query.toLowerCase())).slice(0, 5) // Top 5 matches
    : history;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      onSearch(query.trim());
      inputRef.current?.blur();
      setIsFocused(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
  };

  return (
    <div className="relative z-50 group">
      {/* Search Input Container */}
      <form onSubmit={handleSubmit} className="relative z-10">
        <div className={`
          flex items-center gap-3 bg-tg-bg rounded-2xl px-4 py-4
          border transition-all duration-300 ease-out
          ${isFocused 
            ? 'border-tg-button shadow-glow scale-[1.01]' 
            : 'border-tg-hint/20 shadow-soft hover:border-tg-hint/40'
          }
        `}>
          <Search 
            size={22} 
            className={`transition-colors duration-300 ${isFocused ? 'text-tg-button' : 'text-tg-hint'}`} 
          />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={handleChange}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setTimeout(() => setIsFocused(false), 200)}
            placeholder="Search"
            className="bg-transparent border-none outline-none w-full text-tg-text placeholder-tg-hint/60 text-lg font-medium"
            autoComplete="off"
            autoCapitalize="off"
          />
          
          <div className="flex items-center gap-2">
            {query && (
              <button 
                type="button" 
                onClick={() => { setQuery(''); inputRef.current?.focus(); }}
                className="p-1 rounded-full bg-tg-hint/10 text-tg-hint hover:bg-tg-hint/20 hover:text-tg-text transition-colors"
              >
                <X size={16} />
              </button>
            )}
          </div>
        </div>
      </form>

      {/* Dropdown Suggestions / History */}
      {isFocused && (filteredHistory.length > 0 || query) && (
        <div className="absolute top-full left-0 right-0 mt-3 bg-tg-bg/95 backdrop-blur-xl shadow-2xl rounded-2xl border border-tg-hint/10 p-2 max-h-[60vh] overflow-y-auto animate-in fade-in slide-in-from-top-2 z-20 no-scrollbar">
          
          {filteredHistory.length > 0 && (
            <div className="md:px-1">
               <div className="flex items-center justify-between text-tg-hint text-xs font-bold uppercase tracking-wider mb-2 mt-2 px-3">
                 <span className="flex items-center gap-1.5">
                    {query ? <Search size={12} /> : <Clock size={12} />} 
                    {query ? 'History Matches' : 'Recent'}
                 </span>
               </div>
               <div className="space-y-1">
                 {filteredHistory.map((item) => (
                   <button
                     key={item.timestamp}
                     onClick={(e) => {
                       e.preventDefault();
                       setQuery(item.word);
                       onHistorySelect(item.word);
                       setIsFocused(false);
                     }}
                     className="w-full text-left p-3 rounded-xl hover:bg-tg-secondaryBg text-tg-text flex items-center justify-between group transition-colors"
                   >
                     <span className="capitalize text-base font-medium">{item.word}</span>
                     <CornerDownLeft size={16} className="text-tg-hint opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                   </button>
                 ))}
               </div>
            </div>
          )}
          
          {filteredHistory.length > 0 && query && (
             <div className="h-px bg-tg-hint/10 my-2 mx-2"></div>
          )}
          
          {query && (
             <button
               onClick={handleSubmit}
               className="w-full mt-1 p-4 bg-tg-button text-white rounded-xl font-bold flex items-center justify-between group hover:opacity-95 transition-opacity"
             >
               <span className="flex items-center gap-2">
                 {isLoading ? <span className="animate-spin">⏳</span> : <Search size={18} />}
                 Learn
               </span>
               <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
             </button>
          )}
        </div>
      )}
    </div>
  );
};