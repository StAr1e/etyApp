import React, { useState } from 'react';
import { WordData } from '../types';
import { Play, Share2, GitFork, Lightbulb, Copy, Check, Users, Volume2, BookOpenCheck } from 'lucide-react';
import { fetchPronunciation } from '../services/geminiService';

interface WordCardProps {
  data: WordData;
}

export const WordCard: React.FC<WordCardProps> = ({ data }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [copied, setCopied] = useState(false);

  const handlePlayAudio = async () => {
    if (isPlaying) return;
    setIsPlaying(true);
    try {
      const audioBuffer = await fetchPronunciation(data.word);
      if (audioBuffer) {
        const SAMPLE_RATE = 24000;
        const audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: SAMPLE_RATE });
        const dataInt16 = new Int16Array(audioBuffer);
        const buffer = audioContext.createBuffer(1, dataInt16.length, SAMPLE_RATE);
        const channelData = buffer.getChannelData(0);
        for (let i = 0; i < dataInt16.length; i++) {
          channelData[i] = dataInt16[i] / 32768.0;
        }
        const source = audioContext.createBufferSource();
        source.buffer = buffer;
        source.connect(audioContext.destination);
        source.start(0);
        source.onended = () => setIsPlaying(false);
      } else {
        setIsPlaying(false);
      }
    } catch (e) {
      console.error(e);
      setIsPlaying(false);
    }
  };

  const handleShare = (target: 'all' | 'groups') => {
    if (window.Telegram?.WebApp) {
      const tg = window.Telegram.WebApp;
      tg.HapticFeedback.impactOccurred('medium');
      const shortDef = data.definition.length > 100 
        ? data.definition.substring(0, 97) + '...' 
        : data.definition;
      const text = `${data.word}: ${shortDef}`;
      const types = target === 'groups' ? ['groups'] : ['users', 'groups', 'channels'];
      
      try {
        tg.switchInlineQuery(text, types);
      } catch (e) {
        try {
          tg.switchInlineQuery(text);
        } catch (e2) {
           const fallbackUrl = `https://t.me/share/url?url=${encodeURIComponent(window.location.href)}&text=${encodeURIComponent(text)}`;
           // Prefer openTelegramLink for t.me links, fall back to openLink
           if (tg.openTelegramLink) {
             tg.openTelegramLink(fallbackUrl);
           } else {
             tg.openLink(fallbackUrl);
           }
        }
      }
    } else {
       const shareData: any = {
           title: `Ety.ai: ${data.word}`,
           text: `${data.word}\n${data.definition}\n\nOrigin: ${data.etymology}`,
       };
       if (window.location.protocol.startsWith('http')) shareData.url = window.location.href;
       if (navigator.share) {
         navigator.share(shareData).catch(() => handleCopy());
       } else {
         handleCopy();
       }
    }
  };

  const handleCopy = () => {
    const text = `${data.word.toUpperCase()}\n\n${data.definition}\n\nEtymology: ${data.etymology}`;
    navigator.clipboard.writeText(text);
    if(window.Telegram?.WebApp) window.Telegram.WebApp.HapticFeedback.notificationOccurred('success');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="pb-24 md:pb-8 space-y-6">
      
      {/* 1. Hero Card */}
      <div className="bg-tg-bg rounded-3xl p-6 md:p-8 shadow-soft border border-tg-hint/10 relative overflow-hidden group">
        {/* Subtle Background Texture */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-tg-button/5 to-transparent rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none"></div>
        
        <div className="relative z-10">
          <div className="flex justify-between items-start mb-4">
             <span className="px-3 py-1 bg-tg-secondaryBg text-tg-hint text-xs font-bold rounded-full uppercase tracking-wider border border-tg-hint/10">
               {data.partOfSpeech}
             </span>
             <div className="flex gap-2">
                <button 
                  onClick={handleCopy}
                  className="p-2.5 rounded-full bg-tg-secondaryBg text-tg-hint hover:text-tg-text hover:bg-tg-button/10 transition-colors"
                  title="Copy"
                >
                  {copied ? <Check size={18} className="text-green-500" /> : <Copy size={18} />}
                </button>
                <button 
                  onClick={() => handleShare('all')}
                  className="p-2.5 rounded-full bg-tg-secondaryBg text-tg-hint hover:text-tg-button hover:bg-tg-button/10 transition-colors"
                  title="Share"
                >
                  <Share2 size={18} />
                </button>
             </div>
          </div>

          <div className="flex flex-col gap-1 mb-6">
            <h1 className="text-5xl md:text-6xl font-serif font-black text-tg-text tracking-tight capitalize bg-clip-text text-transparent bg-gradient-to-br from-tg-text to-tg-text/70 pb-2">
              {data.word}
            </h1>
            <div className="flex items-center gap-4">
              <span className="text-xl text-tg-hint font-mono tracking-wide">{data.phonetic}</span>
              <button 
                onClick={handlePlayAudio}
                disabled={isPlaying}
                className={`p-2 rounded-full bg-tg-button/10 text-tg-button hover:bg-tg-button hover:text-white transition-all ${isPlaying ? 'animate-pulse' : 'hover:scale-110 active:scale-95'}`}
              >
                 {isPlaying ? <Volume2 size={20} /> : <Play size={20} fill="currentColor" />}
              </button>
            </div>
          </div>

          <div className="relative pl-6">
            <div className="absolute left-0 top-1 bottom-1 w-1 bg-tg-button rounded-full opacity-30"></div>
            <p className="text-xl md:text-2xl leading-relaxed text-tg-text font-serif">
              {data.definition}
            </p>
          </div>
        </div>
      </div>

      {/* Share Action Block */}
      <button 
        onClick={() => handleShare('groups')}
        className="w-full bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white p-4 rounded-2xl shadow-lg shadow-blue-500/20 flex items-center justify-center gap-3 transition-all active:scale-[0.98] group"
      >
        <div className="p-1.5 bg-white/20 rounded-full group-hover:rotate-12 transition-transform">
          <Users size={20} />
        </div>
        <span className="font-bold text-lg">Share to Chat</span>
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* 2. Etymology Timeline (Spans 2 cols on large screens) */}
        <div className="lg:col-span-2 bg-tg-bg rounded-3xl p-6 md:p-8 border border-tg-hint/10 shadow-soft">
          <div className="flex items-center gap-3 mb-6 pb-4 border-b border-tg-hint/10">
            <div className="p-2 bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-300 rounded-xl">
               <GitFork size={24} />
            </div>
            <h2 className="text-xl font-bold text-tg-text">Evolution</h2>
          </div>
          
          <p className="text-tg-text/80 leading-relaxed mb-8 font-serif text-lg">
            {data.etymology}
          </p>

          {/* Timeline Viz */}
          <div className="relative space-y-0">
            {data.roots.map((root, idx) => (
               <div key={idx} className="flex gap-4 relative pb-8 last:pb-0 group">
                  {/* Line */}
                  {idx !== data.roots.length && (
                    <div className="absolute left-[19px] top-8 bottom-0 w-[2px] bg-gradient-to-b from-tg-button/30 to-tg-button/10 group-last:hidden"></div>
                  )}
                  
                  {/* Dot */}
                  <div className="relative shrink-0 w-10 h-10 flex items-center justify-center">
                    <div className="w-4 h-4 rounded-full border-[3px] border-tg-button bg-tg-bg z-10 shadow-[0_0_0_4px_var(--tg-theme-bg-color)]"></div>
                  </div>
                  
                  {/* Content */}
                  <div className="flex-1 pt-1">
                    <div className="bg-tg-secondaryBg/50 hover:bg-tg-secondaryBg border border-tg-hint/5 rounded-xl p-4 transition-colors">
                      <div className="flex flex-wrap items-baseline gap-2 mb-1">
                        <span className="font-bold text-lg text-tg-text capitalize font-serif italic">{root.term}</span>
                        <span className="text-xs font-bold text-tg-hint uppercase bg-tg-hint/10 px-2 py-0.5 rounded">{root.language}</span>
                      </div>
                      <span className="text-tg-text/70 text-sm">"{root.meaning}"</span>
                    </div>
                  </div>
               </div>
            ))}
            
            {/* Final Target */}
            <div className="flex gap-4 relative pt-8">
               <div className="relative shrink-0 w-10 h-10 flex items-center justify-center">
                 <div className="w-3 h-3 rounded-full bg-tg-text z-10"></div>
                 <div className="absolute top-0 left-1/2 -ml-[1px] h-8 w-[2px] bg-gradient-to-b from-tg-button/10 to-transparent"></div>
               </div>
               <div className="flex-1">
                 <div className="inline-block px-4 py-2 bg-tg-text text-tg-bg rounded-lg font-bold shadow-md">
                   {data.word}
                 </div>
               </div>
            </div>
          </div>
        </div>

        {/* 3. Sidebar: Context & Facts */}
        <div className="flex flex-col gap-6">
          
          {/* Usage Card */}
          <div className="bg-tg-bg rounded-3xl p-6 border border-tg-hint/10 shadow-soft flex-1">
            <div className="flex items-center gap-2 mb-4 text-tg-text/70">
              <BookOpenCheck size={20} />
              <h3 className="font-bold text-sm uppercase tracking-wider">Context</h3>
            </div>
            <ul className="space-y-4">
              {data.examples.map((ex, i) => (
                <li key={i} className="relative pl-4 text-tg-text/80 italic text-sm font-serif leading-relaxed">
                  <div className="absolute left-0 top-2 w-1 h-1 rounded-full bg-tg-hint"></div>
                  "{ex}"
                </li>
              ))}
            </ul>
          </div>

          {/* Fun Fact Card - Sticky Note Style */}
          <div className="bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/40 dark:to-orange-950/20 border border-amber-200 dark:border-amber-800/50 rounded-3xl p-6 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-5">
              <Lightbulb size={80} />
            </div>
            <div className="flex items-center gap-2 mb-3 text-amber-600 dark:text-amber-400">
              <Lightbulb size={20} fill="currentColor" className="opacity-20" />
              <h4 className="font-bold text-sm uppercase tracking-wider">Trivia</h4>
            </div>
            <p className="text-amber-900 dark:text-amber-100 font-medium leading-relaxed relative z-10">
              {data.funFact}
            </p>
          </div>

        </div>
      </div>
    </div>
  );
};