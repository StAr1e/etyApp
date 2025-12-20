
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { WordData, TelegramWebApp } from '../types';
import { Play, Pause, Share2, GitFork, Lightbulb, Copy, Check, Users, BookOpenCheck, Download, Loader2, RefreshCw, AlertCircle, Volume2, Sparkles, Zap, ChevronRight, Layers } from 'lucide-react';
import { fetchPronunciation, fetchWordImage } from '../services/geminiService';

interface WordCardProps {
  data: WordData;
  initialImage?: string | null;
  onImageLoaded?: (base64: string) => void;
  onShare?: () => void;
}

const createWavHeader = (pcmData: Int16Array, sampleRate: number): Blob => {
  const buffer = new ArrayBuffer(44 + pcmData.length * 2);
  const view = new DataView(buffer);
  const writeString = (offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) view.setUint8(offset + i, string.charCodeAt(i));
  };
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + pcmData.length * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, pcmData.length * 2, true);
  for (let i = 0; i < pcmData.length; i++) view.setInt16(44 + i * 2, pcmData[i], true);
  return new Blob([view], { type: 'audio/wav' });
};

export const WordCard: React.FC<WordCardProps> = ({ data, initialImage, onImageLoaded, onShare }) => {
  const [narratorType, setNarratorType] = useState<'AI' | 'FREE'>(
    (localStorage.getItem('ety_narrator') as 'AI' | 'FREE') || 'AI'
  );
  const [isPlaying, setIsPlaying] = useState(false);
  const [isAudioLoading, setIsAudioLoading] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [playbackRate, setPlaybackRate] = useState(1.0);
  const [audioBlobUrl, setAudioBlobUrl] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [aiImage, setAiImage] = useState<string | null>(initialImage || null);
  const [isImageLoading, setIsImageLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const stopAllAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    window.speechSynthesis.cancel();
    setIsPlaying(false);
  }, []);

  useEffect(() => {
    loadImage();
    stopAllAudio();
    if (audioBlobUrl) {
      URL.revokeObjectURL(audioBlobUrl);
      setAudioBlobUrl(null);
    }
    setAudioError(null);
  }, [data.word]);

  const loadImage = async () => {
    if (initialImage) { setAiImage(initialImage); return; }
    setAiImage(null);
    setIsImageLoading(true);
    try {
      const b64 = await fetchWordImage(data.word, data.definition);
      if (b64) {
        const img = `data:image/jpeg;base64,${b64}`;
        setAiImage(img);
        if (onImageLoaded) onImageLoaded(img);
      }
    } catch (e) {} finally { setIsImageLoading(false); }
  };

  const playNativeSpeech = () => {
    window.speechSynthesis.cancel();
    const text = `${data.word}. ${data.definition}. Origin history: ${data.etymology}`;
    const utterance = new SpeechSynthesisUtterance(text);
    const voices = window.speechSynthesis.getVoices();
    const preferredVoice = voices.find(v => v.name.includes('Google') || v.name.includes('Premium') || v.lang.startsWith('en'));
    if (preferredVoice) utterance.voice = preferredVoice;
    utterance.rate = playbackRate;
    utterance.onstart = () => setIsPlaying(true);
    utterance.onend = () => setIsPlaying(false);
    utterance.onerror = () => { setIsPlaying(false); setAudioError("Voice failed"); };
    window.speechSynthesis.speak(utterance);
  };

  const handleTogglePlay = async () => {
    if (isPlaying) { stopAllAudio(); return; }
    if (narratorType === 'FREE') { playNativeSpeech(); return; }
    if (audioBlobUrl && audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
      audioRef.current.play().then(() => setIsPlaying(true)).catch(() => setAudioError("Playback error"));
      return;
    }
    setIsAudioLoading(true);
    setAudioError(null);
    try {
      const shortText = `${data.word}. ${data.definition}. Origins: ${data.etymology.split('.')[0]}.`;
      const buffer = await fetchPronunciation(shortText);
      if (buffer && buffer.byteLength > 0) {
        const wav = createWavHeader(new Int16Array(buffer), 24000);
        const url = URL.createObjectURL(wav);
        setAudioBlobUrl(url);
        if (audioRef.current) {
          audioRef.current.src = url;
          audioRef.current.playbackRate = playbackRate;
          audioRef.current.play().then(() => setIsPlaying(true));
        }
      } else { setAudioError("AI Limit reached"); }
    } catch { setAudioError("AI Limit reached"); } finally { setIsAudioLoading(false); }
  };

  const handleShare = () => {
    if (onShare) onShare();
    if (window.Telegram?.WebApp) {
      const tg = window.Telegram.WebApp as TelegramWebApp;
      tg.HapticFeedback.impactOccurred('medium');
      tg.switchInlineQuery(`${data.word}: ${data.definition.substring(0, 90)}...`, ['users', 'groups']);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(`${data.word.toUpperCase()}\n\n${data.definition}\n\n${data.etymology}`);
    if (window.Telegram?.WebApp) window.Telegram.WebApp.HapticFeedback.notificationOccurred('success');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadAudio = () => {
    if (!audioBlobUrl) return;
    const link = document.createElement('a');
    link.href = audioBlobUrl;
    link.download = `${data.word}_pronunciation.wav`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="pb-24 md:pb-8 space-y-5">
      <div className="bg-tg-bg rounded-[2.5rem] p-5 md:p-8 shadow-soft border border-tg-hint/10 relative overflow-hidden">
        
        {/* Header Actions */}
        <div className="flex justify-between items-center mb-6">
          <span className="px-3 py-1 bg-tg-secondaryBg text-tg-hint text-[10px] font-black uppercase tracking-widest rounded-full border border-tg-hint/5">
            {data.partOfSpeech}
          </span>
          <div className="flex gap-2">
            <button onClick={handleCopy} className="p-2.5 rounded-full bg-tg-secondaryBg text-tg-hint hover:text-tg-text transition-colors">
              {copied ? <Check size={16} className="text-green-500" /> : <Copy size={16} />}
            </button>
            <button onClick={handleShare} className="p-2.5 rounded-full bg-tg-secondaryBg text-tg-hint hover:text-tg-button transition-colors">
              <Share2 size={16} />
            </button>
          </div>
        </div>

        {/* Word Hero */}
        <div className="mb-6 px-1">
          <h1 className="text-5xl md:text-7xl font-serif font-black text-tg-text tracking-tighter capitalize mb-1 leading-none">{data.word}</h1>
          <p className="text-xl text-tg-hint font-mono tracking-wider opacity-80">{data.phonetic}</p>
        </div>

        {/* Dynamic Image */}
        <div className="relative mb-6 rounded-3xl overflow-hidden bg-tg-secondaryBg aspect-[4/3] md:aspect-video border border-tg-hint/5 shadow-inner">
          {isImageLoading ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center space-y-3">
              <Loader2 className="animate-spin text-tg-button" size={32} />
              <span className="text-[10px] font-bold uppercase tracking-widest text-tg-hint animate-pulse">Painting word context...</span>
            </div>
          ) : aiImage ? (
            <img src={aiImage} alt={data.word} className="w-full h-full object-cover transition-transform duration-700 hover:scale-110" />
          ) : (
            <button onClick={loadImage} className="absolute inset-0 flex flex-col items-center justify-center text-tg-hint group">
              <RefreshCw size={32} className="mb-2 group-active:rotate-180 transition-transform" />
              <span className="text-xs font-bold uppercase">Retry Visualization</span>
            </button>
          )}
        </div>

        {/* RESPONSIVE NARRATOR PLAYER */}
        <div className="bg-tg-secondaryBg/40 backdrop-blur-xl rounded-[2rem] p-4 border border-tg-hint/10">
          
          <div className="flex bg-tg-bg/50 p-1 rounded-2xl mb-4 border border-tg-hint/5">
            <button 
              onClick={() => { setNarratorType('AI'); stopAllAudio(); }}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${narratorType === 'AI' ? 'bg-tg-button text-white shadow-md' : 'text-tg-hint hover:text-tg-text'}`}
            >
              <Sparkles size={14} className={narratorType === 'AI' ? 'animate-pulse' : ''} />
              AI Narrator
            </button>
            <button 
              onClick={() => { setNarratorType('FREE'); stopAllAudio(); }}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${narratorType === 'FREE' ? 'bg-purple-600 text-white shadow-md' : 'text-tg-hint hover:text-tg-text'}`}
            >
              <Zap size={14} />
              Free Narrator
            </button>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-4">
            <button 
              onClick={handleTogglePlay}
              disabled={isAudioLoading}
              className={`w-14 h-14 sm:w-16 sm:h-16 rounded-full flex items-center justify-center shadow-xl transition-all active:scale-90 shrink-0 ${narratorType === 'AI' ? 'bg-tg-button' : 'bg-purple-600'} text-white group`}
            >
              {isAudioLoading ? <Loader2 size={24} className="animate-spin" /> : isPlaying ? <Pause size={28} fill="currentColor" /> : <Play size={28} fill="currentColor" className="ml-1 group-hover:scale-110 transition-transform" />}
            </button>

            <div className="flex-1 w-full text-center sm:text-left">
              <div className="flex items-center justify-center sm:justify-between mb-2">
                <span className={`text-[10px] font-black uppercase tracking-widest ${audioError ? 'text-amber-600' : 'text-tg-hint'}`}>
                  {audioError || (isAudioLoading ? 'Generating...' : isPlaying ? 'Now Playing' : 'Ready to Speak')}
                </span>
                {audioError === "AI Limit reached" && narratorType === 'AI' && (
                  <button onClick={() => setNarratorType('FREE')} className="hidden sm:flex items-center gap-1 text-[10px] font-bold text-tg-button animate-bounce">
                    Switch to Free <ChevronRight size={10} />
                  </button>
                )}
              </div>
              <div className="h-2 bg-tg-hint/10 rounded-full overflow-hidden shadow-inner">
                <div 
                  className={`h-full rounded-full transition-all duration-300 ${isPlaying ? (narratorType === 'AI' ? 'bg-tg-button' : 'bg-purple-600') + ' w-full animate-pulse' : 'w-0'}`}
                ></div>
              </div>
            </div>

            <div className="flex items-center gap-3 shrink-0">
               <button 
                onClick={() => setPlaybackRate(r => r >= 2 ? 1 : r + 0.25)} 
                className="w-10 h-10 rounded-xl bg-tg-bg/50 text-[10px] font-black text-tg-text border border-tg-hint/5 flex items-center justify-center hover:bg-tg-bg transition-colors"
               >
                 {playbackRate}x
               </button>
               {narratorType === 'AI' && (
                 <button onClick={handleDownloadAudio} className="w-10 h-10 rounded-xl bg-tg-bg/50 text-tg-hint flex items-center justify-center border border-tg-hint/5 hover:text-tg-button transition-colors">
                    <Download size={18} />
                 </button>
               )}
            </div>
          </div>
          
          {audioError === "AI Limit reached" && narratorType === 'AI' && (
            <button 
              onClick={() => { setNarratorType('FREE'); setAudioError(null); }}
              className="w-full mt-4 py-3 bg-amber-500/10 text-amber-700 dark:text-amber-400 text-[10px] font-black uppercase tracking-widest rounded-xl border border-amber-500/20 flex items-center justify-center gap-2 animate-in slide-in-from-top-2 sm:hidden"
            >
              <Zap size={14} className="fill-amber-500" />
              AI Limit Reached - Tap to switch to Free
            </button>
          )}
        </div>

        <audio ref={audioRef} onEnded={() => setIsPlaying(false)} />
      </div>

      {/* Details Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-tg-bg rounded-3xl p-6 border border-tg-hint/10 shadow-soft">
          <div className="flex items-center gap-3 mb-4 text-tg-button">
            <BookOpenCheck size={20} />
            <h2 className="font-black uppercase tracking-widest text-xs">Definition</h2>
          </div>
          <p className="text-lg leading-relaxed font-serif text-tg-text/90 italic">{data.definition}</p>
        </div>
        <div className="bg-tg-bg rounded-3xl p-6 border border-tg-hint/10 shadow-soft">
          <div className="flex items-center gap-3 mb-4 text-purple-600">
            <GitFork size={20} />
            <h2 className="font-black uppercase tracking-widest text-xs">Etymology</h2>
          </div>
          <p className="text-base leading-relaxed text-tg-text/80">{data.etymology}</p>
        </div>
      </div>

      {/* Roots */}
      <div className="bg-tg-bg rounded-[2.5rem] p-6 border border-tg-hint/10 shadow-soft">
        <div className="flex items-center gap-3 mb-6 text-amber-600">
          <Users size={20} />
          <h2 className="font-black uppercase tracking-widest text-xs">Ancestry</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {data.roots.map((root, i) => (
            <div key={i} className="bg-tg-secondaryBg/30 rounded-2xl p-4 border border-tg-hint/5 text-center flex flex-col justify-center items-center">
              <span className="text-[9px] font-black uppercase text-tg-hint mb-1 opacity-60">{root.language}</span>
              <span className="text-xl font-black text-tg-text font-serif leading-tight">{root.term}</span>
              <span className="text-xs text-tg-hint italic mt-1">"{root.meaning}"</span>
            </div>
          ))}
        </div>
      </div>

      {/* Fun Fact & Synonyms Combined Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Fun Fact */}
        <div className="md:col-span-2 bg-gradient-to-br from-yellow-400/5 to-orange-500/5 rounded-[2.5rem] p-6 border border-yellow-500/10 flex items-start gap-4 shadow-sm">
          <div className="p-3 bg-yellow-400/10 text-yellow-600 rounded-2xl shrink-0"><Lightbulb size={24} /></div>
          <div>
            <h3 className="text-[10px] font-black uppercase tracking-widest text-yellow-700 mb-1 opacity-80">Did you know?</h3>
            <p className="text-base font-medium text-tg-text/90 leading-relaxed italic">"{data.funFact}"</p>
          </div>
        </div>

        {/* Synonyms */}
        <div className="bg-tg-bg rounded-[2.5rem] p-6 border border-tg-hint/10 shadow-soft flex flex-col">
          <div className="flex items-center gap-2 mb-4 text-emerald-600">
            <Layers size={18} />
            <h2 className="font-black uppercase tracking-widest text-xs">Echoes</h2>
          </div>
          <div className="flex flex-wrap gap-2">
             {data.synonyms.length > 0 ? (
               data.synonyms.slice(0, 5).map(syn => (
                 <span key={syn} className="px-3 py-1.5 bg-tg-secondaryBg rounded-xl text-xs font-bold text-tg-text/70 border border-tg-hint/5">
                   {syn}
                 </span>
               ))
             ) : (
               <span className="text-xs text-tg-hint italic">No echoes found.</span>
             )}
          </div>
        </div>
      </div>
    </div>
  );
};
