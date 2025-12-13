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
    <div className={`
      transition-all duration-300 z-50
      ${isFocused 
        ? 'fixed inset-0 p-4 bg-tg-bg md:relative md:inset-auto md:p-0 md:bg-transparent' 
        : 'relative z-20'
      }
    `}>
      {/* Invisible backdrop for desktop to catch clicks outside */}
      {isFocused && (
        <div 
          className="hidden md:block fixed inset-0 z-[-1]" 
          onClick={() => setIsFocused(false)}
        />
      )}

      <form onSubmit={handleSubmit} className="relative z-10">
        <div className={`
          flex items-center gap-2 bg-tg-secondaryBg rounded-xl px-4 py-3 
          border-2 transition-colors 
          ${isFocused ? 'border-tg-button shadow-lg' : 'border-transparent'}
        `}>
          <Search size={20} className="text-tg-hint shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setIsFocused(true)}
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
          {/* Cancel button: Visible on mobile focus only */}
          <button 
            type="button" 
            onClick={() => setIsFocused(false)}
            className={`
              text-sm text-tg-button font-medium ml-2 whitespace-nowrap md:hidden
              ${isFocused ? 'block' : 'hidden'}
            `}
          >
            Cancel
          </button>
        </div>
      </form>

      {/* Dropdown Suggestions / History */}
      {isFocused && (
        <div className={`
          mt-6 animate-in fade-in slide-in-from-bottom-2
          md:absolute md:top-full md:left-0 md:right-0 md:mt-2 md:bg-tg-bg md:shadow-xl md:rounded-xl md:border md:border-tg-hint/10 md:p-2 md:max-h-[60vh] md:overflow-y-auto
        `}>
          {history.length > 0 && !query && (
            <div className="md:px-2">
               <div className="flex items-center gap-2 text-tg-hint text-xs font-bold uppercase tracking-wider mb-3 md:mt-2">
                 <Clock size={12} />
                 Recent
               </div>
               <div className="space-y-1">
                 {history.map((item) => (
                   <button
                     key={item.timestamp}
                     onClick={() => {
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
               className="w-full mt-2 p-4 bg-tg-button text-tg-buttonText rounded-xl font-bold flex items-center justify-center gap-2 hover:opacity-90 transition-opacity"
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