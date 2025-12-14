
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { CameraMode, Sticker, AspectRatio, FilterSettings, GalleryItem, FrameData, CameraResolution, Point } from '../types';
import { 
  IconCameraRotate, IconGrid, IconSticker, 
  IconClose, IconTrash, IconSliders, IconFrame, IconHome
} from './Icons';
import StickerCanvas from './StickerCanvas';
import { getTimestampStr, formatTime, getDistance, getAngle } from '../utils';
import { WebGLRenderer } from '../renderer';
import { dbAdd, STORE_GALLERY, STORE_STICKERS, STORE_FRAMES } from '../utils';

// Constants
const BOUNCE_TRANSITION = "transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)]";
const SMOOTH_TRANSITION = "transition-all duration-500 ease-in-out";

// UI Styles
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
  availableStickers: {id: string, url: string, blob?: Blob}[];
  setAvailableStickers: React.Dispatch<React.SetStateAction<{id: string, url: string, blob?: Blob}[]>>;
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
  const [cameraError, setCameraError] = useState<string | null>(null);
  
  // Live Photo Settings
  const [liveDuration, setLiveDuration] = useState<1.5 | 3.0>(1.5);
  const [liveCountdown, setLiveCountdown] = useState<number | null>(null);

  // Modals
  const [showStickerPicker, setShowStickerPicker] = useState(false);
  const [showFramePicker, setShowFramePicker] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  
  // Settings
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('3:4');
  const [filters, setFilters] = useState<FilterSettings>(DEFAULT_FILTERS);
  const [activePresetName, setActivePresetName] = useState('原图');
  
  // Frame State
  const [selectedFrame, setSelectedFrame] = useState<FrameData | null>(null);
  const [frameMode, setFrameMode] = useState<'stretch' | 'fit'>('stretch'); 
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  
  // Dimensions
  const [viewportDims, setViewportDims] = useState({ w: window.innerWidth, h: window.innerWidth * 1.33 });

  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null); // WebGL Canvas
  const compositorCanvasRef = useRef<HTMLCanvasElement>(null); // Final Composition Canvas (Hidden)
  const stickerCanvasRef = useRef<HTMLCanvasElement>(null); // Overlay Stickers
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<any>(null);
  const frameImageRef = useRef<HTMLImageElement | null>(null);
  const webglRendererRef = useRef<WebGLRenderer | null>(null);
  const animFrameRef = useRef<number>(0);

  // Mutable refs for capture loop
  const filtersRef = useRef(filters);
  const facingModeRef = useRef(facingMode);
  const viewportDimsRef = useRef(viewportDims);
  const frameModeRef = useRef(frameMode);
  const selectedFrameRef = useRef(selectedFrame);

  // Update refs
  useEffect(() => { filtersRef.current = filters; }, [filters]);
  useEffect(() => { facingModeRef.current = facingMode; }, [facingMode]);
  useEffect(() => { viewportDimsRef.current = viewportDims; }, [viewportDims]);
  useEffect(() => { frameModeRef.current = frameMode; }, [frameMode]);
  useEffect(() => { selectedFrameRef.current = selectedFrame; }, [selectedFrame]);

  // Gesture Ref
  const gestureRef = useRef({
      isDragging: false,
      targetStickerId: null as string | null,
      startP1: { x: 0, y: 0 },
      startDist: 0,
      startAngle: 0,
      initialSticker: null as Sticker | null
  });

  useEffect(() => {
    if (selectedFrame && selectedFrame.url) {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = selectedFrame.url;
      img.onload = () => { frameImageRef.current = img; };
    } else {
      frameImageRef.current = null;
    }
  }, [selectedFrame]);

  // Viewport Calculation
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
      else if (typeof aspectRatio === 'string' && aspectRatio.includes(':')) {
           const parts = aspectRatio.split(':');
           if(parts.length === 2) {
               const numW = Number(parts[0]);
               const numH = Number(parts[1]);
               if (!isNaN(numW) && !isNaN(numH) && numW !== 0) {
                   ratioVal = numH / numW;
               }
           }
      }
      
      targetH = w * ratioVal;
      setViewportDims({ w, h: targetH });
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [aspectRatio]);

  useEffect(() => {
    const startCamera = async () => {
      if (stream) {
          stream.getTracks().forEach(t => t.stop());
      }
      setCameraError(null);
      
      let widthConstraint: number;
      let heightConstraint: number;
      
      switch (resolution) {
          case '720P': widthConstraint = 1280; heightConstraint = 720; break;
          case '2K': widthConstraint = 2560; heightConstraint = 1440; break;
          case '4K': widthConstraint = 3840; heightConstraint = 2160; break;
          case '1080P':
          default: widthConstraint = 1920; heightConstraint = 1080; break;
      }

      // Helper to try get stream
      const tryGetStream = async (constraints: MediaStreamConstraints) => {
          try {
              return await navigator.mediaDevices.getUserMedia(constraints);
          } catch(e) {
              return null;
          }
      };

      // 1. Try Desired Config (With Audio)
      let newStream = await tryGetStream({
          video: { facingMode, width: { ideal: widthConstraint }, height: { ideal: heightConstraint } },
          audio: true
      });

      // 2. Try Video Only (If audio failed)
      if (!newStream) {
          console.warn("Audio access failed, trying video only");
          newStream = await tryGetStream({
              video: { facingMode, width: { ideal: widthConstraint }, height: { ideal: heightConstraint } },
              audio: false
          });
      }

      // 3. Try Loose Resolution (If constrained resolution failed)
      if (!newStream) {
           console.warn("High res failed, trying loose resolution");
           newStream = await tryGetStream({
               video: { facingMode },
               audio: false
           });
      }

      // 4. Try Any Camera (If facing mode failed - e.g. environment on laptop)
      if (!newStream) {
          console.warn("Specific facing mode failed, trying any camera");
          newStream = await tryGetStream({
              video: true,
              audio: false
          });
      }

      if (newStream) {
          setStream(newStream);
          if (videoRef.current) {
              videoRef.current.srcObject = newStream;
              videoRef.current.onloadedmetadata = () => videoRef.current?.play();
          }
      } else {
          console.error("All camera attempts failed");
          setCameraError("无法访问相机，请检查设备权限或硬件连接");
      }
    };

    startCamera();
    
    // Cleanup
    return () => {
      // Don't stop tracks here on every render, strictly dependent on mount/unmount is better, 
      // but React strict mode double-invokes. 
      // We rely on startCamera stopping previous stream.
    }
  }, [facingMode, resolution]);

  useEffect(() => {
    if (canvasRef.current && !webglRendererRef.current) {
      try { webglRendererRef.current = new WebGLRenderer(canvasRef.current); } 
      catch (e) { console.error("WebGL Init Failed", e); }
    }
  }, [viewportDims]);

  // Main Render Loop: Updates WebGL Canvas AND Compositor Canvas
  const renderLoop = useCallback(() => {
    const video = videoRef.current;
    const renderer = webglRendererRef.current;
    const glCanvas = canvasRef.current;
    const stickerCanvas = stickerCanvasRef.current;
    const compositor = compositorCanvasRef.current;

    if (video && renderer && glCanvas && compositor && stickerCanvas && video.readyState >= 2) {
      // 1. Render Video to WebGL (Filter Layer)
      if (glCanvas.width !== video.videoWidth || glCanvas.height !== video.videoHeight) {
        glCanvas.width = video.videoWidth;
        glCanvas.height = video.videoHeight;
      }
      renderer.render(video, filtersRef.current, facingModeRef.current === 'user');

      // 2. Calculate Crop for Compositor (To match Aspect Ratio)
      const srcW = glCanvas.width;
      const srcH = glCanvas.height;
      const viewDims = viewportDimsRef.current;
      const desiredAspect = viewDims.w / viewDims.h;
      const srcAspect = srcW / srcH;

      let cropW = srcW;
      let cropH = srcH;
      let cropX = 0;
      let cropY = 0;

      if (srcAspect > desiredAspect) {
        cropW = srcH * desiredAspect;
        cropX = (srcW - cropW) / 2;
      } else {
        cropH = srcW / desiredAspect;
        cropY = (srcH - cropH) / 2;
      }

      // 3. Setup Compositor Canvas (Matches Crop Resolution)
      if (compositor.width !== cropW || compositor.height !== cropH) {
          compositor.width = cropW;
          compositor.height = cropH;
      }

      const ctx = compositor.getContext('2d');
      if (ctx) {
          // Clear
          ctx.clearRect(0, 0, cropW, cropH);

          // A. Draw Filtered Video (Cropped)
          ctx.drawImage(glCanvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

          // B. Draw Frame (If exists)
          const fImg = frameImageRef.current;
          const sFrame = selectedFrameRef.current;
          if (fImg && sFrame && sFrame.id !== 'none') {
              if (frameModeRef.current === 'stretch') {
                  ctx.drawImage(fImg, 0, 0, cropW, cropH);
              } else {
                  const fAspect = fImg.width / fImg.height;
                  const tAspect = cropW / cropH;
                  let dw = cropW, dh = cropH, dx = 0, dy = 0;
                  if (fAspect > tAspect) { dh = cropW / fAspect; dy = (cropH - dh) / 2; } 
                  else { dw = cropH * fAspect; dx = (cropW - dw) / 2; }
                  ctx.drawImage(fImg, dx, dy, dw, dh);
              }
          }

          // C. Draw Stickers (Overlay)
          // Sticker canvas is screen size (viewDims), we need to draw it to match the compositor size
          ctx.drawImage(stickerCanvas, 0, 0, stickerCanvas.width, stickerCanvas.height, 0, 0, cropW, cropH);
      }
    }
    animFrameRef.current = requestAnimationFrame(renderLoop);
  }, []);

  useEffect(() => {
    renderLoop();
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [renderLoop]);

  const saveToGallery = async (blob: Blob, type: 'image' | 'video', filename: string) => {
    const url = URL.createObjectURL(blob);
    const newItem: GalleryItem = {
      id: Date.now().toString() + Math.random().toString().slice(2, 5),
      type, url, blob, timestamp: new Date().toLocaleTimeString(), filename
    };
    setGalleryItems(prev => [...prev, newItem]);
    await dbAdd(STORE_GALLERY, newItem); 
  };

  const takePhoto = () => {
    const compositor = compositorCanvasRef.current;
    if (!compositor) return;

    compositor.toBlob((blob) => {
        if (blob) saveToGallery(blob, 'image', `photo_${getTimestampStr()}.jpg`);
    }, 'image/jpeg', 0.95);
  };

  const handleCapture = () => {
    if (mode === 'PHOTO') {
        takePhoto();
    }
    else if (mode === 'LIVE') {
        if (!compositorCanvasRef.current) return;
        try {
            // Record from Compositor, not Raw Canvas
            const stream = compositorCanvasRef.current.captureStream(30);
            const mimeType = MediaRecorder.isTypeSupported('video/mp4') ? 'video/mp4' : 'video/webm'; 
            const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 4000000 });
            const chunks: Blob[] = [];
            
            recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
            recorder.onstop = () => {
                const blob = new Blob(chunks, { type: mimeType });
                saveToGallery(blob, 'video', `live_video_${getTimestampStr()}.${mimeType === 'video/mp4' ? 'mp4' : 'webm'}`);
                setLiveCountdown(null);
            };
            
            recorder.start();
            setIsRecording(true);
            
            const startTime = Date.now();
            const durationMs = liveDuration * 1000;
            setLiveCountdown(durationMs); 
            
            const tick = () => {
                const elapsed = Date.now() - startTime;
                const remaining = Math.max(0, durationMs - elapsed);
                if (remaining > 0) {
                    setLiveCountdown(remaining);
                    requestAnimationFrame(tick);
                } else {
                    setLiveCountdown(0);
                    takePhoto(); 
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
            if (!compositorCanvasRef.current) return;
            try {
                // Record from Compositor
                const stream = compositorCanvasRef.current.captureStream(30);
                if (videoRef.current && videoRef.current.srcObject) {
                    // Try to add audio track from source if available
                    const srcStream = videoRef.current.srcObject as MediaStream;
                    if (srcStream.getAudioTracks().length > 0) {
                        stream.addTrack(srcStream.getAudioTracks()[0]);
                    }
                }
                const mimeType = MediaRecorder.isTypeSupported('video/mp4') ? 'video/mp4' : 'video/webm';
                mediaRecorderRef.current = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 4000000 });
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
      setTimeout(() => setIsFlipping(false), 400); 
      setTimeout(() => {
          setFacingMode(p => p === 'user' ? 'environment' : 'user');
      }, 200); 
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

  const toggleResolution = () => {
      const next: Record<CameraResolution, CameraResolution> = {
          '720P': '1080P', '1080P': '2K', '2K': '4K', '4K': '720P'
      };
      setResolution(next[resolution]);
  };

  // --- GESTURE HANDLING ---
  const getStickerAtPoint = (x: number, y: number) => {
    for (let i = stickers.length - 1; i >= 0; i--) {
      const s = stickers[i];
      const dx = x - s.x;
      const dy = y - s.y;
      const dist = Math.sqrt(dx*dx + dy*dy);
      if (dist < 60 * s.scale) return s.id;
    }
    return null;
  };

  const handlePointerDown = (e: React.TouchEvent | React.MouseEvent) => {
      e.preventDefault();
      const container = e.currentTarget as HTMLDivElement;
      const rect = container.getBoundingClientRect();
      const touches = 'touches' in e ? e.touches : [{ clientX: (e as React.MouseEvent).clientX, clientY: (e as React.MouseEvent).clientY }];
      
      const t1 = touches[0];
      const p1: Point = { x: t1.clientX - rect.left, y: t1.clientY - rect.top };

      gestureRef.current.isDragging = true;
      gestureRef.current.startP1 = p1;

      if (touches.length > 1) {
          const t2 = touches[1];
          const p2: Point = { x: t2.clientX - rect.left, y: t2.clientY - rect.top };
          gestureRef.current.startDist = getDistance(p1, p2);
          gestureRef.current.startAngle = getAngle(p1, p2);
      }

      const hitId = getStickerAtPoint(p1.x, p1.y);
      if (hitId) {
          gestureRef.current.targetStickerId = hitId;
          gestureRef.current.initialSticker = stickers.find(s => s.id === hitId) || null;
          setSelectedStickerId(hitId);
      } else {
          setSelectedStickerId(null);
          gestureRef.current.targetStickerId = null;
      }
  };

  const handlePointerMove = (e: React.TouchEvent | React.MouseEvent) => {
      if (!gestureRef.current.isDragging || !gestureRef.current.targetStickerId || !gestureRef.current.initialSticker) return;
      e.preventDefault();
      
      const container = e.currentTarget as HTMLDivElement;
      const rect = container.getBoundingClientRect();
      const touches = 'touches' in e ? e.touches : [{ clientX: (e as React.MouseEvent).clientX, clientY: (e as React.MouseEvent).clientY }];
      
      const t1 = touches[0];
      const p1: Point = { x: t1.clientX - rect.left, y: t1.clientY - rect.top };
      const initial = gestureRef.current.initialSticker!;

      if (touches.length === 1) {
           const dx = p1.x - gestureRef.current.startP1.x;
           const dy = p1.y - gestureRef.current.startP1.y;
           setStickers(prev => prev.map(s => s.id === initial.id ? { ...s, x: initial.x + dx, y: initial.y + dy } : s));
      } else if (touches.length > 1) {
           const t2 = touches[1];
           const p2: Point = { x: t2.clientX - rect.left, y: t2.clientY - rect.top };
           
           const dist = getDistance(p1, p2);
           const angle = getAngle(p1, p2);
           const scaleFactor = dist / gestureRef.current.startDist;
           const angleDiff = angle - gestureRef.current.startAngle;
           
           setStickers(prev => prev.map(s => s.id === initial.id ? {
               ...s,
               scale: Math.max(0.2, Math.min(5, initial.scale * scaleFactor)),
               rotation: initial.rotation + angleDiff
           } : s));
      }
  };

  const handlePointerEnd = () => {
      gestureRef.current.isDragging = false;
      gestureRef.current.targetStickerId = null;
  };

  return (
    <div className="fixed inset-0 bg-sky-50 flex flex-col z-50 animate-fade-in font-sans overflow-hidden">
       {/* Error Overlay */}
       {cameraError && (
          <div className="absolute inset-0 z-[60] bg-black flex flex-col items-center justify-center text-white p-6 text-center animate-fade-in">
              <div className="w-24 h-24 bg-gray-800 rounded-full flex items-center justify-center mb-6">
                  <IconCameraRotate className="w-10 h-10 text-gray-500" />
              </div>
              <h3 className="text-xl font-bold mb-3">相机访问失败</h3>
              <p className="text-gray-400 mb-8 max-w-xs text-sm leading-relaxed">
                  {cameraError}
              </p>
              <div className="flex gap-4">
                  <button onClick={onBack} className="px-6 py-2.5 bg-gray-800 rounded-full font-bold text-sm text-gray-300">返回</button>
                  <button onClick={() => window.location.reload()} className="px-8 py-2.5 bg-sky-500 rounded-full font-bold text-sm text-white shadow-lg active:scale-95">刷新重试</button>
              </div>
          </div>
       )}

       {/* 1. Top Bar */}
      <div className="absolute top-0 left-0 w-full z-40 px-4 py-3 pt-safe flex justify-between items-center pointer-events-none bg-gradient-to-b from-white/20 to-transparent">
         <button onClick={onBack} className="w-10 h-10 rounded-full bg-white/40 backdrop-blur-md flex items-center justify-center text-slate-700 pointer-events-auto active:scale-90 transition-transform shadow-sm hover:bg-white/60">
             <IconHome className="w-5 h-5"/>
         </button>
         <div className={TOP_PILL}>
            <button onClick={toggleResolution} className={PILL_BTN}>{resolution}</button>
            <div className="w-px h-3 bg-slate-300/50"></div>
            <button onClick={toggleAspectRatio} className={`${PILL_BTN} relative`}>
               {aspectRatio}
               {selectedFrame && selectedFrame.id !== 'none' && <span className="absolute top-1.5 right-1 w-1.5 h-1.5 bg-sky-400 rounded-full"></span>}
            </button>
         </div>
         <button onClick={() => setGridOn(!gridOn)} className={`w-10 h-10 rounded-full flex items-center justify-center pointer-events-auto transition-colors shadow-sm ${gridOn ? 'bg-sky-500 text-white' : 'bg-white/40 text-slate-700 backdrop-blur-md hover:bg-white/60'}`}>
             <IconGrid on={gridOn} className="w-5 h-5" />
         </button>
      </div>

      {/* 2. Main Viewport */}
      <div className="flex-1 relative flex items-center justify-center overflow-hidden bg-sky-50">
        <div 
            style={{ width: viewportDims.w, height: viewportDims.h }} 
            className={`relative shadow-2xl bg-black overflow-hidden ring-1 ring-black/5 ${isFlipping ? 'camera-flipping' : 'camera-stable'} ${SMOOTH_TRANSITION}`}
        >
          <div 
             className="absolute inset-0 z-40 touch-none"
             onMouseDown={handlePointerDown}
             onMouseMove={handlePointerMove}
             onMouseUp={handlePointerEnd}
             onMouseLeave={handlePointerEnd}
             onTouchStart={handlePointerDown}
             onTouchMove={handlePointerMove}
             onTouchEnd={handlePointerEnd}
          />

          {activePresetName !== '原图' && (
             <div className="absolute top-24 left-4 z-20 px-3 py-1 bg-black/30 backdrop-blur-xl rounded-full border border-white/20 shadow-sm pointer-events-none">
               <span className="text-[10px] text-white font-bold tracking-widest uppercase shadow-black drop-shadow-md">{activePresetName}</span>
             </div>
          )}
          
          {liveCountdown !== null && (
              <div className="absolute top-24 left-1/2 -translate-x-1/2 z-30 bg-yellow-400 text-black px-4 py-1.5 rounded-full font-mono shadow-xl text-lg font-black border border-white/30 animate-pulse tracking-wider">
                  {formatStopwatch(liveCountdown)}
              </div>
          )}

          <video ref={videoRef} autoPlay playsInline muted className="hidden" />
          <canvas ref={canvasRef} className="absolute top-0 left-0 w-full h-full object-cover" />
          {/* Compositor Canvas: Hidden, used for recording composited video */}
          <canvas ref={compositorCanvasRef} className="hidden" />
          
          {selectedFrame && selectedFrame.url && (
              <div className="absolute inset-0 z-20 pointer-events-none flex items-center justify-center">
                  <img 
                    src={selectedFrame.url} 
                    alt="frame" 
                    className={`w-full h-full ${frameMode === 'stretch' ? 'object-fill' : 'object-contain'}`} 
                  />
              </div>
          )}
          
          <div className="absolute inset-0 z-30 pointer-events-none">
              <StickerCanvas stickers={stickers} setStickers={setStickers} width={viewportDims.w} height={viewportDims.h} canvasRef={stickerCanvasRef} selectedStickerId={selectedStickerId} setSelectedStickerId={setSelectedStickerId} />
          </div>

          {gridOn && <div className="absolute inset-0 z-30 pointer-events-none grid grid-cols-3 grid-rows-3 opacity-90"><div className="border-r border-white/60 shadow-[0_0_2px_rgba(0,0,0,0.3)]"></div><div className="border-r border-white/60 shadow-[0_0_2px_rgba(0,0,0,0.3)]"></div><div></div><div className="border-r border-white/60 border-t border-b shadow-[0_0_2px_rgba(0,0,0,0.3)]"></div><div className="border-r border-white/60 border-t border-b shadow-[0_0_2px_rgba(0,0,0,0.3)]"></div><div className="border-t border-b border-white/60 shadow-[0_0_2px_rgba(0,0,0,0.3)]"></div><div className="border-r border-white/60 shadow-[0_0_2px_rgba(0,0,0,0.3)]"></div><div className="border-r border-white/60 shadow-[0_0_2px_rgba(0,0,0,0.3)]"></div><div></div></div>}
          
          <div className="absolute top-24 right-4 z-50 flex flex-col items-center pointer-events-auto">
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

        {selectedStickerId && <div className="absolute bottom-32 left-0 w-full flex justify-center z-50 pointer-events-none"><button onClick={() => { setStickers(p => p.filter(s => s.id !== selectedStickerId)); setSelectedStickerId(null); }} className="bg-red-500 text-white px-6 py-3 rounded-full pointer-events-auto shadow-xl flex items-center gap-2 text-xs font-bold"><IconTrash className="w-4 h-4" /> 删除</button></div>}
        {isRecording && mode === 'VIDEO' && <div className="absolute top-24 left-1/2 -translate-x-1/2 z-30 bg-red-500 text-white px-4 py-1.5 rounded-full font-mono animate-pulse shadow-xl text-sm font-bold">{formatTime(recordingTime)}</div>}
      
        {/* Filter Modal */}
        {showFilters && (
          <div className="absolute bottom-4 left-4 right-4 md:left-1/2 md:-translate-x-1/2 md:w-80 z-50 bg-white/70 backdrop-blur-xl rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.1)] border border-white/60 animate-slide-up flex flex-col p-4 max-h-[50vh]">
            <div className="flex justify-between items-center mb-4 px-2">
              <span className="text-xs font-black text-slate-500 tracking-widest uppercase">滤镜</span>
              <button onClick={() => setShowFilters(false)} className="p-1 bg-slate-100 rounded-full hover:bg-slate-200 text-slate-500"><IconClose className="w-4 h-4"/></button>
            </div>
            <div className="overflow-x-auto flex gap-3 pb-4 hide-scrollbar px-1">
              {PRESETS.map((p) => (
                <button key={p.name} onClick={() => { setFilters(p.settings); setActivePresetName(p.name); }} className="flex flex-col gap-2 items-center flex-shrink-0 group">
                  <div className={`w-12 h-12 rounded-xl overflow-hidden relative transition-all duration-300 ${activePresetName === p.name ? 'ring-2 ring-sky-500 scale-105 shadow-md' : 'ring-1 ring-slate-200'}`}>
                     {thumbnailUrl ? <img src={thumbnailUrl} className="w-full h-full object-cover rounded-xl" style={{ filter: getCSSFilterString(p.settings) }} alt={p.name} /> : <div className="w-full h-full bg-slate-200 rounded-xl" />}
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

      {/* 3. Bottom Controls */}
      <div className="z-40 bg-white/20 backdrop-blur-xl border-t border-white/40 pb-safe pt-2">
        {/* Live Duration Toggles */}
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
        
        {/* Main Controls */}
        <div className="flex items-center justify-between px-8 pb-5 md:px-32">
           <div className="flex w-16 justify-start">
              <button onClick={onOpenGallery} className="w-12 h-12 rounded-xl bg-white/40 backdrop-blur-md overflow-hidden shadow-sm border border-white/50 hover:border-sky-200 transition-colors group">
                 {galleryItems.length > 0 ? (
                    galleryItems[galleryItems.length - 1].type === 'image' ? 
                    <img src={galleryItems[galleryItems.length - 1].url} className="w-full h-full object-cover group-hover:scale-110 transition-transform" /> : 
                    <div className="w-full h-full bg-slate-100 flex items-center justify-center text-lg">🎥</div>
                 ) : <div className="w-full h-full bg-slate-100" />}
              </button>
           </div>
           
           <div className="flex items-center justify-center -mt-2">
              <button 
                  onClick={handleCapture} 
                  className={`relative w-[76px] h-[76px] rounded-full border-[4px] border-white shadow-lg flex items-center justify-center active:scale-95 transition-transform duration-150 bg-white/20 backdrop-blur-sm`}
              >
                <div className={`relative flex items-center justify-center transition-all duration-500 ease-out overflow-hidden
                    ${mode === 'VIDEO' 
                        ? (isRecording ? 'w-6 h-6 rounded-[6px] bg-red-500' : 'w-16 h-16 rounded-full bg-red-500') 
                        : (mode === 'LIVE' ? 'w-16 h-16 rounded-full bg-yellow-400' : 'w-16 h-16 rounded-full bg-sky-500')
                    }
                    ${mode === 'VIDEO' && isRecording ? 'animate-breathe' : ''}
                `}>
                    {mode === 'LIVE' && (
                        <>
                           <div 
                                className={`absolute bg-white rounded-full pointer-events-none transition-all ease-linear`}
                                style={{
                                    width: isRecording ? '85%' : '0%',
                                    height: isRecording ? '85%' : '0%',
                                    transitionDuration: isRecording ? `${liveDuration}s` : '0.3s'
                                }}
                           />
                           <div className={`absolute inset-0 flex items-center justify-center transition-opacity duration-300 ${isRecording ? 'opacity-0' : 'opacity-100'}`}>
                                <div className="w-10 h-10 border-2 border-white/50 rounded-full border-dashed"></div>
                           </div>
                        </>
                    )}
                </div>
              </button>
           </div>
           
           <div className="flex w-16 justify-end">
              <button 
                  onClick={flipCamera} 
                  className={`w-12 h-12 rounded-full bg-white/40 backdrop-blur-md flex items-center justify-center text-slate-700 hover:bg-white hover:text-sky-600 active:scale-90 transition-all border border-white/50 shadow-sm ${isFlipping ? 'animate-flip-x text-sky-500' : ''}`}
              >
                  <IconCameraRotate className={`w-6 h-6 transition-transform duration-500 ${facingMode === 'user' ? '-scale-x-100' : ''}`} />
              </button>
           </div>
        </div>
      </div>

      {/* 4. Full Screen Modals */}
      
      {/* Frame Picker */}
      {showFramePicker && (
        <div className="absolute inset-0 z-50 bg-black/20 backdrop-blur-sm flex items-end">
          <div className="bg-white/95 backdrop-blur-2xl w-full rounded-t-[2.5rem] p-6 pb-safe animate-slide-up shadow-2xl border-t border-white/50">
            <div className="flex justify-between items-center mb-6 px-2">
              <div className="flex flex-col">
                  <h3 className="font-bold text-lg text-slate-800 tracking-tight">选择画框</h3>
                  <div className="flex gap-2 mt-1">
                      <button 
                        onClick={() => setFrameMode('stretch')} 
                        className={`text-[10px] px-2 py-0.5 rounded-full border ${frameMode==='stretch'?'bg-sky-100 text-sky-600 border-sky-200':'border-slate-200 text-slate-400'}`}
                      >
                          拉伸填充
                      </button>
                      <button 
                        onClick={() => setFrameMode('fit')} 
                        className={`text-[10px] px-2 py-0.5 rounded-full border ${frameMode==='fit'?'bg-sky-100 text-sky-600 border-sky-200':'border-slate-200 text-slate-400'}`}
                      >
                          保持原比例
                      </button>
                  </div>
              </div>
              <button onClick={() => setShowFramePicker(false)} className="p-2 bg-slate-100 rounded-full hover:bg-slate-200 text-slate-500"><IconClose className="w-5 h-5"/></button>
            </div>
            <div className="flex gap-4 overflow-x-auto pb-6 hide-scrollbar px-2 mt-2">
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

export default Camera;
