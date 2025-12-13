import React, { useState, useEffect, useRef, useCallback } from 'react';
import { CameraMode, Sticker, AspectRatio, FilterSettings, GalleryItem, FrameData, CameraResolution } from '../types';
import { 
  IconCameraRotate, IconGrid, IconSticker, 
  IconClose, IconTrash, IconSliders, IconFrame, IconHome
} from './Icons';
import StickerCanvas from './StickerCanvas';
import { getTimestampStr, formatTime } from '../utils';
import { WebGLRenderer } from '../renderer';

// Constants
const BOUNCE_TRANSITION = "transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)]";
const SMOOTH_TRANSITION = "transition-all duration-500 ease-in-out";

// UI Styles - Light Blue Frosted Glass
const SIDEBAR_BTN = `w-10 h-10 rounded-full bg-white/40 backdrop-blur-md border border-white/60 text-slate-700 flex items-center justify-center shadow-sm mb-4 active:scale-90 hover:bg-white/80 hover:text-sky-600 transition-all`;
const TOP_PILL = "flex items-center bg-white/40 backdrop-blur-md rounded-full px-1 py-1 pointer-events-auto border border-white/40 shadow-sm";
const PILL_BTN = "px-3 py-1 rounded-full text-[10px] font-black text-slate-600 hover:bg-white/60 transition-colors";

const DEFAULT_FILTERS: FilterSettings = {
  brightness: 100, contrast: 100, saturation: 100, hue: 0, sepia: 0, blur: 0, temperature: 0, tint: 0
};

const PRESETS: { name: string; settings: FilterSettings }[] = [
  { name: '原图', settings: { ...DEFAULT_FILTERS } },
  { name: '鲜明', settings: { ...DEFAULT_FILTERS, brightness: 115, contrast: 125, saturation: 130 } },
  { name: '鲜暖色', settings: { ...DEFAULT_FILTERS, brightness: 110, contrast: 120, saturation: 125, temperature: 40, tint: 15 } },
  { name: '鲜冷色', settings: { ...DEFAULT_FILTERS, brightness: 110, contrast: 120, saturation: 125, temperature: -40, tint: -10 } },
  { name: '柔和', settings: { ...DEFAULT_FILTERS, brightness: 120, contrast: 85, saturation: 90, temperature: 10 } },
  { name: '自然增强', settings: { ...DEFAULT_FILTERS, brightness: 108, contrast: 115, saturation: 120, temperature: 5 } }, 
  { name: '日系清新', settings: { ...DEFAULT_FILTERS, brightness: 118, contrast: 90, saturation: 92, temperature: 8, tint: -3 } },
  { name: 'Ins风', settings: { ...DEFAULT_FILTERS, brightness: 110, contrast: 112, saturation: 110, temperature: 15, tint: 5 } },
  { name: '黑白', settings: { ...DEFAULT_FILTERS, contrast: 130, saturation: 0 } },
];

const getCSSFilterString = (f: FilterSettings) => {
  return `brightness(${f.brightness}%) contrast(${f.contrast}%) saturate(${f.saturation}%) hue-rotate(${f.hue}deg) sepia(${f.sepia}%) blur(${f.blur}px)`;
};

// Helper for stopwatch format (SS.cc)
const formatStopwatch = (ms: number) => {
  const seconds = Math.floor(ms / 1000);
  const centis = Math.floor((ms % 1000) / 10);
  return `${seconds.toString().padStart(2, '0')}.${centis.toString().padStart(2, '0')}`;
};

interface CameraProps {
  onBack: () => void;
  onOpenGallery: () => void;
  setGalleryItems: React.Dispatch<React.SetStateAction<GalleryItem[]>>;
  galleryItems: GalleryItem[];
  frames: FrameData[];
  setFrames: React.Dispatch<React.SetStateAction<FrameData[]>>;
  availableStickers: {id: string, url: string}[];
  setAvailableStickers: React.Dispatch<React.SetStateAction<{id: string, url: string}[]>>;
}

const Camera: React.FC<CameraProps> = ({ 
  onBack, onOpenGallery, setGalleryItems, galleryItems,
  frames, setFrames,
  availableStickers, setAvailableStickers
}) => {
  // State
  const [mode, setMode] = useState<CameraMode>(CameraMode.PHOTO);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [resolution, setResolution] = useState<CameraResolution>('1080P');
  const [stickers, setStickers] = useState<Sticker[]>([]);
  const [selectedStickerId, setSelectedStickerId] = useState<string | null>(null);
  const [gridOn, setGridOn] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [isFlipping, setIsFlipping] = useState(false);
  
  // Live Photo Settings
  const [liveDuration, setLiveDuration] = useState<1.5 | 3.0>(1.5);
  // liveCountdown stores remaining milliseconds
  const [liveCountdown, setLiveCountdown] = useState<number | null>(null);

  // Modals
  const [showStickerPicker, setShowStickerPicker] = useState(false);
  const [showFramePicker, setShowFramePicker] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  
  // Settings
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('3:4');
  const [customRatioValue, setCustomRatioValue] = useState<number | null>(null);
  const [filters, setFilters] = useState<FilterSettings>(DEFAULT_FILTERS);
  const [activePresetName, setActivePresetName] = useState('原图');
  
  // Frame State
  const [selectedFrame, setSelectedFrame] = useState<FrameData | null>(null);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  
  // Dimensions
  const [viewportDims, setViewportDims] = useState({ w: window.innerWidth, h: window.innerWidth * 1.33 });

  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null); 
  const stickerCanvasRef = useRef<HTMLCanvasElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<any>(null);
  const frameImageRef = useRef<HTMLImageElement | null>(null);
  const webglRendererRef = useRef<WebGLRenderer | null>(null);
  const animFrameRef = useRef<number>(0);

  // Mutable refs
  const filtersRef = useRef(filters);
  const facingModeRef = useRef(facingMode);

  useEffect(() => { filtersRef.current = filters; }, [filters]);
  useEffect(() => { facingModeRef.current = facingMode; }, [facingMode]);

  useEffect(() => {
    if (selectedFrame && selectedFrame.url) {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = selectedFrame.url;
      img.onload = () => { frameImageRef.current = img; };
      setAspectRatio(selectedFrame.aspectRatio);
    } else {
      frameImageRef.current = null;
    }
  }, [selectedFrame]);

  // Viewport Calculation - Smooth
  useEffect(() => {
    const handleResize = () => {
      const w = window.innerWidth;
      
      let targetH = w;
      let ratioVal = 4/3; 

      if (aspectRatio === '1:1') ratioVal = 1;
      else if (aspectRatio === '3:4') ratioVal = 4/3;
      else if (aspectRatio === '4:3') ratioVal = 3/4;
      else if (aspectRatio === '9:16') ratioVal = 16/9;
      else if (aspectRatio === '16:9') ratioVal = 9/16;
      else if (aspectRatio === '自定义' && customRatioValue) ratioVal = 1/customRatioValue;
      else if (typeof aspectRatio === 'string' && aspectRatio.includes(':')) {
           const parts = aspectRatio.split(':');
           if(parts.length === 2) ratioVal = Number(parts[1])/Number(parts[0]);
      }
      
      targetH = w * ratioVal;
      setViewportDims({ w, h: targetH });
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [aspectRatio, customRatioValue]);

  useEffect(() => {
    const startCamera = async () => {
      if (stream) stream.getTracks().forEach(t => t.stop());
      
      let widthConstraint: number;
      let heightConstraint: number;
      
      switch (resolution) {
          case '720P': widthConstraint = 1280; heightConstraint = 720; break;
          case '2K': widthConstraint = 2560; heightConstraint = 1440; break;
          case '4K': widthConstraint = 3840; heightConstraint = 2160; break;
          case '1080P':
          default: widthConstraint = 1920; heightConstraint = 1080; break;
      }

      try {
        const newStream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: facingMode,
            width: { ideal: widthConstraint },
            height: { ideal: heightConstraint },
          },
          audio: true
        });
        setStream(newStream);
        if (videoRef.current) {
          videoRef.current.srcObject = newStream;
          videoRef.current.onloadedmetadata = () => videoRef.current?.play();
        }
      } catch (err) {
        console.error("Camera access denied", err);
        if (resolution !== '1080P') setResolution('1080P'); 
      }
    };
    startCamera();
    return () => {
      if(stream) stream.getTracks().forEach(t => t.stop());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facingMode, resolution]);

  useEffect(() => {
    if (canvasRef.current && !webglRendererRef.current) {
      try { webglRendererRef.current = new WebGLRenderer(canvasRef.current); } 
      catch (e) { console.error("WebGL Init Failed", e); }
    }
  }, [viewportDims]);

  const renderLoop = useCallback(() => {
    const video = videoRef.current;
    const renderer = webglRendererRef.current;
    const canvas = canvasRef.current;
    if (video && renderer && canvas && video.readyState >= 2) {
      if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      }
      renderer.render(video, filtersRef.current, facingModeRef.current === 'user');
    }
    animFrameRef.current = requestAnimationFrame(renderLoop);
  }, []);

  useEffect(() => {
    renderLoop();
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [renderLoop]);

  const saveToGallery = (blob: Blob, type: 'image' | 'video', filename: string) => {
    const url = URL.createObjectURL(blob);
    const newItem: GalleryItem = {
      id: Date.now().toString() + Math.random().toString().slice(2, 5),
      type, url, blob, timestamp: new Date().toLocaleTimeString(), filename
    };
    setGalleryItems(prev => [...prev, newItem]);
  };

  const takePhoto = () => {
    const glCanvas = canvasRef.current;
    const stickerCanvas = stickerCanvasRef.current;
    if (!glCanvas || !stickerCanvas) return;

    try {
      const w = glCanvas.width;
      const h = glCanvas.height;
      const compositeCanvas = document.createElement('canvas');
      compositeCanvas.width = w; compositeCanvas.height = h;
      const ctx = compositeCanvas.getContext('2d');
      if (!ctx) return;

      // Draw standard layers
      ctx.drawImage(glCanvas, 0, 0);
      if (frameImageRef.current && selectedFrame) ctx.drawImage(frameImageRef.current, 0, 0, w, h);
      ctx.drawImage(stickerCanvas, 0, 0, w, h);

      const desiredAspect = viewportDims.w / viewportDims.h;
      const actualAspect = w / h;
      let cropW = w, cropH = h, cropX = 0, cropY = 0;

      if (actualAspect > desiredAspect) {
        cropW = h * desiredAspect; cropX = (w - cropW) / 2;
      } else {
        cropH = w / desiredAspect; cropY = (h - cropH) / 2;
      }
      
      const finalCanvas = document.createElement('canvas');
      finalCanvas.width = cropW; finalCanvas.height = cropH;
      const finalCtx = finalCanvas.getContext('2d');
      if (!finalCtx) return;
      finalCtx.drawImage(compositeCanvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

      finalCanvas.toBlob((blob) => {
        if (blob) saveToGallery(blob, 'image', `photo_${getTimestampStr()}.jpg`);
      }, 'image/jpeg', 0.95);
    } catch (e) { console.error(e); }
  };

  const handleCapture = () => {
    if (mode === 'PHOTO') {
        takePhoto();
    }
    else if (mode === 'LIVE') {
        if (!canvasRef.current) return;
        try {
            // Start recording immediately
            const stream = canvasRef.current.captureStream(30);
            const mimeType = MediaRecorder.isTypeSupported('video/mp4') ? 'video/mp4' : 'video/webm'; 
            const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 2500000 });
            const chunks: Blob[] = [];
            
            recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
            recorder.onstop = () => {
                const blob = new Blob(chunks, { type: mimeType });
                saveToGallery(blob, 'video', `live_video_${getTimestampStr()}.${mimeType === 'video/mp4' ? 'mp4' : 'webm'}`);
                setLiveCountdown(null);
            };
            
            recorder.start();
            setIsRecording(true);
            
            // Countdown Logic (High Precision)
            const startTime = Date.now();
            const durationMs = liveDuration * 1000;
            setLiveCountdown(durationMs); // Initial set
            
            const tick = () => {
                const elapsed = Date.now() - startTime;
                const remaining = Math.max(0, durationMs - elapsed);
                
                if (remaining > 0) {
                    setLiveCountdown(remaining);
                    requestAnimationFrame(tick);
                } else {
                    setLiveCountdown(0);
                    // KEYFRAME LOGIC: Capture last frame
                    takePhoto(); 
                    // Stop Recording
                    recorder.stop();
                    setIsRecording(false);
                }
            };
            tick();
            
        } catch(e) { console.error(e); setIsRecording(false); }
    } else if (mode === 'VIDEO') {
        if (isRecording) {
            if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') mediaRecorderRef.current.stop();
        } else {
            if (!canvasRef.current) return;
            try {
                const stream = canvasRef.current.captureStream(30);
                if (videoRef.current && videoRef.current.srcObject) {
                    const audioTracks = (videoRef.current.srcObject as MediaStream).getAudioTracks();
                    if (audioTracks.length > 0) stream.addTrack(audioTracks[0]);
                }
                const mimeType = MediaRecorder.isTypeSupported('video/mp4') ? 'video/mp4' : 'video/webm';
                mediaRecorderRef.current = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 2500000 });
                chunksRef.current = [];
                mediaRecorderRef.current.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
                mediaRecorderRef.current.onstop = () => {
                    const blob = new Blob(chunksRef.current, { type: mimeType });
                    saveToGallery(blob, 'video', `video_${getTimestampStr()}.${mimeType === 'video/mp4' ? 'mp4' : 'webm'}`);
                    setIsRecording(false); setRecordingTime(0); clearInterval(timerIntervalRef.current);
                };
                mediaRecorderRef.current.start(100); 
                setIsRecording(true);
                timerIntervalRef.current = setInterval(() => {
                    setRecordingTime(prev => { if (prev >= 60) { mediaRecorderRef.current?.stop(); return 60; } return prev + 1; });
                }, 1000);
            } catch (e) { console.error(e); setIsRecording(false); }
        }
    }
  };

  const flipCamera = () => {
      setIsFlipping(true);
      setTimeout(() => setIsFlipping(false), 400); // Sync with CSS blur transition
      setTimeout(() => {
          setFacingMode(p => p === 'user' ? 'environment' : 'user');
      }, 200); // Change logic halfway through
  };

  const openFilters = () => {
    if (videoRef.current) {
      try {
        const v = videoRef.current;
        const cvs = document.createElement('canvas');
        const aspect = v.videoWidth / v.videoHeight;
        cvs.width = 160; cvs.height = 160 / aspect;
        const ctx = cvs.getContext('2d');
        if (ctx) {
           if (facingMode === 'user') { ctx.translate(cvs.width, 0); ctx.scale(-1, 1); }
           ctx.drawImage(v, 0, 0, cvs.width, cvs.height);
           setThumbnailUrl(cvs.toDataURL());
        }
      } catch (e) { console.warn(e); }
    }
    setShowFilters(true);
  };
  
  const toggleAspectRatio = () => {
      const next: Record<string, AspectRatio> = {
          '3:4': '9:16', '9:16': '1:1', '1:1': '4:3', '4:3': '16:9', '16:9': '自定义', '自定义': '3:4'
      };
      
      const newRatio = next[aspectRatio as string] || '3:4';
      if (newRatio === '自定义') {
          const input = prompt("输入自定义宽高比 (例如 2.35:1 或 2:1)", "2:1");
          if (input) {
              const parts = input.split(':');
              if (parts.length === 2 && !isNaN(Number(parts[0])) && !isNaN(Number(parts[1]))) {
                  setCustomRatioValue(Number(parts[0]) / Number(parts[1]));
                  setAspectRatio('自定义');
              } else setAspectRatio('3:4');
          } else setAspectRatio('3:4');
      } else {
          setAspectRatio(newRatio);
      }
  };

  const toggleResolution = () => {
      const next: Record<CameraResolution, CameraResolution> = {
          '720P': '1080P', '1080P': '2K', '2K': '4K', '4K': '720P'
      };
      setResolution(next[resolution]);
  };

  return (
    <div className="fixed inset-0 bg-sky-50 flex flex-col z-50 animate-fade-in font-sans overflow-hidden">
       {/* Top Bar - Light Frosted Glass */}
      <div className="absolute top-0 left-0 w-full z-40 px-4 py-3 pt-safe flex justify-between items-center pointer-events-none bg-gradient-to-b from-white/20 to-transparent">
         {/* Home */}
         <button onClick={onBack} className="w-10 h-10 rounded-full bg-white/40 backdrop-blur-md flex items-center justify-center text-slate-700 pointer-events-auto active:scale-90 transition-transform shadow-sm hover:bg-white/60">
             <IconHome className="w-5 h-5"/>
         </button>

         {/* Center Pill: Res | Ratio */}
         <div className={TOP_PILL}>
            <button onClick={toggleResolution} className={PILL_BTN}>{resolution}</button>
            <div className="w-px h-3 bg-slate-300/50"></div>
            <button onClick={toggleAspectRatio} className={`${PILL_BTN} relative`}>
               {aspectRatio}
               {selectedFrame && selectedFrame.id !== 'none' && <span className="absolute top-1.5 right-1 w-1.5 h-1.5 bg-sky-400 rounded-full"></span>}
            </button>
         </div>

         {/* Grid Toggle */}
         <button onClick={() => setGridOn(!gridOn)} className={`w-10 h-10 rounded-full flex items-center justify-center pointer-events-auto transition-colors shadow-sm ${gridOn ? 'bg-sky-500 text-white' : 'bg-white/40 text-slate-700 backdrop-blur-md hover:bg-white/60'}`}>
             <IconGrid on={gridOn} className="w-5 h-5" />
         </button>
      </div>

      {/* Main Camera Viewport Area */}
      <div className="flex-1 relative flex items-center justify-center overflow-hidden bg-sky-50">
        {/* The Viewport */}
        <div 
            style={{ width: viewportDims.w, height: viewportDims.h }} 
            className={`relative shadow-2xl bg-black overflow-hidden ring-1 ring-black/5 ${isFlipping ? 'camera-flipping' : 'camera-stable'} ${SMOOTH_TRANSITION}`}
        >
          {activePresetName !== '原图' && (
             <div className="absolute top-24 left-4 z-20 px-3 py-1 bg-black/30 backdrop-blur-xl rounded-full border border-white/20 shadow-sm">
               <span className="text-[10px] text-white font-bold tracking-widest uppercase shadow-black drop-shadow-md">{activePresetName}</span>
             </div>
          )}
          
          {/* Live Countdown Display (Stopwatch Style) */}
          {liveCountdown !== null && (
              <div className="absolute top-24 left-1/2 -translate-x-1/2 z-30 bg-yellow-400 text-black px-4 py-1.5 rounded-full font-mono shadow-xl text-lg font-black border border-white/30 animate-pulse tracking-wider">
                  {formatStopwatch(liveCountdown)}
              </div>
          )}

          <video ref={videoRef} autoPlay playsInline muted className="hidden" />
          <canvas ref={canvasRef} className="absolute top-0 left-0 w-full h-full object-cover" />
          {selectedFrame && selectedFrame.url && <div className="absolute inset-0 z-20 pointer-events-none"><img src={selectedFrame.url} alt="frame" className="w-full h-full object-fill" /></div>}
          <StickerCanvas stickers={stickers} setStickers={setStickers} width={viewportDims.w} height={viewportDims.h} canvasRef={stickerCanvasRef} selectedStickerId={selectedStickerId} setSelectedStickerId={setSelectedStickerId} />
          {gridOn && <div className="absolute inset-0 z-30 pointer-events-none grid grid-cols-3 grid-rows-3 opacity-90"><div className="border-r border-white/60 shadow-[0_0_2px_rgba(0,0,0,0.3)]"></div><div className="border-r border-white/60 shadow-[0_0_2px_rgba(0,0,0,0.3)]"></div><div></div><div className="border-r border-white/60 border-t border-b shadow-[0_0_2px_rgba(0,0,0,0.3)]"></div><div className="border-r border-white/60 border-t border-b shadow-[0_0_2px_rgba(0,0,0,0.3)]"></div><div className="border-t border-b border-white/60 shadow-[0_0_2px_rgba(0,0,0,0.3)]"></div><div className="border-r border-white/60 shadow-[0_0_2px_rgba(0,0,0,0.3)]"></div><div className="border-r border-white/60 shadow-[0_0_2px_rgba(0,0,0,0.3)]"></div><div></div></div>}
          
          {/* Right Sidebar - Light Theme */}
          <div className="absolute top-24 right-4 z-30 flex flex-col items-center pointer-events-auto">
              {/* Rotate Filter Button 90deg when active */}
              <button onClick={openFilters} className={`${SIDEBAR_BTN} ${showFilters ? 'rotate-90 bg-white shadow-md' : ''}`}>
                  <IconSliders className={`w-5 h-5 ${showFilters ? 'text-pink-500' : ''}`} />
                  <span className="absolute right-12 bg-white/80 text-slate-600 text-[10px] px-2 py-1 rounded shadow-sm opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap backdrop-blur-sm">滤镜</span>
              </button>
              <button onClick={() => setShowStickerPicker(true)} className={SIDEBAR_BTN}>
                  <IconSticker className="w-5 h-5" />
              </button>
              <button onClick={() => setShowFramePicker(true)} className={`${SIDEBAR_BTN} ${selectedFrame && selectedFrame.id !== 'none' ? 'border-sky-400 text-sky-500 bg-sky-50' : ''}`}>
                  <IconFrame className="w-5 h-5" />
              </button>
          </div>
        </div>

        {selectedStickerId && <div className="absolute bottom-32 left-0 w-full flex justify-center z-30 pointer-events-none"><button onClick={() => { setStickers(p => p.filter(s => s.id !== selectedStickerId)); setSelectedStickerId(null); }} className="bg-red-500 text-white px-6 py-3 rounded-full pointer-events-auto shadow-xl flex items-center gap-2 text-xs font-bold"><IconTrash className="w-4 h-4" /> 删除</button></div>}
        {isRecording && mode === 'VIDEO' && <div className="absolute top-24 left-1/2 -translate-x-1/2 z-30 bg-red-500 text-white px-4 py-1.5 rounded-full font-mono animate-pulse shadow-xl text-sm font-bold">{formatTime(recordingTime)}</div>}
      
        {/* Filters Panel */}
        {showFilters && (
          <div className="absolute bottom-32 left-4 right-4 md:left-1/2 md:-translate-x-1/2 md:w-80 z-40 bg-white/70 backdrop-blur-xl rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.1)] border border-white/60 animate-slide-up flex flex-col p-4 max-h-[50vh]">
            <div className="flex justify-between items-center mb-4 px-2">
              <span className="text-xs font-black text-slate-500 tracking-widest uppercase">滤镜</span>
              <button onClick={() => setShowFilters(false)} className="p-1 bg-slate-100 rounded-full hover:bg-slate-200 text-slate-500"><IconClose className="w-4 h-4"/></button>
            </div>
            <div className="overflow-x-auto flex gap-3 pb-4 hide-scrollbar px-1">
              {PRESETS.map((p) => (
                <button key={p.name} onClick={() => { setFilters(p.settings); setActivePresetName(p.name); }} className="flex flex-col gap-2 items-center flex-shrink-0 group">
                  <div className={`w-12 h-12 rounded-xl overflow-hidden relative transition-all duration-300 ${activePresetName === p.name ? 'ring-2 ring-sky-500 scale-105 shadow-md' : 'ring-1 ring-slate-200'}`}>
                     {thumbnailUrl ? <img src={thumbnailUrl} className="w-full h-full object-cover" style={{ filter: getCSSFilterString(p.settings) }} alt={p.name} /> : <div className="w-full h-full bg-slate-200" />}
                  </div>
                  <span className={`text-[9px] font-bold tracking-wide uppercase ${activePresetName === p.name ? 'text-sky-600' : 'text-slate-400'}`}>{p.name}</span>
                </button>
              ))}
            </div>
             <div className="overflow-y-auto space-y-3 px-1 pr-2 max-h-[200px] hide-scrollbar">
               {[
                 { label: '模糊', key: 'blur', min: 0, max: 20 },
                 { label: '亮度', key: 'brightness', min: 50, max: 150 },
                 { label: '对比', key: 'contrast', min: 50, max: 150 },
                 { label: '饱和', key: 'saturation', min: 0, max: 200 },
                 { label: '色温', key: 'temperature', min: -50, max: 50 },
                 { label: '色调', key: 'tint', min: -50, max: 50 },
               ].map((item: any) => (
                  <div key={item.key} className="flex items-center gap-3">
                     <span className="text-[10px] font-bold text-slate-500 w-8 text-right">{item.label}</span>
                     <input type="range" min={item.min} max={item.max} step={1} value={(filters as any)[item.key]} onChange={e => { setFilters(f => ({...f, [item.key]: Number(e.target.value)})); setActivePresetName('自定义'); }} className="flex-1 h-1 bg-slate-300/50 rounded-full accent-sky-500" />
                  </div>
               ))}
            </div>
          </div>
        )}
      </div>

      {/* Bottom Control Bar - Light & Airy Frosted Glass */}
      <div className="z-40 bg-white/20 backdrop-blur-xl border-t border-white/40 pb-safe pt-2">
        {/* Live Duration Toggle - Only show in Live Mode */}
        {mode === 'LIVE' && (
           <div className="absolute top-[-30px] w-full flex justify-center">
              <div className="bg-black/30 backdrop-blur-md rounded-full p-0.5 flex">
                  <button onClick={()=>setLiveDuration(1.5)} className={`px-2 py-0.5 rounded-full text-[9px] font-bold transition-colors ${liveDuration === 1.5 ? 'bg-yellow-400 text-black' : 'text-white'}`}>1.5s</button>
                  <button onClick={()=>setLiveDuration(3.0)} className={`px-2 py-0.5 rounded-full text-[9px] font-bold transition-colors ${liveDuration === 3.0 ? 'bg-yellow-400 text-black' : 'text-white'}`}>3.0s</button>
              </div>
           </div>
        )}

        {/* Mode Switcher */}
        <div className="flex justify-center items-center py-2 gap-6 mb-1">
           {Object.values(CameraMode).map(m => (
             <button key={m} onClick={() => setMode(m)} className={`text-[11px] font-bold tracking-widest uppercase transition-all duration-300 ${mode === m ? 'text-slate-800 scale-110 drop-shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>
               {m === 'LIVE' ? '实况' : m === 'PHOTO' ? '拍照' : '视频'}
             </button>
           ))}
        </div>
        
        {/* Main Controls Row */}
        <div className="flex items-center justify-between px-8 pb-5 md:px-32">
           {/* Gallery Button */}
           <div className="flex w-16 justify-start">
              <button onClick={onOpenGallery} className="w-12 h-12 rounded-xl bg-white/40 backdrop-blur-md overflow-hidden shadow-sm border border-white/50 hover:border-sky-200 transition-colors group">
                 {galleryItems.length > 0 ? (
                    galleryItems[galleryItems.length - 1].type === 'image' ? 
                    <img src={galleryItems[galleryItems.length - 1].url} className="w-full h-full object-cover group-hover:scale-110 transition-transform" /> : 
                    <div className="w-full h-full bg-slate-100 flex items-center justify-center text-lg">🎥</div>
                 ) : <div className="w-full h-full bg-slate-100" />}
              </button>
           </div>
           
           {/* Shutter Button - Complex Animation */}
           <div className="flex items-center justify-center -mt-2">
              <button 
                  onClick={handleCapture} 
                  className={`relative w-[76px] h-[76px] rounded-full border-[4px] border-white shadow-lg flex items-center justify-center active:scale-95 transition-transform duration-150 bg-white/20 backdrop-blur-sm`}
              >
                {/* 
                   Shutter Inner Logic:
                   - Photo: Blue Circle
                   - Live: Pure Yellow Circle (Clean) with expanding white inner circle
                   - Video: Red Square
                */}
                <div className={`relative flex items-center justify-center transition-all duration-500 ease-out overflow-hidden
                    ${mode === 'VIDEO' 
                        ? (isRecording ? 'w-6 h-6 rounded-[6px] bg-red-500' : 'w-16 h-16 rounded-full bg-red-500') 
                        : (mode === 'LIVE' ? 'w-16 h-16 rounded-full bg-yellow-400' : 'w-16 h-16 rounded-full bg-sky-500')
                    }
                    ${mode === 'VIDEO' && isRecording ? 'animate-breathe' : ''}
                `}>
                    {/* Live Mode: Expanding White Circle Animation */}
                    {mode === 'LIVE' && (
                        <>
                           {/* The white expansion circle */}
                           <div 
                                className={`absolute bg-white rounded-full pointer-events-none transition-all ease-linear`}
                                style={{
                                    width: isRecording ? '85%' : '0%',
                                    height: isRecording ? '85%' : '0%',
                                    // Expand over duration, shrink fast on end
                                    transitionDuration: isRecording ? `${liveDuration}s` : '0.3s'
                                }}
                           />
                           {/* Dashed Icon - Hides when recording starts */}
                           <div className={`absolute inset-0 flex items-center justify-center transition-opacity duration-300 ${isRecording ? 'opacity-0' : 'opacity-100'}`}>
                                <div className="w-10 h-10 border-2 border-white/50 rounded-full border-dashed"></div>
                           </div>
                        </>
                    )}
                </div>
              </button>
           </div>
           
           {/* Flip Camera */}
           <div className="flex w-16 justify-end">
              <button 
                  onClick={flipCamera} 
                  className={`w-12 h-12 rounded-full bg-white/40 backdrop-blur-md flex items-center justify-center text-slate-700 hover:bg-white hover:text-sky-600 active:scale-90 transition-all border border-white/50 shadow-sm ${isFlipping ? 'animate-flip-x text-sky-500' : ''}`}
              >
                  <IconCameraRotate className="w-6 h-6" />
              </button>
           </div>
        </div>
      </div>

      {/* Frame Picker Modal */}
      {showFramePicker && (
        <div className="absolute inset-0 z-50 bg-black/20 backdrop-blur-sm flex items-end">
          <div className="bg-white/95 backdrop-blur-2xl w-full rounded-t-[2.5rem] p-6 pb-safe animate-slide-up shadow-2xl border-t border-white/50">
            <div className="flex justify-between items-center mb-6 px-2">
              <h3 className="font-bold text-lg text-slate-800 tracking-tight">选择画框</h3>
              <button onClick={() => setShowFramePicker(false)} className="p-2 bg-slate-100 rounded-full hover:bg-slate-200 text-slate-500"><IconClose className="w-5 h-5"/></button>
            </div>
            <div className="flex gap-4 overflow-x-auto pb-6 hide-scrollbar px-2">
               <label className="flex-shrink-0 w-24 h-32 rounded-xl bg-sky-50 border-2 border-dashed border-sky-200 flex flex-col items-center justify-center cursor-pointer active:bg-sky-100 transition-colors group">
                <span className="text-3xl text-sky-400 mb-1 group-hover:scale-110">+</span>
                <span className="text-[10px] text-sky-400 font-bold uppercase">上传</span>
                <input type="file" accept="image/png,image/jpeg" className="hidden" onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                        const url = URL.createObjectURL(file);
                        const img = new Image();
                        img.onload = () => {
                            const ratio = img.width / img.height;
                            let ar: AspectRatio = '3:4';
                            if (Math.abs(ratio - 1) < 0.1) ar = '1:1';
                            else if (Math.abs(ratio - 9/16) < 0.1) ar = '9:16';
                            else if (Math.abs(ratio - 4/3) < 0.1) ar = '4:3';
                            else if (Math.abs(ratio - 16/9) < 0.1) ar = '16:9';
                            else ar = `${img.width}:${img.height}`;

                            const newFrame = { id: 'c_'+Date.now(), name: '自定义', url, aspectRatio: ar };
                            setFrames(p => [...p, newFrame]); setSelectedFrame(newFrame); setAspectRatio(ar); setShowFramePicker(false);
                        };
                        img.src = url;
                    }
                }} />
              </label>
              {frames.map((f, i) => (
                <button key={i} onClick={() => { setSelectedFrame(f.id === 'none' ? null : f); if (f.id !== 'none') setAspectRatio(f.aspectRatio); setShowFramePicker(false); }} className={`flex-shrink-0 w-24 h-32 rounded-xl bg-slate-50 border border-slate-200 shadow-sm p-2 hover:border-sky-300 ${BOUNCE_TRANSITION} hover:-translate-y-1 relative overflow-hidden group`}>
                  {f.id === 'none' ? <div className="w-full h-full flex items-center justify-center text-slate-400 font-bold text-xs uppercase">无画框</div> : <><img src={f.url} className="w-full h-full object-contain pointer-events-none z-10 relative" /><div className="absolute inset-2 bg-slate-200 z-0 opacity-50"></div></>}
                  {selectedFrame?.id === f.id && <div className="absolute inset-0 border-4 border-sky-400 rounded-xl z-20"></div>}
                  <span className="absolute bottom-1 left-0 w-full text-center text-[9px] text-slate-500 font-bold opacity-0 group-hover:opacity-100 transition-opacity">{f.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Sticker Picker Modal */}
      {showStickerPicker && (
        <div className="absolute inset-0 z-50 bg-black/20 backdrop-blur-sm flex items-end">
          <div className="bg-white/95 backdrop-blur-2xl w-full rounded-t-[2.5rem] p-6 pb-safe animate-slide-up shadow-2xl border-t border-white/50">
            <div className="flex justify-between items-center mb-6 px-2">
              <h3 className="font-bold text-lg text-slate-800 tracking-tight">贴纸</h3>
              <button onClick={() => setShowStickerPicker(false)} className="p-2 bg-slate-100 rounded-full hover:bg-slate-200 text-slate-500"><IconClose className="w-5 h-5"/></button>
            </div>
            <div className="flex gap-4 overflow-x-auto pb-6 hide-scrollbar px-2">
              <label className="flex-shrink-0 w-24 h-24 rounded-2xl bg-sky-50 border-2 border-dashed border-sky-200 flex flex-col items-center justify-center cursor-pointer active:bg-sky-100 transition-colors group">
                <span className="text-3xl text-sky-400 mb-1 group-hover:scale-110">+</span>
                <span className="text-[10px] text-sky-400 font-bold uppercase">上传</span>
                <input type="file" accept="image/png,image/jpeg" className="hidden" onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                        const url = URL.createObjectURL(file);
                        const ns: Sticker = { id: Date.now().toString(), url, x: viewportDims.w/2, y: viewportDims.h/2, scale: 1, rotation: 0, aspectRatio: 1 };
                        const img = new Image(); img.onload = () => { ns.aspectRatio = img.width/img.height; setStickers(p=>[...p, ns]); setSelectedStickerId(ns.id); setShowStickerPicker(false); }; img.src = url;
                    }
                }} />
              </label>
              {availableStickers.map((s, i) => (
                <button key={i} onClick={() => { const ns: Sticker = { id: Date.now().toString()+i, url: s.url, x: viewportDims.w/2, y: viewportDims.h/2, scale: 1, rotation: 0, aspectRatio: 1 }; setStickers(p=>[...p, ns]); setSelectedStickerId(ns.id); setShowStickerPicker(false); }} className={`flex-shrink-0 w-24 h-24 rounded-2xl bg-white border border-slate-100 shadow-sm p-4 hover:border-sky-200 ${BOUNCE_TRANSITION} hover:-translate-y-1`}>
                  <img src={s.url} className="w-full h-full object-contain pointer-events-none" alt="sticker" />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Camera;