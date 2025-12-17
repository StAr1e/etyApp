import React, { useState, useEffect, useRef, useCallback } from 'react';
import { WordData, TelegramWebApp } from '../types';
import { Play, Pause, Share2, GitFork, Lightbulb, Copy, Check, Users, BookOpenCheck, Download, Loader2, RefreshCw, AlertCircle } from 'lucide-react';
import { fetchPronunciation, fetchWordImage } from '../services/geminiService';

interface WordCardProps {
  data: WordData;
  initialImage?: string | null;
  onImageLoaded?: (base64: string) => void;
  onShare?: () => void;
}

// --- STANDARD WAV HEADER BUILDER (16-bit Mono PCM) ---
const createWavBlob = (pcmData: Int16Array, sampleRate: number): Blob => {
  const buffer = new ArrayBuffer(44 + pcmData.length * 2);
  const view = new DataView(buffer);

  const writeString = (offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + pcmData.length * 2, true); // Total file size - 8
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // Subchunk1Size
  view.setUint16(20, 1, true); // AudioFormat (PCM = 1)
  view.setUint16(22, 1, true); // NumChannels (Mono = 1)
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // ByteRate (sampleRate * channels * bitsPerSample / 8)
  view.setUint16(32, 2, true); // BlockAlign (channels * bitsPerSample / 8)
  view.setUint16(34, 16, true); // BitsPerSample
  writeString(36, 'data');
  view.setUint32(40, pcmData.length * 2, true); // Subchunk2Size

  for (let i = 0; i < pcmData.length; i++) {
    view.setInt16(44 + i * 2, pcmData[i], true);
  }

  return new Blob([view], { type: 'audio/wav' });
};

export const WordCard: React.FC<WordCardProps> = ({ data, initialImage, onImageLoaded, onShare }) => {
  // Audio State
  const [isPlaying, setIsPlaying] = useState(false);
  const [isAudioLoading, setIsAudioLoading] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [playbackRate, setPlaybackRate] = useState(1.0);
  const [audioBlobUrl, setAudioBlobUrl] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  
  // Image State
  const [aiImage, setAiImage] = useState<string | null>(initialImage || null);
  const [isImageLoading, setIsImageLoading] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);

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
    
    // Cleanup audio on word change
    if (audioBlobUrl) {
      URL.revokeObjectURL(audioBlobUrl);
      setAudioBlobUrl(null);
    }
    setIsPlaying(false);
    setAudioError(null);
  }, [data.word]);

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
         audioRef.current.play().then(() => {
           setIsPlaying(true);
           setAudioError(null);
         }).catch((err) => {
           console.error("Playback Error:", err);
           setAudioError("Playback error. Try again.");
         });
      }
      return;
    }

    setIsAudioLoading(true);
    setAudioError(null);
    try {
      const fullText = `${data.word}. ${data.definition}. Historical origins: ${data.etymology}. Fun fact: ${data.funFact}`;
      
      const audioBuffer = await fetchPronunciation(fullText);
      
      if (audioBuffer && audioBuffer.byteLength > 0) {
        // Aligned length is crucial for Int16Array (each element is 2 bytes)
        const alignedLength = audioBuffer.byteLength - (audioBuffer.byteLength % 2);
        const pcmData = new Int16Array(audioBuffer, 0, alignedLength / 2);
        
        const wavBlob = createWavBlob(pcmData, 24000);
        const url = URL.createObjectURL(wavBlob);
        
        setAudioBlobUrl(url);
        
        if (audioRef.current) {
          audioRef.current.src = url;
          audioRef.current.load();
          audioRef.current.playbackRate = playbackRate;
          
          // Wait for browser to process the load event
          audioRef.current.oncanplaythrough = () => {
            audioRef.current?.play()
              .then(() => {
                setIsPlaying(true);
                setAudioError(null);
              })
              .catch(() => setAudioError("Playback blocked"));
            audioRef.current!.oncanplaythrough = null;
          };
        }
      } else {
        setAudioError("AI Daily limit reached");
      }
    } catch (e: any) {
      const msg = e.message?.toLowerCase() || "";
      if (msg.includes("limit") || msg.includes("quota")) {
        setAudioError("Daily limit reached");
      } else {
        setAudioError("Voice service busy");
      }
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
    if (!audioBlobUrl) {
       await handleTogglePlay();
       audioRef.current?.pause();
       setIsPlaying(false);
    }

    if (!audioBlobUrl) return;

    const filename = `ety_ai_${data.word}.wav`;
    const a = document.createElement('a');
    a.href = audioBlobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    if (window.Telegram?.WebApp && navigator.share) {
      try {
         const response = await fetch(audioBlobUrl);
         const blob = await response.blob();
         const file = new File([blob], filename, { type: 'audio/wav' });
         if (navigator.canShare && navigator.canShare({ files: [file] })) {
           await navigator.share({ files: [file], title: `Ety.ai: ${data.word}` });
         }
      } catch (e) {}
    }
  };

  const handleDownloadImage = async () => {
    if (!aiImage) return;
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
      <div className="bg-tg-bg rounded-3xl p-6 md:p-8 shadow-soft border border-tg-hint/10 relative overflow-hidden group">
        <div className="relative z-10 flex justify-between items-start mb-6">
           <span className="px-3 py-1 bg-tg-secondaryBg text-tg-hint text-xs font-bold rounded-full uppercase tracking-wider border border-tg-hint/10">
             {data.partOfSpeech}
           </span>
           <div className="flex gap-2">
              <button onClick={handleCopy} className="p-2.5 rounded-full bg-tg-secondaryBg text-tg-hint hover:text-tg-text transition-colors">
                {copied ? <Check size={18} className="text-green-500" /> : <Copy size={18} />}
              </button>
              <button onClick={handleShare} className="p-2.5 rounded-full bg-tg-secondaryBg text-tg-hint hover:text-tg-button transition-colors">
                <Share2 size={18} />
              </button>
           </div>
        </div>

        <div className="relative z-10 mb-6">
           <h1 className="text-5xl md:text-6xl font-serif font-black text-tg-text tracking-tight capitalize mb-2">{data.word}</h1>
           <span className="text-xl text-tg-hint font-mono tracking-wide">{data.phonetic}</span>
        </div>

        <div className="relative z-10 mb-8 w-full aspect-square md:aspect-video rounded-2xl overflow-hidden bg-tg-secondaryBg border border-tg-hint/10">
           {isImageLoading ? (
             <div className="w-full h-full flex flex-col items-center justify-center text-tg-hint animate-pulse">
                <Loader2 size={32} className="animate-spin mb-2 text-tg-button" />
                <span className="text-xs font-bold uppercase tracking-wider">Visualizing word...</span>
             </div>
           ) : aiImage ? (
             <div className="relative w-full h-full group/img">
               <img src={aiImage} alt={data.word} className="w-full h-full object-cover" />
               <button 
                 onClick={(e) => { e.stopPropagation(); handleDownloadImage(); }}
                 className="absolute bottom-4 right-4 p-2.5 bg-black/40 text-white rounded-full opacity-0 group-hover/img:opacity-100 transition-all"
               >
                 <Download size={20} />
               </button>
             </div>
           ) : (
             <div className="w-full h-full flex flex-col items-center justify-center text-tg-hint/50 cursor-pointer" onClick={loadImage}>
                <RefreshCw size={32} className="mb-2" />
                <span className="text-xs font-bold">Tap to retry image</span>
             </div>
           )}
        </div>

        {/* Narrator Player UI */}
        <div className={`relative z-10 bg-tg-secondaryBg/50 backdrop-blur-md rounded-2xl p-4 flex items-center gap-4 border transition-colors ${audioError ? 'border-red-500/30' : 'border-tg-hint/5'}`}>
           <button 
             onClick={handleTogglePlay}
             disabled={isAudioLoading}
             className={`w-12 h-12 rounded-full flex items-center justify-center shadow-lg transition-all active:scale-95 ${audioError ? 'bg-red-500 text-white' : 'bg-tg-button text-white'}`}
           >
             {isAudioLoading ? <Loader2 size={20} className="animate-spin" /> : audioError ? <AlertCircle size={20} /> : isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" className="ml-1" />}
           </button>
           
           <div className="flex-1">
              <div className={`text-xs font-bold uppercase tracking-wider mb-1 ${audioError ? 'text-red-500' : 'text-tg-hint'}`}>
                {audioError ? audioError : isAudioLoading ? 'Waking narrator...' : 'Voice Narrator'}
              </div>
              <div className="h-1 bg-tg-hint/10 rounded-full overflow-hidden">
                 <div className={`h-full bg-tg-button rounded-full transition-all duration-300 ${isPlaying ? 'w-full animate-pulse' : 'w-0'}`}></div>
              </div>
           </div>

           <div className="flex items-center gap-1">
             <button onClick={cycleSpeed} className="p-2 text-tg-hint hover:text-tg-text text-xs font-bold w-12 text-center">{playbackRate}x</button>
             <button onClick={handleDownloadAudio} className="p-2 text-tg-hint hover:text-tg-button" title="Save Audio"><Download size={18} /></button>
           </div>
        </div>

        <audio 
          ref={audioRef} 
          onEnded={() => setIsPlaying(false)}
          onError={() => { setIsPlaying(false); setIsAudioLoading(false); setAudioError("Playback Error"); }}
        />
        
        <div className="absolute top-0 right-0 w-64 h-64 bg-tg-button/5 rounded-full blur-3xl pointer-events-none"></div>
      </div>

      {/* Grid Content */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-tg-bg rounded-3xl p-6 border border-tg-hint/10 shadow-sm">
           <div className="flex items-center gap-3 mb-4 text-tg-button">
              <div className="p-2 bg-tg-button/10 rounded-lg"><BookOpenCheck size={20} /></div>
              <h2 className="font-bold text-lg">Meaning</h2>
           </div>
           <p className="text-lg leading-relaxed text-tg-text/90 font-serif">{data.definition}</p>
        </div>
        <div className="bg-tg-bg rounded-3xl p-6 border border-tg-hint/10 shadow-sm">
           <div className="flex items-center gap-3 mb-4 text-purple-600">
              <div className="p-2 bg-purple-500/10 rounded-lg"><GitFork size={20} /></div>
              <h2 className="font-bold text-lg">Origin</h2>
           </div>
           <p className="text-base leading-relaxed text-tg-text/80">{data.etymology}</p>
        </div>
      </div>

      {/* Roots Section */}
      <div className="bg-tg-bg rounded-3xl p-6 border border-tg-hint/10 shadow-sm">
         <div className="flex items-center gap-3 mb-6 text-amber-600">
            <div className="p-2 bg-amber-500/10 rounded-lg"><Users size={20} /></div>
            <h2 className="font-bold text-lg">Linguistic Roots</h2>
         </div>
         <div className="flex flex-col md:flex-row justify-between gap-4">
            {data.roots.map((root, i) => (
              <div key={i} className="flex-1 bg-tg-secondaryBg/50 rounded-2xl p-4 border border-tg-hint/5 flex flex-col items-center text-center">
                 <span className="text-[10px] font-bold uppercase text-tg-hint mb-1">{root.language}</span>
                 <span className="text-xl font-bold text-tg-text mb-1 font-serif">{root.term}</span>
                 <span className="text-sm text-tg-hint italic">"{root.meaning}"</span>
              </div>
            ))}
         </div>
      </div>

      {/* Fact & Synonyms */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
         <div className="md:col-span-2 bg-gradient-to-br from-yellow-500/5 to-orange-500/5 rounded-3xl p-6 border border-yellow-500/10">
            <div className="flex items-center gap-2 mb-3 text-yellow-600 font-bold uppercase text-xs tracking-wider"><Lightbulb size={16} /> Insight</div>
            <p className="text-tg-text font-medium italic">"{data.funFact}"</p>
         </div>
         <div className="bg-tg-bg rounded-3xl p-6 border border-tg-hint/10">
            <div className="font-bold text-tg-hint text-[10px] uppercase tracking-wider mb-4">Synonyms</div>
            <div className="flex flex-wrap gap-2">
               {data.synonyms.slice(0, 4).map(syn => (
                 <span key={syn} className="px-3 py-1.5 bg-tg-secondaryBg rounded-lg text-xs font-medium">{syn}</span>
               ))}
            </div>
         </div>
      </div>
    </div>
  );
};