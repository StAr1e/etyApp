import React, { useState, useEffect, useRef, useCallback } from 'react';
import { WordData, TelegramWebApp } from '../types';
import { Play, Pause, Share2, GitFork, Lightbulb, Copy, Check, Users, Volume2, BookOpenCheck, Download, FastForward, Loader2, RefreshCw, CloudOff, AlertCircle } from 'lucide-react';
import { fetchPronunciation, fetchWordImage } from '../services/geminiService';

interface WordCardProps {
  data: WordData;
  initialImage?: string | null;
  onImageLoaded?: (base64: string) => void;
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

export const WordCard: React.FC<WordCardProps> = ({ data, initialImage, onImageLoaded, onShare }) => {
  // Audio State
  const [isPlaying, setIsPlaying] = useState(false);
  const [isAudioLoading, setIsAudioLoading] = useState(false);
  const [audioError, setAudioError] = useState<boolean>(false);
  const [playbackRate, setPlaybackRate] = useState(1.0);
  const [audioBlobUrl, setAudioBlobUrl] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  
  // Image State
  const [aiImage, setAiImage] = useState<string | null>(initialImage || null);
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
      const b64 = await fetchWordImage(data.word, data.definition);
      if (b64) {
        const fullImage = `data:image/jpeg;base64,${b64}`;
        setAiImage(fullImage);
        if (onImageLoaded) onImageLoaded(fullImage);
      } else {
        setImageError("generation_failed");
      }
    } catch (e: any) {
      setImageError("generation_failed");
    } finally {
      setIsImageLoading(false);
    }
  }, [data.word, data.definition, onImageLoaded]);

  useEffect(() => {
    if (initialImage) {
        setAiImage(initialImage);
        setIsImageLoading(false);
    } else {
        loadImage();
    }
    
    // Reset Audio when word changes
    setAudioBlobUrl(null);
    setIsPlaying(false);
    setAudioError(false);
  }, [data.word, initialImage, loadImage]);

  // --- AUDIO LOGIC ---

  const handleTogglePlay = async () => {
    if (isPlaying) {
      audioRef.current?.pause();
      setIsPlaying(false);
      return;
    }

    if (audioBlobUrl) {
      if(audioRef.current) {
         audioRef.current.playbackRate = playbackRate;
         audioRef.current.play().catch(() => setAudioError(true));
         setIsPlaying(true);
      }
      return;
    }

    setIsAudioLoading(true);
    setAudioError(false);
    try {
      // Narrate the complete passage: Word, definition, etymology, and fact.
      const fullText = `${data.word}. Definition: ${data.definition}. Origin: ${data.etymology}. Surprising fact: ${data.funFact}`;
      
      const audioBuffer = await fetchPronunciation(fullText);
      
      if (audioBuffer) {
        const SAMPLE_RATE = 24000;
        const pcmData = new Int16Array(audioBuffer);
        const wavBlob = writeWavHeader(pcmData, SAMPLE_RATE);
        const url = URL.createObjectURL(wavBlob);
        
        setAudioBlobUrl(url);
        
        setTimeout(() => {
          if (audioRef.current) {
            audioRef.current.playbackRate = playbackRate;
            audioRef.current.play().catch(() => setAudioError(true));
            setIsPlaying(true);
          }
        }, 150);
      } else {
        setAudioError(true);
      }
    } catch (e) {
      console.error("Audio generation failed", e);
      setAudioError(true);
    } finally {
      setIsAudioLoading(false);
    }
  };

  const cycleSpeed = () => {
    const rates = [1.0, 1.25, 1.5, 2.0];
    const next = rates[(rates.indexOf(playbackRate) + 1) % rates.length];
    setPlaybackRate(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  };

  const handleDownloadAudio = async () => {
    // If not generated, generate first
    if (!audioBlobUrl) {
       await handleTogglePlay();
       // Pause immediately if it was just for download
       audioRef.current?.pause();
       setIsPlaying(false);
    }

    if (!audioBlobUrl) return;

    try {
      const response = await fetch(audioBlobUrl);
      const blob = await response.blob();
      const file = new File([blob], `ety_ai_${data.word}.wav`, { type: 'audio/wav' });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: `Ety.ai Narrator: ${data.word}`,
        });
        return;
      }
    } catch (e) {
      console.warn("Native share failed, fallback to classic download", e);
    }

    const a = document.createElement('a');
    a.href = audioBlobUrl;
    a.download = `ety_ai_${data.word}.wav`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleDownloadImage = async () => {
    if (!aiImage) return;
    try {
      const response = await fetch(aiImage);
      const blob = await response.blob();
      const file = new File([blob], `ety_ai_${data.word}.jpg`, { type: 'image/jpeg' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: `Ety.ai Insight: ${data.word}`,
          text: `The history of ${data.word}`
        });
        return;
      }
    } catch (e) {}

    const a = document.createElement('a');
    a.href = aiImage;
    a.download = `ety_ai_${data.word}.jpg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

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
           <h1 className="text-5xl md:text-6xl font-serif font-black text-tg-text tracking-tight capitalize bg-clip-text text-transparent bg-gradient-to-br from-tg-text to-tg-text/70 mb-2">
              {data.word}
           </h1>
           <span className="text-xl text-tg-hint font-mono tracking-wide">{data.phonetic}</span>
        </div>

        {/* AI IMAGE DISPLAY */}
        <div className="relative z-10 mb-8 w-full aspect-square md:aspect-video rounded-2xl overflow-hidden bg-tg-secondaryBg border border-tg-hint/10 shadow-inner group-hover:shadow-md transition-shadow">
           {isImageLoading ? (
             <div className="w-full h-full flex flex-col items-center justify-center text-tg-hint animate-pulse">
                <Loader2 size={32} className="animate-spin mb-2 text-tg-button" />
                <span className="text-xs font-bold uppercase tracking-wider">Dreaming up visual...</span>
             </div>
           ) : aiImage ? (
             <div className="relative w-full h-full group/img">
               <img 
                 src={aiImage} 
                 alt={`AI visualization of ${data.word}`} 
                 className="w-full h-full object-cover transition-transform duration-700 group-hover/img:scale-105" 
               />
               <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent opacity-0 group-hover/img:opacity-100 transition-opacity"></div>
               <button 
                 onClick={(e) => { e.stopPropagation(); handleDownloadImage(); }}
                 className="absolute bottom-4 right-4 p-2.5 bg-black/40 hover:bg-black/60 backdrop-blur-md text-white rounded-full transition-all opacity-0 group-hover/img:opacity-100 transform translate-y-2 group-hover/img:translate-y-0 shadow-lg"
                 title="Save Image"
               >
                 <Download size={20} />
               </button>
             </div>
           ) : (
             <div className="w-full h-full flex flex-col items-center justify-center text-tg-hint/50 p-6 text-center">
                <RefreshCw size={32} className="mb-2 cursor-pointer hover:text-tg-button transition-colors" onClick={loadImage} />
                <span className="text-xs font-bold">Tap to retry image</span>
             </div>
           )}
        </div>

        {/* Narrator Player */}
        <div className={`relative z-10 bg-tg-secondaryBg/50 backdrop-blur-md rounded-2xl p-4 flex items-center gap-4 border transition-colors ${audioError ? 'border-red-500/30' : 'border-tg-hint/5'}`}>
           <button 
             onClick={handleTogglePlay}
             disabled={isAudioLoading}
             className={`w-12 h-12 rounded-full flex items-center justify-center shadow-lg transition-all active:scale-95 disabled:opacity-50 ${audioError ? 'bg-red-500 text-white' : 'bg-tg-button text-white shadow-tg-button/30 hover:scale-105'}`}
             title="Listen to full passage"
           >
             {isAudioLoading ? <Loader2 size={20} className="animate-spin" /> : audioError ? <AlertCircle size={20} /> : isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" className="ml-1" />}
           </button>
           
           <div className="flex-1">
              <div className={`text-xs font-bold uppercase tracking-wider mb-1 ${audioError ? 'text-red-500' : 'text-tg-hint'}`}>
                {audioError ? 'Playback Error' : 'Narrator'}
              </div>
              <div className="h-1 bg-tg-hint/10 rounded-full overflow-hidden">
                 <div className={`h-full rounded-full transition-all ${audioError ? 'bg-red-500/50 w-full' : isPlaying ? 'bg-tg-button/50 animate-[pulse_1s_ease-in-out_infinite] w-full' : 'w-0'}`}></div>
              </div>
           </div>

           <div className="flex items-center gap-1">
             <button onClick={cycleSpeed} className="p-2 text-tg-hint hover:text-tg-text text-xs font-bold transition-colors w-12 text-center">
               {playbackRate}x
             </button>
             <button 
                onClick={handleDownloadAudio} 
                className={`p-2 transition-colors ${audioBlobUrl ? 'text-tg-button' : 'text-tg-hint'}`}
                title="Download Narrative"
              >
                <Download size={18} />
             </button>
           </div>
        </div>

        <audio 
          ref={audioRef} 
          src={audioBlobUrl || undefined}
          onEnded={() => setIsPlaying(false)}
          onError={() => { setIsPlaying(false); setIsAudioLoading(false); setAudioError(true); }}
        />
        
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-tg-button/5 to-purple-500/5 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none"></div>
      </div>

      {/* 2. Definition & Etymology */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-tg-bg rounded-3xl p-6 border border-tg-hint/10 shadow-sm relative overflow-hidden">
           <div className="flex items-center gap-3 mb-4 text-tg-button">
              <div className="p-2 bg-tg-button/10 rounded-lg"><BookOpenCheck size={20} /></div>
              <h2 className="font-bold text-lg">Meaning</h2>
           </div>
           <p className="text-lg leading-relaxed text-tg-text/90 font-serif">{data.definition}</p>
        </div>
        <div className="bg-tg-bg rounded-3xl p-6 border border-tg-hint/10 shadow-sm relative overflow-hidden">
           <div className="flex items-center gap-3 mb-4 text-purple-600">
              <div className="p-2 bg-purple-500/10 rounded-lg"><GitFork size={20} /></div>
              <h2 className="font-bold text-lg">Origin Story</h2>
           </div>
           <p className="text-base leading-relaxed text-tg-text/80">{data.etymology}</p>
        </div>
      </div>

      <div className="bg-tg-bg rounded-3xl p-6 border border-tg-hint/10 shadow-sm">
         <div className="flex items-center gap-3 mb-6 text-amber-600">
            <div className="p-2 bg-amber-500/10 rounded-lg"><Users size={20} /></div>
            <h2 className="font-bold text-lg">Ancestry</h2>
         </div>
         <div className="relative">
            <div className="absolute top-8 left-4 right-4 h-0.5 bg-gradient-to-r from-transparent via-tg-hint/20 to-transparent hidden md:block"></div>
            <div className="flex flex-col md:flex-row justify-between gap-6 md:gap-4 relative z-10">
               {data.roots.map((root, i) => (
                 <div key={i} className="flex-1 bg-tg-secondaryBg/50 rounded-2xl p-4 border border-tg-hint/5 flex flex-col items-center text-center hover:bg-tg-secondaryBg transition-colors group">
                    <span className="text-[10px] font-bold uppercase text-tg-hint mb-1 tracking-widest">{root.language}</span>
                    <span className="text-xl font-bold text-tg-text mb-1 group-hover:text-tg-button transition-colors font-serif">{root.term}</span>
                    <span className="text-sm text-tg-hint italic">"{root.meaning}"</span>
                    {i < data.roots.length - 1 && <div className="md:hidden mt-4 text-tg-hint/30">↓</div>}
                 </div>
               ))}
            </div>
         </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
         <div className="md:col-span-2 bg-gradient-to-br from-yellow-500/5 to-orange-500/5 rounded-3xl p-6 border border-yellow-500/10 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10"><Lightbulb size={64} className="text-yellow-500" /></div>
            <div className="relative z-10">
               <div className="flex items-center gap-2 mb-3 text-yellow-600 font-bold uppercase text-xs tracking-wider"><Lightbulb size={16} /> Did you know?</div>
               <p className="text-tg-text font-medium italic">"{data.funFact}"</p>
            </div>
         </div>
         <div className="bg-tg-bg rounded-3xl p-6 border border-tg-hint/10">
            <div className="font-bold text-tg-hint text-xs uppercase tracking-wider mb-4">Synonyms</div>
            <div className="flex flex-wrap gap-2">
               {data.synonyms.slice(0, 5).map(syn => (
                 <span key={syn} className="px-3 py-1.5 bg-tg-secondaryBg rounded-lg text-sm text-tg-text font-medium border border-tg-hint/5">{syn}</span>
               ))}
            </div>
         </div>
      </div>
    </div>
  );
};