import React, { useState, useEffect, useRef } from 'react';
import { Search, X, Clock, ArrowRight } from 'lucide-react';
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      onSearch(query.trim());
      inputRef.current?.blur();
      setIsFocused(false);
    }
  };

  return (
    <div className="relative z-50">
      {/* Search Input Container */}
      <form onSubmit={handleSubmit} className="relative z-10">
        <div className={`
          flex items-center gap-2 bg-tg-secondaryBg rounded-xl px-4 py-3 
          border-2 transition-colors 
          ${isFocused ? 'border-tg-button shadow-md' : 'border-transparent'}
        `}>
          <Search size={20} className="text-tg-hint shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setIsFocused(true)}
            // Delay blur to allow click on history items
            onBlur={() => setTimeout(() => setIsFocused(false), 200)}
            placeholder="Search etymology..."
            className="bg-transparent border-none outline-none w-full text-tg-text placeholder-tg-hint text-lg"
            autoComplete="off"
            autoCapitalize="off"
          />
          {query && (
            <button 
              type="button" 
              onClick={() => setQuery('')}
              className="p-1 rounded-full bg-tg-hint/20 text-tg-hint hover:bg-tg-hint/40 transition-colors"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </form>

      {/* Dropdown Suggestions / History */}
      {isFocused && (history.length > 0 || query) && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-tg-bg shadow-xl rounded-xl border border-tg-hint/10 p-2 max-h-[60vh] overflow-y-auto animate-in fade-in slide-in-from-top-2 z-20">
          {history.length > 0 && !query && (
            <div className="md:px-2">
               <div className="flex items-center gap-2 text-tg-hint text-xs font-bold uppercase tracking-wider mb-2 mt-2 px-2">
                 <Clock size={12} />
                 Recent
               </div>
               <div className="space-y-1">
                 {history.map((item) => (
                   <button
                     key={item.timestamp}
                     onClick={(e) => {
                       e.preventDefault(); // Prevent blur from firing before click
                       setQuery(item.word);
                       onHistorySelect(item.word);
                       setIsFocused(false);
                     }}
                     className="w-full text-left p-3 rounded-lg hover:bg-tg-secondaryBg text-tg-text flex items-center justify-between group transition-colors"
                   >
                     <span className="capitalize text-lg">{item.word}</span>
                     <ArrowRight size={16} className="text-tg-hint opacity-0 group-hover:opacity-100 transition-opacity" />
                   </button>
                 ))}
               </div>
            </div>
          )}
          
          {query && (
             <button
               onClick={handleSubmit}
               className="w-full mt-2 p-3 bg-tg-button text-tg-buttonText rounded-xl font-bold flex items-center justify-center gap-2 hover:opacity-90 transition-opacity"
             >
               Search for "{query}"
               {isLoading && <span className="animate-spin">⏳</span>}
             </button>
          )}
        </div>
      )}
    </div>
  );
};