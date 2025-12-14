
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Sticker, AspectRatio, FilterSettings, GalleryItem, FrameData, Point } from '../types';
import { 
  IconHome, IconGrid, IconSticker, IconClose, IconTrash, IconSliders, IconFrame, IconDownload 
} from './Icons';
import StickerCanvas from './StickerCanvas';
import { getTimestampStr, getDistance, getAngle, getMidpoint, dbAdd, STORE_FRAMES, STORE_STICKERS } from '../utils';
import { WebGLRenderer } from '../renderer';

// Constants
const BOUNCE_TRANSITION = "transition-all duration-300 ease-[cubic-bezier(0.175,0.885,0.32,1.275)]";
const BUTTON_BASE = `flex items-center justify-center rounded-full shadow-sm backdrop-blur-md border border-white/40 ${BOUNCE_TRANSITION} active:scale-90 hover:scale-105`;
const BTN_SECONDARY = `${BUTTON_BASE} w-10 h-10 md:w-12 md:h-12 bg-white/40 text-slate-700 hover:bg-white/80 hover:text-sky-600 hover:shadow-md hover:border-white/60`;

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

interface DecoratorProps {
  media: { type: 'image' | 'video', url: string };
  onBack: () => void;
  setGalleryItems: React.Dispatch<React.SetStateAction<GalleryItem[]>>;
  frames: FrameData[];
  setFrames: React.Dispatch<React.SetStateAction<FrameData[]>>;
  availableStickers: {id: string, url: string, blob?: Blob}[];
  setAvailableStickers: React.Dispatch<React.SetStateAction<{id: string, url: string, blob?: Blob}[]>>;
}

const Decorator: React.FC<DecoratorProps> = ({ 
  media, onBack, setGalleryItems,
  frames, setFrames, availableStickers, setAvailableStickers
}) => {
  
  // -- State --
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('3:4');
  const [viewportDims, setViewportDims] = useState({ w: window.innerWidth, h: window.innerWidth * 1.33 });
  
  // Media State
  const [mediaDims, setMediaDims] = useState({ width: 0, height: 0 });
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1, rotation: 0 });
  
  // Content State
  const [stickers, setStickers] = useState<Sticker[]>([]);
  const [selectedStickerId, setSelectedStickerId] = useState<string | null>(null);
  const [selectedFrame, setSelectedFrame] = useState<FrameData | null>(null);
  const [filters, setFilters] = useState<FilterSettings>(DEFAULT_FILTERS);
  const [activePresetName, setActivePresetName] = useState('原图');
  
  // UI State
  const [showStickerPicker, setShowStickerPicker] = useState(false);
  const [showFramePicker, setShowFramePicker] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  
  // Refs
  const containerRef = useRef<HTMLDivElement>(null);
  const sourceVideoRef = useRef<HTMLVideoElement>(null);
  const sourceImageRef = useRef<HTMLImageElement>(null);
  const webglCanvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<WebGLRenderer | null>(null);
  const stickerCanvasRef = useRef<HTMLCanvasElement>(null);
  const frameImageRef = useRef<HTMLImageElement | null>(null);
  const animFrameRef = useRef<number>(0);
  
  // Tracking initialization
  const hasFittedRef = useRef(false);

  // -- Unified Gesture System --
  const gestureRef = useRef({
      isDragging: false,
      mode: 'NONE' as 'NONE' | 'BG' | 'STICKER',
      targetStickerId: null as string | null,
      startP1: { x: 0, y: 0 }, // Screen Coords
      startDist: 0,
      startAngle: 0,
      initialTransform: { x: 0, y: 0, scale: 1, rotation: 0 }, // For BG
      initialSticker: null as Sticker | null // For Sticker
  });

  // 1. Initialize WebGL
  useEffect(() => {
    if (webglCanvasRef.current && !rendererRef.current) {
        try { rendererRef.current = new WebGLRenderer(webglCanvasRef.current); }
        catch(e) { console.error(e); }
    }
  }, []);

  // 2. Load Media
  useEffect(() => {
    hasFittedRef.current = false;
    if (media.type === 'image') {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = media.url;
        img.onload = () => {
            sourceImageRef.current = img;
            setMediaDims({ width: img.width, height: img.height });
            setAspectRatio(`${img.width}:${img.height}`);
        };
    }
  }, [media]);

  // 3. Initial Fit Calculation
  useEffect(() => {
      if (!hasFittedRef.current && mediaDims.width > 0 && viewportDims.w > 0) {
          const scaleX = viewportDims.w / mediaDims.width;
          const scaleY = viewportDims.h / mediaDims.height;
          const scale = Math.min(scaleX, scaleY);
          setTransform({ x: 0, y: 0, scale: scale, rotation: 0 });
          hasFittedRef.current = true;
      }
  }, [mediaDims, viewportDims]);

  // 4. Viewport Calculation
  useEffect(() => {
    const handleResize = () => {
      const w = window.innerWidth;
      const topBarHeight = 80;
      const bottomBarHeight = 120;
      const maxH = window.innerHeight - topBarHeight - bottomBarHeight;
      
      let targetRatio = 3/4;

      if (aspectRatio === '1:1') targetRatio = 1;
      else if (aspectRatio === '3:4') targetRatio = 3/4;
      else if (aspectRatio === '4:3') targetRatio = 4/3;
      else if (aspectRatio === '9:16') targetRatio = 9/16;
      else if (aspectRatio === '16:9') targetRatio = 16/9;
      else if (typeof aspectRatio === 'string' && aspectRatio.includes(':')) {
           const parts = aspectRatio.split(':');
           if(parts.length === 2) {
               const numW = Number(parts[0]);
               const numH = Number(parts[1]);
               if (!isNaN(numW) && !isNaN(numH) && numW !== 0) {
                   targetRatio = numW / numH; // Corrected: Aspect ratio logic here is W/H usually for layout, but let's check
                   // In Decorator, viewport H = W / targetRatio.
                   // If aspect is 16:9 (W:H), ratio = 16/9. H = W / (16/9) = W * 9/16. Correct.
                   // So if input is "21:9", ratio = 21/9.
                   targetRatio = numW / numH;
               }
           }
      }

      let finalW = w;
      let finalH = w / targetRatio;
      if (finalH > maxH) {
          finalH = maxH;
          finalW = finalH * targetRatio;
      }
      setViewportDims({ w: finalW, h: finalH });
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [aspectRatio]);

  // 5. Render Loop
  const render = useCallback(() => {
      const renderer = rendererRef.current;
      const canvas = webglCanvasRef.current;
      if (renderer && canvas) {
          let source: HTMLImageElement | HTMLVideoElement | null = null;
          if (media.type === 'image') source = sourceImageRef.current;
          else if (sourceVideoRef.current && sourceVideoRef.current.readyState >= 2) source = sourceVideoRef.current;

          if (source) {
              const renderW = (source instanceof HTMLVideoElement) ? source.videoWidth : source.width;
              const renderH = (source instanceof HTMLVideoElement) ? source.videoHeight : source.height;
              if (canvas.width !== renderW || canvas.height !== renderH) {
                  canvas.width = renderW;
                  canvas.height = renderH;
              }
              renderer.render(source, filters, false);
          }
      }
      animFrameRef.current = requestAnimationFrame(render);
  }, [media, filters]);

  useEffect(() => {
      render();
      return () => cancelAnimationFrame(animFrameRef.current);
  }, [render]);

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

  // -- Helpers --
  const handleVideoMetadata = (e: React.SyntheticEvent<HTMLVideoElement>) => {
      const v = e.currentTarget;
      setMediaDims({ width: v.videoWidth, height: v.videoHeight });
      setAspectRatio(`${v.videoWidth}:${v.videoHeight}`);
  };

  const getStickerAtPoint = (x: number, y: number) => {
    // Reverse iterate to find top-most sticker
    for (let i = stickers.length - 1; i >= 0; i--) {
      const s = stickers[i];
      // Simple circle hit test approximation
      // Base sticker size is 100x(100*AR). Effective radius approx 50 * scale.
      const dx = x - s.x;
      const dy = y - s.y;
      const dist = Math.sqrt(dx*dx + dy*dy);
      // Give a generous touch target (60px * scale)
      if (dist < 60 * s.scale) return s.id;
    }
    return null;
  };

  // -- UNIFIED GESTURE HANDLERS --
  
  const handlePointerDown = (e: React.TouchEvent | React.MouseEvent) => {
      e.preventDefault(); 
      if (!containerRef.current) return;
      
      const rect = containerRef.current.getBoundingClientRect();
      const touches = 'touches' in e ? e.touches : [{ clientX: (e as React.MouseEvent).clientX, clientY: (e as React.MouseEvent).clientY }];
      
      const t1 = touches[0];
      const p1: Point = { x: t1.clientX - rect.left, y: t1.clientY - rect.top };

      // Initialize Gesture State
      gestureRef.current.isDragging = true;
      gestureRef.current.startP1 = p1;
      
      // Check Multi-touch
      if (touches.length > 1) {
          const t2 = touches[1];
          const p2: Point = { x: t2.clientX - rect.left, y: t2.clientY - rect.top };
          gestureRef.current.startDist = getDistance(p1, p2);
          gestureRef.current.startAngle = getAngle(p1, p2);
      }

      // HIT TEST: Sticker vs Background
      // Only hit test sticker on single touch start or if already selected
      let hitStickerId = getStickerAtPoint(p1.x, p1.y);
      
      // If we are touching a sticker, we control the sticker.
      // If not, we control the background.
      if (hitStickerId) {
          gestureRef.current.mode = 'STICKER';
          gestureRef.current.targetStickerId = hitStickerId;
          gestureRef.current.initialSticker = stickers.find(s => s.id === hitStickerId) || null;
          setSelectedStickerId(hitStickerId);
      } else {
          // Deselect sticker if touching empty space
          setSelectedStickerId(null);
          gestureRef.current.mode = 'BG';
          gestureRef.current.initialTransform = { ...transform };
      }
  };

  const handlePointerMove = (e: React.TouchEvent | React.MouseEvent) => {
      if (!gestureRef.current.isDragging) return;
      e.preventDefault();
      
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const touches = 'touches' in e ? e.touches : [{ clientX: (e as React.MouseEvent).clientX, clientY: (e as React.MouseEvent).clientY }];
      
      const t1 = touches[0];
      const p1: Point = { x: t1.clientX - rect.left, y: t1.clientY - rect.top };

      // --- STICKER MANIPULATION ---
      if (gestureRef.current.mode === 'STICKER' && gestureRef.current.initialSticker) {
           const initial = gestureRef.current.initialSticker;
           
           if (touches.length === 1) {
               // Drag
               const dx = p1.x - gestureRef.current.startP1.x;
               const dy = p1.y - gestureRef.current.startP1.y;
               
               setStickers(prev => prev.map(s => 
                   s.id === gestureRef.current.targetStickerId 
                   ? { ...s, x: initial.x + dx, y: initial.y + dy } 
                   : s
               ));
           } else if (touches.length > 1) {
               // Pinch / Rotate
               const t2 = touches[1];
               const p2: Point = { x: t2.clientX - rect.left, y: t2.clientY - rect.top };
               
               const dist = getDistance(p1, p2);
               const angle = getAngle(p1, p2);
               
               const scaleFactor = dist / gestureRef.current.startDist;
               const angleDiff = angle - gestureRef.current.startAngle;
               
               setStickers(prev => prev.map(s => 
                   s.id === gestureRef.current.targetStickerId 
                   ? { 
                       ...s, 
                       scale: Math.max(0.2, Math.min(5, initial.scale * scaleFactor)),
                       rotation: initial.rotation + angleDiff
                     } 
                   : s
               ));
           }
      } 
      // --- BACKGROUND MANIPULATION ---
      else if (gestureRef.current.mode === 'BG') {
           const initial = gestureRef.current.initialTransform;

           if (touches.length === 1) {
               // Drag BG
               const dx = t1.clientX - rect.left - gestureRef.current.startP1.x;
               const dy = t1.clientY - rect.top - gestureRef.current.startP1.y;
               
               setTransform({
                   ...transform,
                   x: initial.x + dx,
                   y: initial.y + dy
               });
           } else if (touches.length > 1) {
               // Pinch / Zoom BG
               const t2 = touches[1];
               const p2: Point = { x: t2.clientX - rect.left, y: t2.clientY - rect.top };

               const dist = getDistance(p1, p2);
               const angle = getAngle(p1, p2);
               
               const scaleFactor = dist / gestureRef.current.startDist;
               const angleDiff = angle - gestureRef.current.startAngle;

               setTransform({
                   ...initial,
                   scale: Math.max(0.01, initial.scale * scaleFactor),
                   rotation: initial.rotation + angleDiff
               });
           }
      }
  };

  const handlePointerEnd = () => {
      gestureRef.current.isDragging = false;
      gestureRef.current.mode = 'NONE';
      gestureRef.current.targetStickerId = null;
  };

  // -- Logic: Toggle Ratio --
  const toggleAspectRatio = () => {
      // Order: 3:4 -> 9:16 -> 1:1 -> 4:3 -> 16:9 -> Custom -> 3:4
      const ratios: AspectRatio[] = ['3:4', '9:16', '1:1', '4:3', '16:9'];
      const current = aspectRatio as string;
      const idx = ratios.indexOf(current as any);
      
      if (idx !== -1 && idx < ratios.length - 1) {
          // Move to next standard ratio
          setAspectRatio(ratios[idx + 1]);
      } else if (current === '16:9') {
          // 16:9 -> Custom
          const input = prompt("输入自定义宽高比 (宽:高, 例如 2.35:1)", "2.35:1");
          if (input && input.includes(':')) {
              const parts = input.split(':');
              if (!isNaN(Number(parts[0])) && !isNaN(Number(parts[1]))) {
                  setAspectRatio(input);
              } else {
                  alert("格式错误，请使用 宽:高 格式");
                  setAspectRatio('3:4'); // Fallback to start
              }
          } else {
              // Cancelled or empty -> go to start
              setAspectRatio('3:4');
          }
      } else {
          // Custom (or unknown) -> 3:4
          setAspectRatio('3:4');
      }
  };

  // -- Export --
  const handleExport = async () => {
      setIsExporting(true);
      
      const exportCanvas = document.createElement('canvas');
      const scaleFactor = 2; 
      exportCanvas.width = viewportDims.w * scaleFactor;
      exportCanvas.height = viewportDims.h * scaleFactor;
      const ctx = exportCanvas.getContext('2d');
      if (!ctx) return;

      const drawFrame = () => {
          ctx.clearRect(0, 0, exportCanvas.width, exportCanvas.height);
          
          // 1. Draw Media (Transform Applied)
          if (webglCanvasRef.current) {
              ctx.save();
              const cx = exportCanvas.width / 2;
              const cy = exportCanvas.height / 2;
              
              // Apply transform relative to center
              ctx.translate(cx + transform.x * scaleFactor, cy + transform.y * scaleFactor);
              ctx.rotate(transform.rotation * Math.PI / 180);
              
              // Scale calculation:
              // Visually on screen: width = mediaDims.width * transform.scale
              // Export: width should be same proportional to canvas
              ctx.scale(transform.scale * scaleFactor, transform.scale * scaleFactor);
              
              const srcW = webglCanvasRef.current.width;
              const srcH = webglCanvasRef.current.height;
              ctx.drawImage(webglCanvasRef.current, -srcW/2, -srcH/2);
              ctx.restore();
          }

          // 2. Draw Frame
          if (frameImageRef.current) {
              ctx.drawImage(frameImageRef.current, 0, 0, exportCanvas.width, exportCanvas.height);
          }

          // 3. Draw Stickers
          if (stickerCanvasRef.current) {
              ctx.drawImage(stickerCanvasRef.current, 0, 0, exportCanvas.width, exportCanvas.height);
          }
      };

      if (media.type === 'image') {
          drawFrame();
          exportCanvas.toBlob(blob => {
              if (blob) {
                  const url = URL.createObjectURL(blob);
                  setGalleryItems(p => [...p, {
                      id: getTimestampStr(), type: 'image', url, blob,
                      timestamp: new Date().toLocaleTimeString(), filename: `edit_${getTimestampStr()}.jpg`
                  }]);
                  setIsExporting(false);
                  onBack();
              }
          }, 'image/jpeg', 0.95);
      } else {
          const stream = exportCanvas.captureStream(30);
          if (sourceVideoRef.current) {
             try {
                 // @ts-ignore
                 const vidStream = sourceVideoRef.current.captureStream ? sourceVideoRef.current.captureStream() : sourceVideoRef.current.mozCaptureStream();
                 const audioTracks = vidStream.getAudioTracks();
                 if (audioTracks.length > 0) stream.addTrack(audioTracks[0]);
             } catch(e) { console.log("Audio capture failed", e); }
          }
          
          const mimeType = MediaRecorder.isTypeSupported('video/mp4')
            ? 'video/mp4'
            : (MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
                ? 'video/webm;codecs=vp9'
                : 'video/webm');
          const fileExt = mimeType.includes('mp4') ? 'mp4' : 'webm';
          const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 4000000 }); 
          const chunks: Blob[] = [];
          recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
          recorder.onstop = () => {
              const blob = new Blob(chunks, { type: mimeType });
              const url = URL.createObjectURL(blob);
              setGalleryItems(p => [...p, {
                  id: getTimestampStr(), type: 'video', url, blob,
                  timestamp: new Date().toLocaleTimeString(), filename: `edit_${getTimestampStr()}.${fileExt}`
              }]);
              setIsExporting(false);
              onBack();
          };

          if (sourceVideoRef.current) {
              sourceVideoRef.current.currentTime = 0;
              sourceVideoRef.current.play();
              recorder.start();
              
              const duration = sourceVideoRef.current.duration;
              const startTime = Date.now();
              const tick = () => {
                  if (Date.now() - startTime > duration * 1000) {
                      recorder.stop();
                      return;
                  }
                  drawFrame();
                  requestAnimationFrame(tick);
              };
              tick();
          }
      }
  };


  return (
    <div className="fixed inset-0 bg-sky-50 flex flex-col z-50 animate-fade-in overflow-hidden select-none">
       {/* Hidden Sources */}
       <video 
          ref={sourceVideoRef} 
          src={media.type === 'video' ? media.url : undefined} 
          className="hidden" 
          muted 
          crossOrigin="anonymous" 
          playsInline 
          loop 
          onLoadedMetadata={handleVideoMetadata}
       />
       <canvas ref={webglCanvasRef} className="hidden" />

       {/* Header */}
       <div className="absolute top-0 left-0 w-full z-40 p-4 pt-safe flex justify-between items-center pointer-events-none">
          <button onClick={onBack} className={`${BTN_SECONDARY} pointer-events-auto`}><IconHome className="w-5 h-5"/></button>
          
          <div className="flex gap-3 pointer-events-auto">
             <button onClick={toggleAspectRatio} className={`${BTN_SECONDARY} w-14 text-[9px] font-black`}>{aspectRatio}</button>
             <button onClick={() => setShowFramePicker(true)} className={`${BTN_SECONDARY} ${selectedFrame ? 'bg-sky-500 text-white border-sky-400' : ''}`}><IconFrame className="w-5 h-5"/></button>
             <button onClick={() => setShowStickerPicker(true)} className={BTN_SECONDARY}><IconSticker className="w-5 h-5"/></button>
             <button onClick={() => setShowFilters(true)} className={BTN_SECONDARY}><IconSliders className="w-5 h-5"/></button>
          </div>
       </div>

       {/* Main Stage */}
       <div className="flex-1 flex items-center justify-center bg-slate-100 overflow-hidden relative">
           {/* Viewport Container */}
           <div 
              ref={containerRef}
              style={{ width: viewportDims.w, height: viewportDims.h }} 
              className="relative bg-white shadow-2xl overflow-hidden ring-1 ring-black/5"
           >
              {/* --- UNIFIED GESTURE LAYER (TOP) --- */}
              <div 
                 className="absolute inset-0 z-50 touch-none"
                 onMouseDown={handlePointerDown}
                 onMouseMove={handlePointerMove}
                 onMouseUp={handlePointerEnd}
                 onMouseLeave={handlePointerEnd}
                 onTouchStart={handlePointerDown}
                 onTouchMove={handlePointerMove}
                 onTouchEnd={handlePointerEnd}
              />

              {/* 1. Media Layer (Transformed) */}
              <div 
                className="absolute top-1/2 left-1/2 origin-center will-change-transform"
                style={{ 
                    transform: `translate(-50%, -50%) translate(${transform.x}px, ${transform.y}px) rotate(${transform.rotation}deg) scale(${transform.scale})`,
                    width: mediaDims.width || '100%',
                    height: mediaDims.height || '100%',
                    zIndex: 0
                }}
              >
                  <CanvasClone source={webglCanvasRef.current} />
              </div>

              {/* 2. Frame Layer */}
              {selectedFrame && selectedFrame.url && (
                  <img src={selectedFrame.url} className="absolute inset-0 w-full h-full object-fill z-20 pointer-events-none" />
              )}

              {/* 3. Sticker Layer (Pointer Events None to let touches pass to Gesture Layer) */}
              <div className="absolute inset-0 z-30 pointer-events-none">
                  <div className="w-full h-full relative">
                      <StickerCanvas 
                          stickers={stickers} setStickers={setStickers} 
                          width={viewportDims.w} height={viewportDims.h} 
                          canvasRef={stickerCanvasRef} 
                          selectedStickerId={selectedStickerId} setSelectedStickerId={setSelectedStickerId} 
                      />
                  </div>
              </div>
           </div>
       </div>

       {/* Bottom Bar */}
       <div className="absolute bottom-0 w-full p-safe pb-8 bg-gradient-to-t from-black/50 to-transparent flex justify-center z-40 pointer-events-none">
           {selectedStickerId && (
              <button onClick={() => { setStickers(p => p.filter(s => s.id !== selectedStickerId)); setSelectedStickerId(null); }} className="bg-red-500 text-white px-6 py-3 rounded-full shadow-lg pointer-events-auto mb-4 flex gap-2 font-bold text-sm">
                  <IconTrash className="w-4 h-4"/> 删除贴纸
              </button>
           )}
           
           {!selectedStickerId && (
               <button 
                  onClick={handleExport}
                  disabled={isExporting}
                  className={`pointer-events-auto px-8 py-4 rounded-full font-bold text-lg shadow-xl flex items-center gap-3 transition-transform active:scale-95 ${isExporting ? 'bg-slate-500 text-slate-300' : 'bg-sky-500 text-white'}`}
               >
                   {isExporting ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"/> : <IconDownload className="w-6 h-6" />}
                   {isExporting ? '生成中...' : '保存作品'}
               </button>
           )}
       </div>

       {/* Modals (Filter UI) */}
       {showFilters && (
          <div className="absolute bottom-28 left-6 right-6 md:left-1/2 md:-translate-x-1/2 md:w-80 z-50 bg-white/70 backdrop-blur-lg rounded-3xl shadow-2xl border border-white/40 animate-slide-up flex flex-col p-4 max-h-[50vh]">
            <div className="flex justify-between items-center mb-4 px-2">
              <span className="text-xs font-black text-slate-500 tracking-widest uppercase">滤镜</span>
              <button onClick={() => setShowFilters(false)} className="p-1 bg-slate-100 rounded-full hover:bg-slate-200 text-slate-500"><IconClose className="w-4 h-4"/></button>
            </div>
            <div className="overflow-x-auto flex gap-3 pb-4 hide-scrollbar px-1">
              {PRESETS.map((p) => (
                <button key={p.name} onClick={() => { setFilters(p.settings); setActivePresetName(p.name); }} className="flex flex-col gap-2 items-center flex-shrink-0 group">
                   <div className={`w-14 h-14 rounded-xl bg-slate-200 overflow-hidden relative transition-all duration-300 ${activePresetName === p.name ? 'ring-2 ring-sky-500 scale-105 shadow-md' : 'ring-1 ring-slate-100'}`}>
                        <div className="w-full h-full bg-slate-300" style={{ filter: getCSSFilterString(p.settings) }} />
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

      {/* Frame Picker */}
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
                        img.onload = async () => {
                            const ratio = img.width / img.height;
                            let ar: AspectRatio = '3:4';
                            if (Math.abs(ratio - 1) < 0.1) ar = '1:1';
                            else if (Math.abs(ratio - 9/16) < 0.1) ar = '9:16';
                            else if (Math.abs(ratio - 4/3) < 0.1) ar = '4:3';
                            else if (Math.abs(ratio - 16/9) < 0.1) ar = '16:9';
                            else ar = `${img.width}:${img.height}`;

                            const newFrame = { id: 'c_'+Date.now(), name: '自定义', url, aspectRatio: ar, blob: file };
                            setFrames(p => [...p, newFrame]); 
                            await dbAdd(STORE_FRAMES, newFrame);
                            setSelectedFrame(newFrame); setAspectRatio(ar); setShowFramePicker(false);
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

      {/* Sticker Picker */}
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
                        const id = Date.now().toString();
                        const ns: Sticker = { id, url, x: viewportDims.w/2, y: viewportDims.h/2, scale: 1, rotation: 0, aspectRatio: 1 };
                        
                        const img = new Image(); 
                        img.onload = async () => { 
                            ns.aspectRatio = img.width/img.height; 
                            setStickers(p=>[...p, ns]); 
                            setSelectedStickerId(ns.id); 
                            
                            const stickerAsset = { id, url, blob: file };
                            setAvailableStickers(p => [...p, stickerAsset]);
                            await dbAdd(STORE_STICKERS, stickerAsset);
                            
                            setShowStickerPicker(false); 
                        }; 
                        img.src = url;
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

// Helper component to display WebGL canvas clone
const CanvasClone: React.FC<{ source: HTMLCanvasElement | null }> = ({ source }) => {
    const ref = useRef<HTMLCanvasElement>(null);
    useEffect(() => {
        let id = 0;
        const tick = () => {
            if (ref.current && source) {
                if (ref.current.width !== source.width) ref.current.width = source.width;
                if (ref.current.height !== source.height) ref.current.height = source.height;
                const ctx = ref.current.getContext('2d');
                ctx?.drawImage(source, 0, 0);
            }
            id = requestAnimationFrame(tick);
        }
        tick();
        return () => cancelAnimationFrame(id);
    }, [source]);
    return <canvas ref={ref} className="w-full h-full object-contain" />;
}

export default Decorator;
