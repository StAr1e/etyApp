import React, { useState } from 'react';
import { WordData } from '../types';
import { Play, Share2, BookOpen, GitFork, Lightbulb, Copy, Check, Users } from 'lucide-react';
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
        // Gemini TTS returns raw PCM data at 24kHz
        const SAMPLE_RATE = 24000;
        const audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: SAMPLE_RATE });
        
        // Convert raw PCM (Int16) to AudioBuffer (Float32)
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
    // Check if running in Telegram
    if (window.Telegram?.WebApp) {
      window.Telegram.WebApp.HapticFeedback.impactOccurred('medium');
      
      // Truncate definition to ensure it fits nicely in the inline query box
      // Telegram has limits on query length
      const shortDef = data.definition.length > 150 
        ? data.definition.substring(0, 147) + '...' 
        : data.definition;

      // Format: "Word: Definition"
      // The bot parses this specific format in api/bot.ts
      const text = `${data.word}: ${shortDef}`;
      
      const types = target === 'groups' ? ['groups', 'supergroups'] : ['users', 'groups', 'channels'];
      
      // Open the chat selection with the query pre-filled
      window.Telegram.WebApp.switchInlineQuery(text, types);
    } else {
       // Fallback for web
       const shareData: any = {
           title: `Ety.ai: ${data.word}`,
           text: `${data.word}\n${data.definition}\n\nOrigin: ${data.etymology}`,
       };
       
       // Only attach URL if it's a valid http/https protocol
       if (window.location.protocol.startsWith('http')) {
           shareData.url = window.location.href;
       }

       if (navigator.share) {
         navigator.share(shareData).catch((err) => {
             console.warn("Share failed, falling back to copy:", err);
             handleCopy();
         });
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
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 pb-24 md:pb-8">
      {/* Header Card */}
      <div className="bg-tg-secondaryBg rounded-2xl p-6 md:p-8 mb-6 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
          <BookOpen size={120} />
        </div>
        
        <div className="relative z-10">
          <div className="flex justify-between items-start mb-2">
             <span className="px-2 py-1 bg-tg-button/10 text-tg-button text-xs font-bold rounded uppercase tracking-wider">
               {data.partOfSpeech}
             </span>
             <div className="flex gap-2">
                <button 
                  onClick={handleCopy}
                  className="p-2 rounded-full hover:bg-black/5 active:scale-95 transition-transform"
                  title="Copy to clipboard"
                >
                  {copied ? <Check size={20} className="text-green-600" /> : <Copy size={20} className="text-tg-hint" />}
                </button>
                <button 
                  onClick={() => handleShare('all')}
                  className="p-2 rounded-full hover:bg-black/5 active:scale-95 transition-transform"
                  title="Share"
                >
                  <Share2 size={20} className="text-tg-button" />
                </button>
             </div>
          </div>

          <h1 className="text-4xl md:text-5xl font-serif font-bold text-tg-text mb-2 capitalize tracking-tight">
            {data.word}
          </h1>
          
          <div className="flex items-center gap-3 mb-6">
            <span className="text-lg md:text-xl text-tg-hint font-mono">{data.phonetic}</span>
            <button 
              onClick={handlePlayAudio}
              disabled={isPlaying}
              className={`p-2 rounded-full bg-tg-button text-tg-buttonText flex items-center justify-center transition-all ${isPlaying ? 'opacity-50' : 'hover:scale-110 active:scale-95'}`}
            >
               <Play size={16} fill="currentColor" />
            </button>
          </div>

          <p className="text-lg md:text-xl leading-relaxed text-tg-text/90 font-serif border-l-4 border-tg-button pl-4">
            {data.definition}
          </p>
        </div>
      </div>

      {/* Share to Group Action */}
      <button 
        onClick={() => handleShare('groups')}
        className="w-full mb-6 bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white p-3 rounded-xl shadow-md flex items-center justify-center gap-2 transition-all active:scale-95"
      >
        <Users size={18} />
        <span className="font-bold">Share to Group</span>
      </button>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Etymology Section */}
        <div className="bg-tg-bg rounded-2xl p-6 border border-tg-hint/20">
          <div className="flex items-center gap-2 mb-4 text-tg-button">
            <GitFork size={24} />
            <h2 className="text-xl font-bold">Origin & History</h2>
          </div>
          <p className="text-tg-text/80 leading-relaxed mb-6">
            {data.etymology}
          </p>

          {/* Tree Visualization */}
          <div className="space-y-4 relative">
            {/* Vertical line connecting nodes */}
            <div className="absolute left-4 top-2 bottom-6 w-0.5 bg-tg-hint/20"></div>

            {data.roots.map((root, idx) => (
               <div key={idx} className="relative pl-10 flex flex-col">
                  <div className="absolute left-[13px] top-3 w-3 h-3 rounded-full bg-tg-button border-2 border-tg-bg z-10"></div>
                  <div className="bg-tg-secondaryBg p-3 rounded-lg hover:shadow-sm transition-shadow">
                    <div className="flex justify-between items-baseline mb-1">
                      <span className="font-bold text-tg-text italic capitalize">{root.term}</span>
                      <span className="text-xs text-tg-hint uppercase font-bold">{root.language}</span>
                    </div>
                    <span className="text-sm text-tg-text/70 block">"{root.meaning}"</span>
                  </div>
               </div>
            ))}
            {/* Current Word Node */}
            <div className="relative pl-10 flex flex-col">
               <div className="absolute left-[13px] top-3 w-3 h-3 rounded-full bg-tg-text border-2 border-tg-bg z-10"></div>
               <div className="bg-tg-button text-tg-buttonText p-3 rounded-lg shadow-md">
                  <span className="font-bold block capitalize">{data.word}</span>
                  <span className="text-xs opacity-80">Current Usage</span>
               </div>
            </div>
          </div>
        </div>

        {/* Right Column (Usage & Facts) */}
        <div className="flex flex-col gap-6">
          {/* Usage Examples */}
          <div className="bg-tg-bg rounded-2xl p-6 border border-tg-hint/20 flex-1">
            <h3 className="text-lg font-bold text-tg-text mb-3">In Context</h3>
            <ul className="space-y-3">
              {data.examples.map((ex, i) => (
                <li key={i} className="text-tg-text/80 italic text-sm pl-3 border-l-2 border-tg-hint/30">
                  "{ex}"
                </li>
              ))}
            </ul>
          </div>

          {/* Fun Fact */}
          <div className="bg-amber-100 dark:bg-amber-950 border border-amber-300 dark:border-amber-700 rounded-xl p-4 flex gap-3 shadow-sm">
            <Lightbulb className="text-amber-600 dark:text-amber-400 shrink-0 mt-1" size={24} />
            <div>
              <h4 className="font-bold text-amber-900 dark:text-amber-200 text-sm mb-1">Did you know?</h4>
              <p className="text-sm text-amber-900 dark:text-white font-medium leading-relaxed">
                {data.funFact}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};