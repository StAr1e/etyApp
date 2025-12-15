import React, { useState, useEffect, useRef, useCallback } from 'react';
import { WordData, TelegramWebApp } from '../types';
import { Play, Pause, Share2, GitFork, Lightbulb, Copy, Check, Users, Volume2, BookOpenCheck, Download, FastForward, Loader2, RefreshCw, CloudOff } from 'lucide-react';
import { fetchPronunciation, fetchWordImage } from '../services/geminiService';

interface WordCardProps {
  data: WordData;
  onShare?: () => void;
}

// --- HELPER: CONVERT PCM TO WAV FOR DOWNLOAD ---
const writeWavHeader = (samples: Int16Array, sampleRate: number): Blob => {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  const writeString = (offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, samples.length * 2, true);

  for (let i = 0; i < samples.length; i++) {
    view.setInt16(44 + i * 2, samples[i], true);
  }

  return new Blob([view], { type: 'audio/wav' });
};

export const WordCard: React.FC<WordCardProps> = ({ data, onShare }) => {
  // Audio State
  const [isPlaying, setIsPlaying] = useState(false);
  const [isAudioLoading, setIsAudioLoading] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1.0);
  const [audioBlobUrl, setAudioBlobUrl] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  
  // Image State
  const [aiImage, setAiImage] = useState<string | null>(null);
  const [isImageLoading, setIsImageLoading] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);

  // UI State
  const [copied, setCopied] = useState(false);

  // --- EFFECT: FETCH IMAGE ---
  const loadImage = useCallback(async () => {
    setAiImage(null);
    setImageError(null);
    setIsImageLoading(true);
    try {
      const b64 = await fetchWordImage(data.word, data.etymology);
      if (b64) {
        setAiImage(`data:image/jpeg;base64,${b64}`);
      } else {
        setImageError("generation_failed");
      }
    } catch (e: any) {
      console.error("Image load failed", e);
      if (e.message === "QUOTA_EXCEEDED") {
          setImageError("quota_exceeded");
      } else {
          setImageError("generation_failed");
      }
    } finally {
      setIsImageLoading(false);
    }
  }, [data.word, data.etymology]);

  useEffect(() => {
    loadImage();
    
    // Reset Audio when word changes
    setAudioBlobUrl(null);
    setIsPlaying(false);
  }, [loadImage]);

  // --- AUDIO LOGIC ---

  const handleTogglePlay = async () => {
    if (isPlaying) {
      audioRef.current?.pause();
      setIsPlaying(false);
      return;
    }

    if (audioBlobUrl) {
      // If we have audio, just play it
      // Ensure speed is set
      if(audioRef.current) {
         audioRef.current.playbackRate = playbackRate;
         audioRef.current.play();
         setIsPlaying(true);
      }
      return;
    }

    // First time load: Fetch Full Text
    setIsAudioLoading(true);
    try {
      const fullText = `
        ${data.word}. 
        Definition: ${data.definition}. 
        Etymology: ${data.etymology}. 
        Fun fact: ${data.funFact}
      `;
      
      const audioBuffer = await fetchPronunciation(fullText);
      
      if (audioBuffer) {
        const SAMPLE_RATE = 24000;
        const pcmData = new Int16Array(audioBuffer);
        const wavBlob = writeWavHeader(pcmData, SAMPLE_RATE);
        const url = URL.createObjectURL(wavBlob);
        
        setAudioBlobUrl(url);
        
        // Slight delay to ensure element updates
        setTimeout(() => {
          if (audioRef.current) {
            audioRef.current.playbackRate = playbackRate;
            audioRef.current.play();
            setIsPlaying(true);
          }
        }, 100);
      }
    } catch (e) {
      console.error("Audio generation failed", e);
    } finally {
      setIsAudioLoading(false);
    }
  };

  const cycleSpeed = () => {
    const rates = [1.0, 1.5, 2.0];
    const next = rates[(rates.indexOf(playbackRate) + 1) % rates.length];
    setPlaybackRate(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  };

  const handleDownloadAudio = () => {
    if (audioBlobUrl) {
      const a = document.createElement('a');
      a.href = audioBlobUrl;
      a.download = `ety_ai_${data.word}.wav`;
      a.click();
    }
  };

  // --- SHARE & COPY LOGIC ---
  const handleShare = () => {
    if (onShare) onShare();
    if (window.Telegram?.WebApp) {
      const tg = window.Telegram.WebApp as TelegramWebApp;
      tg.HapticFeedback.impactOccurred('medium');
      const text = `${data.word}: ${data.definition.substring(0, 90)}...`;
      try { tg.switchInlineQuery(text, ['users', 'groups', 'channels']); } catch (e) { console.warn(e); }
    } else {
       const shareData: any = { title: `Ety.ai: ${data.word}`, text: `${data.word}\n${data.definition}`, };
       if (navigator.share) navigator.share(shareData).catch(() => handleCopy()); else handleCopy();
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(`${data.word.toUpperCase()}\n\n${data.definition}\n\n${data.etymology}`);
    if(window.Telegram?.WebApp) window.Telegram.WebApp.HapticFeedback.notificationOccurred('success');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="pb-24 md:pb-8 space-y-6">
      
      {/* 1. Hero Card */}
      <div className="bg-tg-bg rounded-3xl p-6 md:p-8 shadow-soft border border-tg-hint/10 relative overflow-hidden group">
        
        {/* Top Controls */}
        <div className="relative z-10 flex justify-between items-start mb-6">
           <span className="px-3 py-1 bg-tg-secondaryBg text-tg-hint text-xs font-bold rounded-full uppercase tracking-wider border border-tg-hint/10">
             {data.partOfSpeech}
           </span>
           <div className="flex gap-2">
              <button 
                onClick={handleCopy}
                className="p-2.5 rounded-full bg-tg-secondaryBg text-tg-hint hover:text-tg-text hover:bg-tg-button/10 transition-colors"
              >
                {copied ? <Check size={18} className="text-green-500" /> : <Copy size={18} />}
              </button>
              <button 
                onClick={handleShare}
                className="p-2.5 rounded-full bg-tg-secondaryBg text-tg-hint hover:text-tg-button hover:bg-tg-button/10 transition-colors"
              >
                <Share2 size={18} />
              </button>
           </div>
        </div>

        <div className="relative z-10 mb-6">
           {/* Word Title */}
           <h1 className="text-5xl md:text-6xl font-serif font-black text-tg-text tracking-tight capitalize bg-clip-text text-transparent bg-gradient-to-br from-tg-text to-tg-text/70 mb-2">
              {data.word}
           </h1>
           <span className="text-xl text-tg-hint font-mono tracking-wide">{data.phonetic}</span>
        </div>

        {/* AI IMAGE DISPLAY */}
        <div className="relative z-10 w-full aspect-square md:aspect-[2/1] rounded-2xl overflow-hidden mb-8 bg-tg-secondaryBg border border-tg-hint/5 shadow-inner group-image">
           {isImageLoading ? (
             <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-tg-hint/50">
                <Loader2 size={32} className="animate-spin" />
                <span className="text-xs font-medium uppercase tracking-widest animate-pulse">Dreaming up image...</span>
             </div>
           ) : aiImage ? (
             <img src={aiImage} alt="AI Generated visualization" className="w-full h-full object-cover animate-in fade-in duration-700 hover:scale-105 transition-transform duration-1000 ease-in-out" />
           ) : (
             <div className="absolute inset-0 flex flex-col items-center justify-center text-tg-hint/40 gap-3 p-4 text-center">
                {imageError === 'quota_exceeded' ? (
                   <>
                     <CloudOff size={24} className="opacity-50 text-amber-500" />
                     <span className="text-xs font-bold text-tg-hint">Daily image limit reached</span>
                     <span className="text-[10px] opacity-60">High demand. Try again tomorrow!</span>
                   </>
                ) : (
                   <>
                      <span className="text-xs">No visualization available</span>
                      <button 
                        onClick={loadImage}
                        className="px-3 py-1.5 rounded-full bg-tg-bg border border-tg-hint/20 text-xs font-bold flex items-center gap-1 hover:bg-tg-secondaryBg transition-colors"
                      >
                         <RefreshCw size={12} /> Retry
                      </button>
                   </>
                )}
             </div>
           )}
           {aiImage && (
             <div className="absolute bottom-3 right-3 px-2 py-1 bg-black/40 backdrop-blur-md rounded-md text-[8px] text-white/80 font-bold uppercase tracking-wider border border-white/10">
               AI Generated
             </div>
           )}
        </div>

        {/* DEFINITION */}
        <div className="relative z-10 pl-6 mb-8 border-l-4 border-tg-button/30">
           <p className="text-xl md:text-2xl leading-relaxed text-tg-text font-serif">
              {data.definition}
           </p>
        </div>

        {/* FULL AUDIO PLAYER */}
        <div className="relative z-10 bg-tg-secondaryBg/50 rounded-2xl p-4 border border-tg-hint/10 flex items-center gap-4">
           {/* Play/Pause */}
           <button 
             onClick={handleTogglePlay}
             disabled={isAudioLoading}
             className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 shadow-lg transition-all ${
               isAudioLoading 
                 ? 'bg-tg-hint/20 cursor-wait' 
                 : 'bg-tg-button text-white hover:scale-105 active:scale-95'
             }`}
           >
             {isAudioLoading ? (
               <Loader2 size={20} className="animate-spin" />
             ) : isPlaying ? (
               <Pause size={20} fill="currentColor" />
             ) : (
               <Play size={20} fill="currentColor" className="ml-1" />
             )}
           </button>

           <div className="flex-1 min-w-0">
             <div className="text-sm font-bold text-tg-text">Audio Experience</div>
             <div className="text-xs text-tg-hint truncate">Listen to the full story</div>
           </div>

           {/* Controls */}
           <div className="flex items-center gap-2">
             {audioBlobUrl && (
               <>
                 <button 
                   onClick={cycleSpeed}
                   className="px-2 py-1.5 rounded-lg bg-tg-bg border border-tg-hint/10 text-xs font-bold text-tg-text min-w-[3rem] flex items-center justify-center gap-0.5 hover:bg-tg-hint/10 transition-colors"
                 >
                   <FastForward size={10} /> {playbackRate}x
                 </button>
                 <button 
                   onClick={handleDownloadAudio}
                   className="p-2 rounded-lg bg-tg-bg border border-tg-hint/10 text-tg-text hover:bg-tg-hint/10 transition-colors"
                   title="Download WAV"
                 >
                   <Download size={16} />
                 </button>
               </>
             )}
           </div>

           {/* Hidden Audio Element */}
           <audio 
             ref={audioRef} 
             src={audioBlobUrl || undefined} 
             onEnded={() => setIsPlaying(false)} 
             onError={() => { setIsPlaying(false); setIsAudioLoading(false); }}
             className="hidden"
           />
        </div>

      </div>

      {/* Share Action Block */}
      <button 
        onClick={handleShare}
        className="w-full bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white p-4 rounded-2xl shadow-lg shadow-blue-500/20 flex items-center justify-center gap-3 transition-all active:scale-[0.98] group"
      >
        <div className="p-1.5 bg-white/20 rounded-full group-hover:rotate-12 transition-transform">
          <Users size={20} />
        </div>
        <span className="font-bold text-lg">Share Result</span>
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