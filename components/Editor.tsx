import React, { useState, useRef, useEffect, useCallback } from 'react';
import { IconMagic, IconCheck, IconUndo, IconTrash, IconMarquee, IconScissors, IconLayers, IconImage } from './Icons';
import { getDistance, getAngle, getMidpoint, getTimestampStr } from '../utils';
import { FrameData, GalleryItem, AspectRatio } from '../types';

interface EditorProps {
  onBack: () => void;
  setGalleryItems: React.Dispatch<React.SetStateAction<GalleryItem[]>>;
  setFrames: React.Dispatch<React.SetStateAction<FrameData[]>>;
  setAvailableStickers: React.Dispatch<React.SetStateAction<{id: string, url: string}[]>>;
}

// HSL Helper
const rgbToHsl = (r: number, g: number, b: number) => {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0, l = (max + min) / 2;
    if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
    }
    return { h: h * 360, s, l };
};

const rgbToHex = (r: number, g: number, b: number) => 
    "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);

const BACKGROUNDS = [
    { id: 'grid', style: { backgroundImage: "url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAMUlEQVQ4T2NkYGAQYcAP3uCTZhw1gGGYhAGBZIA/nYDCgBDAm9BGDWAAjyQc6wcgAgA9xwwByzr4kgAAAABJRU5ErkJggg==')" } },
    { id: 'white', style: { backgroundColor: '#ffffff' } },
    { id: 'black', style: { backgroundColor: '#000000' } },
    { id: 'green', style: { backgroundColor: '#4ade80' } },
];

interface HistoryState {
    draw: ImageData | null;
    erase: ImageData | null;
    mask: ImageData | null;
}

const Editor: React.FC<EditorProps> = ({ 
    onBack, 
    setGalleryItems, 
    setFrames, 
    setAvailableStickers 
}) => {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  
  // Interaction Mode
  const [tool, setTool] = useState<'view' | 'picker' | 'brush' | 'marquee'>('picker');
  
  // Brush Settings
  const [brushType, setBrushType] = useState<'pen' | 'eraser' | 'chroma'>('pen');
  const [brushSize, setBrushSize] = useState(30);
  const [brushColor, setBrushColor] = useState('#ff0000');
  
  // Chroma Settings
  const [chromaScope, setChromaScope] = useState<'global' | 'manual' | 'box'>('global');
  const [targetColor, setTargetColor] = useState<{r:number, g:number, b:number} | null>(null);
  const [tolerance, setTolerance] = useState(15); 
  const [feather, setFeather] = useState(5);
  const [repair, setRepair] = useState(0); 
  const [erode, setErode] = useState(0); // New: Clear Edge / Erode

  // Marquee Selection State
  const [selectionRect, setSelectionRect] = useState<{x:number, y:number, w:number, h:number} | null>(null);
  
  // Output State
  const [isProcessing, setIsProcessing] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [showSaveMenu, setShowSaveMenu] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Viewport State
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1, rotation: 0 });
  const [bgIndex, setBgIndex] = useState(0);
  
  // Refs for rendering pipeline
  const canvasRef = useRef<HTMLCanvasElement>(null); // Viewport
  
  // Offscreen Layers
  const srcCanvasRef = useRef<HTMLCanvasElement | null>(null); // Original Image
  const keyMapCanvasRef = useRef<HTMLCanvasElement | null>(null); // Alpha map of chroma match (White=Match)
  const chromaMaskCanvasRef = useRef<HTMLCanvasElement | null>(null); // User painted mask for chroma scope
  const drawCanvasRef = useRef<HTMLCanvasElement | null>(null); // Pen strokes
  const eraseCanvasRef = useRef<HTMLCanvasElement | null>(null); // Eraser strokes

  // History Stack
  const historyRef = useRef<HistoryState[]>([]);
  const [canUndo, setCanUndo] = useState(false);

  // Interaction Refs
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef<{x: number, y: number} | null>(null);
  const pinchStartRef = useRef<{dist: number, angle: number, center: {x:number, y:number}} | null>(null);
  const transformStartRef = useRef({ x: 0, y: 0, scale: 1, rotation: 0 });
  const lastPointRef = useRef<{x: number, y: number} | null>(null);

  // --- Toast Helper ---
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

  // --- History Management ---
  const saveHistory = () => {
     if (!srcCanvasRef.current) return;
     const w = srcCanvasRef.current.width;
     const h = srcCanvasRef.current.height;

     const getState = (canvas: HTMLCanvasElement | null) => {
         return canvas ? canvas.getContext('2d')?.getImageData(0,0,w,h) || null : null;
     };

     const newState: HistoryState = {
         draw: getState(drawCanvasRef.current),
         erase: getState(eraseCanvasRef.current),
         mask: getState(chromaMaskCanvasRef.current)
     };

     if (historyRef.current.length >= 10) historyRef.current.shift();
     historyRef.current.push(newState);
     setCanUndo(true);
  };

  const handleUndo = () => {
      if (historyRef.current.length === 0) return;
      const previousState = historyRef.current.pop();
      if (previousState) {
          const restore = (canvas: HTMLCanvasElement | null, data: ImageData | null) => {
              if (canvas && data) canvas.getContext('2d')?.putImageData(data, 0, 0);
              else if (canvas) canvas.getContext('2d')?.clearRect(0,0,canvas.width, canvas.height);
          };
          restore(drawCanvasRef.current, previousState.draw);
          restore(eraseCanvasRef.current, previousState.erase);
          restore(chromaMaskCanvasRef.current, previousState.mask);
          requestAnimationFrame(render);
          if (historyRef.current.length === 0) setCanUndo(false);
          showToast("已撤销");
      }
  };

  // --- Initialization ---

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const img = new Image();
      img.onload = () => {
        const w = img.width;
        const h = img.height;

        const createLayer = () => {
            const c = document.createElement('canvas');
            c.width = w; c.height = h;
            return c;
        };

        srcCanvasRef.current = createLayer();
        srcCanvasRef.current.getContext('2d')?.drawImage(img, 0, 0);

        keyMapCanvasRef.current = createLayer();
        chromaMaskCanvasRef.current = createLayer(); 
        drawCanvasRef.current = createLayer();
        eraseCanvasRef.current = createLayer();

        setImage(img);
        setResultUrl(null);
        setTargetColor(null);
        setChromaScope('global');
        setTool('picker'); 
        setSelectionRect(null);

        if (canvasRef.current) {
             const cw = window.innerWidth;
             const ch = window.innerHeight;
             const scale = Math.min(cw / w, ch / h) * 0.85;
             setTransform({ x: cw/2, y: ch/2, scale, rotation: 0 });
        }
        
        saveHistory();
        requestAnimationFrame(render);
      };
      img.src = URL.createObjectURL(file);
    }
  };

  // --- Chroma Key Calculation (Debounced) ---

  const updateKeyMap = useCallback(() => {
      if (!srcCanvasRef.current || !keyMapCanvasRef.current) return;
      
      const w = srcCanvasRef.current.width;
      const h = srcCanvasRef.current.height;
      const ctx = keyMapCanvasRef.current.getContext('2d');
      const srcCtx = srcCanvasRef.current.getContext('2d');
      if (!ctx || !srcCtx) return;

      if (!targetColor) {
          ctx.clearRect(0, 0, w, h); 
          requestAnimationFrame(render);
          return;
      }

      const imgData = srcCtx.getImageData(0, 0, w, h);
      const data = imgData.data;
      const mapData = ctx.createImageData(w, h);
      const mData = mapData.data;
      
      const targetHSL = rgbToHsl(targetColor.r, targetColor.g, targetColor.b);
      const t = (tolerance / 100) * 0.45; 
      const f = feather / 100;
      
      let boxBounds = { minX: 0, maxX: w, minY: 0, maxY: h };
      if (chromaScope === 'box' && selectionRect) {
          boxBounds = {
              minX: Math.max(0, selectionRect.x),
              maxX: Math.min(w, selectionRect.x + selectionRect.w),
              minY: Math.max(0, selectionRect.y),
              maxY: Math.min(h, selectionRect.y + selectionRect.h)
          };
      }

      // First Pass: Generate Raw Mask
      for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
              const i = (y * w + x) * 4;
              
              if (chromaScope === 'box') {
                  if (x < boxBounds.minX || x > boxBounds.maxX || y < boxBounds.minY || y > boxBounds.maxY) {
                      mData[i+3] = 0;
                      continue;
                  }
              }

              const r = data[i], g = data[i+1], b = data[i+2];
              const hsl = rgbToHsl(r, g, b);
              
              let hDiff = Math.abs(hsl.h - targetHSL.h);
              if (hDiff > 180) hDiff = 360 - hDiff;
              hDiff /= 180;
              const sDiff = Math.abs(hsl.s - targetHSL.s);
              const lDiff = Math.abs(hsl.l - targetHSL.l);
              
              const dist = Math.sqrt(hDiff*hDiff*0.6 + sDiff*sDiff*0.3 + lDiff*lDiff*0.1);

              let alpha = 0;
              if (dist <= t) {
                  alpha = 255;
              } else if (dist <= t + f && f > 0) {
                  alpha = 255 - Math.floor(((dist - t) / f) * 255);
              }
              
              mData[i] = 255; 
              mData[i+1] = 255; 
              mData[i+2] = 255; 
              mData[i+3] = alpha; 
          }
      }

      // Second Pass: Repair / Hole Filling
      if (repair > 0) {
          const solidNeighborThreshold = Math.max(1, 8 - Math.floor((repair / 100) * 7.5));
          const originalAlpha = new Uint8Array(w * h);
          for(let k=0; k<w*h; k++) originalAlpha[k] = mData[k*4+3];

          for (let y = 1; y < h - 1; y++) {
              for (let x = 1; x < w - 1; x++) {
                  const idx = y * w + x;
                  if (originalAlpha[idx] > 128) { // If currently erased
                      let solidNeighbors = 0;
                      if (originalAlpha[idx - w - 1] < 128) solidNeighbors++;
                      if (originalAlpha[idx - w] < 128) solidNeighbors++;
                      if (originalAlpha[idx - w + 1] < 128) solidNeighbors++;
                      if (originalAlpha[idx - 1] < 128) solidNeighbors++;
                      if (originalAlpha[idx + 1] < 128) solidNeighbors++;
                      if (originalAlpha[idx + w - 1] < 128) solidNeighbors++;
                      if (originalAlpha[idx + w] < 128) solidNeighbors++;
                      if (originalAlpha[idx + w + 1] < 128) solidNeighbors++;

                      if (solidNeighbors >= solidNeighborThreshold) {
                          mData[idx * 4 + 3] = 0; // Restore
                      }
                  }
              }
          }
      }

      // Third Pass: Erode / Edge Clear
      if (erode > 0) {
          // Map slider 0-100 to 0-3 iterations for performance
          const iterations = Math.ceil(erode / 33);
          
          let currentAlpha = new Uint8Array(w * h);
          for(let k=0; k<w*h; k++) currentAlpha[k] = mData[k*4+3];

          for (let iter = 0; iter < iterations; iter++) {
              const nextAlpha = new Uint8Array(currentAlpha);
              let changed = false;
              for (let y = 1; y < h - 1; y++) {
                  for (let x = 1; x < w - 1; x++) {
                      const idx = y * w + x;
                      // Logic: If I am visible (low alpha), but I have ANY removed neighbor (high alpha),
                      // then I should be removed too (become high alpha).
                      // Note: In keyMap, alpha=255 means REMOVED (white drawn on destination-out).
                      // So: If I am NOT removed (alpha < 128), but neighbor IS removed (alpha > 128) -> Remove me.
                      
                      if (currentAlpha[idx] < 128) { // Currently Visible
                          // Check neighbors for "Removed" status
                          if (currentAlpha[idx - 1] > 128 || 
                              currentAlpha[idx + 1] > 128 || 
                              currentAlpha[idx - w] > 128 || 
                              currentAlpha[idx + w] > 128) {
                              nextAlpha[idx] = 255; // Remove this pixel
                              changed = true;
                          }
                      }
                  }
              }
              currentAlpha = nextAlpha;
              if (!changed) break;
          }
          // Write back
          for(let k=0; k<w*h; k++) mData[k*4+3] = currentAlpha[k];
      }
      
      ctx.putImageData(mapData, 0, 0);
      requestAnimationFrame(render);
  }, [targetColor, tolerance, feather, repair, erode, chromaScope, selectionRect]);

  useEffect(() => {
      const timer = setTimeout(updateKeyMap, 50);
      return () => clearTimeout(timer);
  }, [updateKeyMap]);

  // --- Rendering (Composite) ---

  const render = useCallback(() => {
      const canvas = canvasRef.current;
      if (!canvas || !srcCanvasRef.current) return;
      
      if (canvas.width !== window.innerWidth || canvas.height !== window.innerHeight) {
          canvas.width = window.innerWidth;
          canvas.height = window.innerHeight;
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // 1. Clear Screen
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      ctx.save();
      // Apply View Transform
      ctx.translate(transform.x, transform.y);
      ctx.rotate(transform.rotation * Math.PI / 180);
      ctx.scale(transform.scale, transform.scale);
      
      const w = srcCanvasRef.current.width;
      const h = srcCanvasRef.current.height;
      const hw = w/2;
      const hh = h/2;

      // COMPOSITING STACK
      
      // A. Draw Base Image
      ctx.drawImage(srcCanvasRef.current, -hw, -hh);
      
      // B. Apply Eraser (Destination-Out)
      if (eraseCanvasRef.current) {
          ctx.globalCompositeOperation = 'destination-out';
          ctx.drawImage(eraseCanvasRef.current, -hw, -hh);
      }
      
      // C. Apply Chroma Key (Destination-Out)
      if (targetColor && keyMapCanvasRef.current) {
          ctx.globalCompositeOperation = 'destination-out';
          
          if (chromaScope === 'global' || chromaScope === 'box') {
              ctx.drawImage(keyMapCanvasRef.current, -hw, -hh);
          } else if (chromaScope === 'manual' && chromaMaskCanvasRef.current) {
             const temp = document.createElement('canvas'); 
             temp.width = w; temp.height = h;
             const tCtx = temp.getContext('2d');
             if (tCtx && chromaMaskCanvasRef.current) {
                 tCtx.drawImage(chromaMaskCanvasRef.current, 0, 0);
                 tCtx.globalCompositeOperation = 'source-in';
                 tCtx.drawImage(keyMapCanvasRef.current, 0, 0);
                 
                 ctx.drawImage(temp, -hw, -hh);
             }
          }
      }
      
      // D. Draw Pen (Source-Over)
      ctx.globalCompositeOperation = 'source-over';
      if (drawCanvasRef.current) {
          ctx.drawImage(drawCanvasRef.current, -hw, -hh);
      }
      
      // E. Draw Visual Helpers
      if (tool === 'brush') {
           if (brushType === 'chroma' && chromaMaskCanvasRef.current) {
               ctx.globalAlpha = 0.3;
               ctx.drawImage(chromaMaskCanvasRef.current, -hw, -hh); 
               ctx.globalAlpha = 1.0;
           }
      }

      // F. Draw Marquee
      if (selectionRect) {
          ctx.translate(-hw, -hh);
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 2 / transform.scale;
          ctx.setLineDash([6 / transform.scale, 4 / transform.scale]);
          ctx.strokeRect(selectionRect.x, selectionRect.y, selectionRect.w, selectionRect.h);
          
          ctx.strokeStyle = '#0ea5e9'; // Sky-500
          ctx.setLineDash([]);
          ctx.strokeRect(selectionRect.x, selectionRect.y, selectionRect.w, selectionRect.h);
          
          ctx.translate(hw, hh);
      }

      ctx.restore();
  }, [transform, chromaScope, targetColor, tool, brushType, selectionRect]);

  useEffect(() => {
      requestAnimationFrame(render);
  }, [render]);


  // --- Coordinate Mapping ---
  
  const screenToImage = (sx: number, sy: number) => {
      if (!canvasRef.current || !srcCanvasRef.current) return { x: 0, y: 0 };
      const w = srcCanvasRef.current.width;
      const h = srcCanvasRef.current.height;
      
      // Inverse Transform
      let x = sx - transform.x;
      let y = sy - transform.y;
      
      const rad = -transform.rotation * Math.PI / 180;
      const rx = x * Math.cos(rad) - y * Math.sin(rad);
      const ry = x * Math.sin(rad) + y * Math.cos(rad);
      
      x = rx / transform.scale;
      y = ry / transform.scale;
      
      return { x: x + w/2, y: y + h/2 };
  };

  // --- Interaction ---

  const handlePointerDown = (e: React.TouchEvent | React.MouseEvent) => {
      e.preventDefault(); 
      if (!canvasRef.current) return;
      
      const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
      const rect = canvasRef.current.getBoundingClientRect();

      // Multi-touch -> Pan/Zoom
      if ('touches' in e && e.touches.length === 2) {
          const t1 = e.touches[0];
          const t2 = e.touches[1];
          const p1 = { x: t1.clientX - rect.left, y: t1.clientY - rect.top };
          const p2 = { x: t2.clientX - rect.left, y: t2.clientY - rect.top };
          
          isDraggingRef.current = true;
          pinchStartRef.current = {
              dist: getDistance(p1, p2),
              angle: getAngle(p1, p2),
              center: getMidpoint(p1, p2)
          };
          transformStartRef.current = { ...transform };
          return;
      }

      // Single Touch
      const sx = clientX - rect.left;
      const sy = clientY - rect.top;
      const imgP = screenToImage(sx, sy);
      
      isDraggingRef.current = true;
      if (tool === 'brush' || tool === 'marquee') {
         saveHistory();
      }

      if (tool === 'view') {
          dragStartRef.current = { x: clientX, y: clientY };
          transformStartRef.current = { ...transform };
      } else if (tool === 'picker') {
          if (srcCanvasRef.current) {
              const ctx = srcCanvasRef.current.getContext('2d');
              // Ensure coordinates are integers within bounds
              const ix = Math.floor(imgP.x);
              const iy = Math.floor(imgP.y);
              if (ix >= 0 && ix < srcCanvasRef.current.width && iy >= 0 && iy < srcCanvasRef.current.height) {
                  const p = ctx?.getImageData(ix, iy, 1, 1).data;
                  if (p) setTargetColor({ r: p[0], g: p[1], b: p[2] });
              }
          }
      } else if (tool === 'brush') {
          lastPointRef.current = imgP;
          paint(imgP, imgP);
      } else if (tool === 'marquee') {
          // Start selection
          setSelectionRect({ x: imgP.x, y: imgP.y, w: 0, h: 0 });
          dragStartRef.current = { x: imgP.x, y: imgP.y }; // Store in image coords for marquee
      }
      
      requestAnimationFrame(render);
  };

  const handlePointerMove = (e: React.TouchEvent | React.MouseEvent) => {
      e.preventDefault();
      if (!canvasRef.current) return;
      
      const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
      const rect = canvasRef.current.getBoundingClientRect();

      // Pinch Logic
      if ('touches' in e && e.touches.length === 2 && pinchStartRef.current) {
          const t1 = e.touches[0];
          const t2 = e.touches[1];
          const p1 = { x: t1.clientX - rect.left, y: t1.clientY - rect.top };
          const p2 = { x: t2.clientX - rect.left, y: t2.clientY - rect.top };
          
          const dist = getDistance(p1, p2);
          const angle = getAngle(p1, p2);
          const center = getMidpoint(p1, p2); // Screen Coords
          
          const start = pinchStartRef.current;
          const startTrans = transformStartRef.current;
          
          const scale = Math.max(0.1, startTrans.scale * (dist / start.dist));
          const rotation = startTrans.rotation + (angle - start.angle);
          
          const dx = center.x - start.center.x;
          const dy = center.y - start.center.y;
          
          setTransform({
              x: startTrans.x + dx,
              y: startTrans.y + dy,
              scale,
              rotation
          });
          requestAnimationFrame(render);
          return;
      }

      if (!isDraggingRef.current) return;

      if (tool === 'view' && dragStartRef.current) {
           const dx = clientX - dragStartRef.current.x;
           const dy = clientY - dragStartRef.current.y;
           setTransform(prev => ({
               ...prev,
               x: transformStartRef.current.x + dx,
               y: transformStartRef.current.y + dy
           }));
      } else if (tool === 'brush' && lastPointRef.current) {
           const sx = clientX - rect.left;
           const sy = clientY - rect.top;
           const imgP = screenToImage(sx, sy);
           paint(lastPointRef.current, imgP);
           lastPointRef.current = imgP;
      } else if (tool === 'marquee' && dragStartRef.current) {
           const sx = clientX - rect.left;
           const sy = clientY - rect.top;
           const imgP = screenToImage(sx, sy);
           const startX = dragStartRef.current.x;
           const startY = dragStartRef.current.y;
           
           const x = Math.min(startX, imgP.x);
           const y = Math.min(startY, imgP.y);
           const w = Math.abs(imgP.x - startX);
           const h = Math.abs(imgP.y - startY);
           
           setSelectionRect({ x, y, w, h });
      }
      requestAnimationFrame(render);
  };

  const handlePointerEnd = () => {
      isDraggingRef.current = false;
      dragStartRef.current = null;
      pinchStartRef.current = null;
      lastPointRef.current = null;
  };

  // --- Painting ---

  const paint = (p1: {x:number, y:number}, p2: {x:number, y:number}) => {
      let targetCtx: CanvasRenderingContext2D | null = null;
      let color = brushColor;
      let composite: GlobalCompositeOperation = 'source-over';

      if (brushType === 'pen') {
          targetCtx = drawCanvasRef.current?.getContext('2d') || null;
      } else if (brushType === 'eraser') {
          targetCtx = eraseCanvasRef.current?.getContext('2d') || null;
          color = '#ffffff'; 
      } else if (brushType === 'chroma') {
          targetCtx = chromaMaskCanvasRef.current?.getContext('2d') || null;
          color = '#ffffff'; 
          if (chromaScope === 'global') setChromaScope('manual');
      }

      if (!targetCtx) return;

      targetCtx.beginPath();
      targetCtx.moveTo(p1.x, p1.y);
      targetCtx.lineTo(p2.x, p2.y);
      targetCtx.lineCap = 'round';
      targetCtx.lineJoin = 'round';
      targetCtx.lineWidth = brushSize;
      targetCtx.strokeStyle = color;
      targetCtx.globalCompositeOperation = composite;
      targetCtx.stroke();
  };
  
  const clearLayer = (type: 'pen' | 'eraser' | 'chroma') => {
      saveHistory(); // Save before clearing
      let cvs: HTMLCanvasElement | null = null;
      if (type === 'pen') cvs = drawCanvasRef.current;
      if (type === 'eraser') cvs = eraseCanvasRef.current;
      if (type === 'chroma') cvs = chromaMaskCanvasRef.current;
      
      if (cvs) {
          const ctx = cvs.getContext('2d');
          ctx?.clearRect(0,0,cvs.width, cvs.height);
          requestAnimationFrame(render);
      }
  };

  // --- Marquee Operations ---

  const applyMarqueeCrop = (invert: boolean = false) => {
      if (!selectionRect || !eraseCanvasRef.current || !srcCanvasRef.current) return;
      
      saveHistory(); // Save before applying

      const ctx = eraseCanvasRef.current.getContext('2d');
      if (!ctx) return;
      
      const w = srcCanvasRef.current.width;
      const h = srcCanvasRef.current.height;
      
      ctx.fillStyle = '#000000';
      
      if (invert) {
         // Erase INSIDE (make it a hole)
         ctx.fillRect(selectionRect.x, selectionRect.y, selectionRect.w, selectionRect.h);
         showToast("选区已擦除");
      } else {
         // Erase OUTSIDE (Keep Selection)
         ctx.beginPath();
         ctx.rect(0, 0, w, h);
         ctx.rect(selectionRect.x, selectionRect.y, selectionRect.w, selectionRect.h);
         ctx.fill('evenodd');
         showToast("已裁剪选区");
      }
      
      setSelectionRect(null);
      setTool('view');
      requestAnimationFrame(render);
  };
  
  const applyMarqueeChroma = () => {
      if (!selectionRect) return;
      setChromaScope('box');
      showToast("已应用区域色度抠图");
  };

  // --- Export Logic ---
  const saveResult = () => {
      setIsProcessing(true);
      setTimeout(() => {
          if (!srcCanvasRef.current) return;
          const w = srcCanvasRef.current.width;
          const h = srcCanvasRef.current.height;
          
          const final = document.createElement('canvas');
          final.width = w; final.height = h;
          const ctx = final.getContext('2d');
          if (!ctx) return;
          
          // A. Draw Source
          ctx.drawImage(srcCanvasRef.current, 0, 0);
          
          // B. Apply Eraser
          if (eraseCanvasRef.current) {
              ctx.globalCompositeOperation = 'destination-out';
              ctx.drawImage(eraseCanvasRef.current, 0, 0);
          }
          
          // C. Apply Chroma Key
          if (targetColor && keyMapCanvasRef.current) {
              ctx.globalCompositeOperation = 'destination-out';
              if (chromaScope === 'global' || chromaScope === 'box') {
                  ctx.drawImage(keyMapCanvasRef.current, 0, 0);
              } else if (chromaScope === 'manual' && chromaMaskCanvasRef.current) {
                  const temp = document.createElement('canvas');
                  temp.width = w; temp.height = h;
                  const tCtx = temp.getContext('2d');
                  if(tCtx) {
                      tCtx.drawImage(chromaMaskCanvasRef.current, 0, 0);
                      tCtx.globalCompositeOperation = 'source-in';
                      tCtx.drawImage(keyMapCanvasRef.current, 0, 0);
                      ctx.drawImage(temp, 0, 0);
                  }
              }
          }
          
          // D. Draw Pen
          ctx.globalCompositeOperation = 'source-over';
          if (drawCanvasRef.current) {
              ctx.drawImage(drawCanvasRef.current, 0, 0);
          }
          
          setResultUrl(final.toDataURL('image/png'));
          setIsProcessing(false);
      }, 50);
  };

  const handleSaveAction = (type: 'gallery' | 'sticker' | 'frame') => {
    if (!resultUrl) return;

    // Convert dataURL to Blob
    const byteString = atob(resultUrl.split(',')[1]);
    const mimeString = resultUrl.split(',')[0].split(':')[1].split(';')[0];
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) {
      ia[i] = byteString.charCodeAt(i);
    }
    const blob = new Blob([ab], {type: mimeString});
    const ts = getTimestampStr();

    if (type === 'gallery') {
       const newItem: GalleryItem = {
          id: ts,
          type: 'image',
          url: resultUrl,
          blob: blob,
          timestamp: new Date().toLocaleTimeString(),
          filename: `edited_${ts}.png`
       };
       setGalleryItems(prev => [...prev, newItem]);
       showToast("已保存到图库");
    } else if (type === 'sticker') {
       const newSticker = { id: `s_${ts}`, url: resultUrl };
       setAvailableStickers(prev => [...prev, newSticker]);
       showToast("已保存为贴纸素材");
    } else if (type === 'frame') {
       // Estimate aspect ratio
       const img = new Image();
       img.onload = () => {
           const ratio = img.width / img.height;
           let ar: AspectRatio = '3:4';
           if (Math.abs(ratio - 1) < 0.1) ar = '1:1';
           else if (Math.abs(ratio - 9/16) < 0.1) ar = '9:16';
           
           const newFrame: FrameData = {
               id: `f_${ts}`,
               name: '自定义',
               url: resultUrl,
               aspectRatio: ar
           };
           setFrames(prev => [...prev, newFrame]);
           showToast("已保存为画框素材");
       };
       img.src = resultUrl;
    }
    setShowSaveMenu(false);
  };

  useEffect(() => {
      if (canvasRef.current) {
          canvasRef.current.width = window.innerWidth;
          canvasRef.current.height = window.innerHeight;
      }
  }, []);

  return (
    <div className="fixed inset-0 bg-sky-50 z-50 flex flex-col animate-fade-in overflow-hidden select-none touch-none">
      
      {/* Toast */}
      {toastMessage && (
          <div className="absolute top-20 left-1/2 -translate-x-1/2 bg-slate-800 text-white px-6 py-3 rounded-full shadow-xl z-[60] animate-bounce font-bold text-sm flex items-center gap-2">
              <IconCheck className="w-4 h-4 text-green-400" />
              {toastMessage}
          </div>
      )}

      {/* Header */}
      <div className="absolute top-0 left-0 w-full p-4 pt-safe flex justify-between items-center bg-white/80 backdrop-blur-md z-20 shadow-sm">
         <button onClick={onBack} className="p-2 bg-slate-100 rounded-full text-slate-600 active:scale-95"><IconUndo className="w-5 h-5"/></button>
         <h2 className="font-bold text-lg text-slate-800">透明化编辑器</h2>
         {resultUrl ? (
            <div className="flex gap-2 relative">
                 <button onClick={() => setResultUrl(null)} className="px-4 py-2 bg-slate-200 rounded-full text-slate-700 font-bold text-xs flex items-center gap-1 active:scale-95">
                    <IconUndo className="w-4 h-4"/> 继续编辑
                 </button>
                 
                 <div className="relative">
                     <button onClick={() => setShowSaveMenu(!showSaveMenu)} className="px-4 py-2 bg-sky-500 rounded-full text-white font-bold shadow-lg shadow-sky-300 flex items-center gap-2">
                        <IconCheck className="w-4 h-4"/> 保存
                     </button>
                     {showSaveMenu && (
                         <div className="absolute top-full right-0 mt-2 w-40 bg-white rounded-xl shadow-xl border border-slate-100 overflow-hidden flex flex-col animate-slide-up z-50">
                             <button onClick={() => handleSaveAction('gallery')} className="p-3 text-left text-xs font-bold text-slate-700 hover:bg-slate-50 border-b border-slate-50">保存到图库</button>
                             <button onClick={() => handleSaveAction('sticker')} className="p-3 text-left text-xs font-bold text-slate-700 hover:bg-slate-50 border-b border-slate-50">存为贴纸素材</button>
                             <button onClick={() => handleSaveAction('frame')} className="p-3 text-left text-xs font-bold text-slate-700 hover:bg-slate-50">存为画框素材</button>
                         </div>
                     )}
                 </div>
            </div>
         ) : (
            <div className="flex items-center gap-2">
                 <button onClick={handleUndo} disabled={!canUndo} className="p-2 bg-slate-100 rounded-full text-slate-500 active:scale-95 border border-slate-200 disabled:opacity-30">
                    <IconUndo className="w-5 h-5" />
                 </button>
                 {/* BG Toggle */}
                 <button onClick={() => setBgIndex((bgIndex + 1) % BACKGROUNDS.length)} className="p-2 bg-slate-100 rounded-full text-slate-500 active:scale-95 border border-slate-200">
                    <IconLayers className="w-5 h-5"/>
                 </button>
                 <button onClick={saveResult} disabled={!image} className="p-2 bg-sky-500 rounded-full text-white shadow-lg shadow-sky-300 active:scale-95 transition-transform disabled:opacity-50"><IconCheck className="w-5 h-5"/></button>
            </div>
         )}
      </div>

      {/* Main Canvas Area */}
      <div className="flex-1 w-full h-full relative" style={BACKGROUNDS[bgIndex].style}>
         {!image && (
            <div className="absolute inset-0 flex items-center justify-center z-30 pointer-events-none">
               <div className="text-center p-8 bg-white/90 backdrop-blur-xl rounded-3xl shadow-xl mx-4 border border-white/50 pointer-events-auto">
                    <div className="w-20 h-20 bg-sky-100 rounded-full flex items-center justify-center mx-auto mb-4 text-sky-500">
                        <IconMagic className="w-10 h-10" />
                    </div>
                    <h3 className="text-xl font-black text-slate-700 mb-2">上传图片</h3>
                    <p className="text-slate-500 mb-6 text-sm">智能色度抠图 & 自由涂抹</p>
                    <label className="block w-full py-3 px-6 bg-sky-500 text-white font-bold rounded-xl shadow-lg shadow-sky-300 active:scale-95 transition-transform cursor-pointer">
                        选择图片
                        <input type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
                    </label>
                </div>
            </div>
         )}
         
         {resultUrl ? (
             <div className="w-full h-full flex items-center justify-center p-4">
                 <img src={resultUrl} className="max-w-full max-h-full object-contain shadow-2xl" />
             </div>
         ) : (
             <canvas 
                ref={canvasRef} 
                className="block w-full h-full"
                onMouseDown={handlePointerDown}
                onMouseMove={handlePointerMove}
                onMouseUp={handlePointerEnd}
                onMouseLeave={handlePointerEnd}
                onTouchStart={handlePointerDown}
                onTouchMove={handlePointerMove}
                onTouchEnd={handlePointerEnd}
             />
         )}
         
         {isProcessing && (
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
                <div className="w-10 h-10 border-4 border-white/20 border-t-sky-500 rounded-full animate-spin"/>
            </div>
        )}
      </div>

      {/* Tools Panel */}
      {image && !resultUrl && (
        <div className="absolute bottom-0 left-0 w-full bg-white/95 backdrop-blur-xl rounded-t-3xl shadow-[0_-5px_20px_rgba(0,0,0,0.05)] border-t border-white/60 z-30 pb-safe pt-2 transition-transform duration-300">
           
           {/* Main Tabs */}
           <div className="flex justify-around items-center px-2 mb-2 border-b border-slate-100 pb-2">
               {[
                 { id: 'view', label: '浏览', icon: '✋' },
                 { id: 'marquee', label: '框选', icon: <IconMarquee className="w-6 h-6" /> },
                 { id: 'picker', label: '取色', icon: '🎨' },
                 { id: 'brush', label: '画笔', icon: '🖌️' }
               ].map(m => (
                 <button 
                    key={m.id} 
                    onClick={() => setTool(m.id as any)}
                    className={`flex flex-col items-center gap-1 p-2 rounded-xl min-w-[70px] transition-all ${tool === m.id ? 'bg-sky-500 text-white shadow-lg scale-105' : 'text-slate-500 hover:bg-slate-100'}`}
                 >
                    {typeof m.icon === 'string' ? <span className="text-xl">{m.icon}</span> : m.icon}
                    <span className="text-[10px] font-bold">{m.label}</span>
                 </button>
               ))}
           </div>

           {/* Tool Settings */}
           <div className="px-6 py-2 space-y-4 max-h-[30vh] overflow-y-auto">
               
               {/* Picker / Chroma Settings */}
               {(tool === 'picker' || (tool === 'brush' && brushType === 'chroma')) && (
                   <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 space-y-3">
                       <div className="flex items-center justify-between">
                           <span className="text-xs font-bold text-slate-500">色度抠图设置</span>
                           <div className="flex items-center gap-2">
                               {targetColor ? (
                                   <div className="w-6 h-6 rounded-full border border-slate-200 shadow-sm" style={{backgroundColor: rgbToHex(targetColor.r, targetColor.g, targetColor.b)}} />
                               ) : (
                                   <span className="text-[9px] text-red-400">未取色</span>
                               )}
                               <button 
                                  onClick={() => setChromaScope(s => s === 'global' ? 'manual' : 'global')}
                                  className={`text-[9px] px-2 py-1 rounded-md font-bold border ${chromaScope === 'global' ? 'bg-sky-100 text-sky-600 border-sky-200' : (chromaScope === 'box' ? 'bg-orange-100 text-orange-600 border-orange-200' : 'bg-purple-100 text-purple-600 border-purple-200')}`}
                               >
                                   范围: {chromaScope === 'global' ? '全图' : (chromaScope === 'box' ? '框选' : '涂抹')}
                               </button>
                           </div>
                       </div>
                       
                       {targetColor ? (
                           <>
                             <div className="space-y-1">
                                <div className="flex justify-between text-[10px] font-bold text-slate-400"><span>容差</span><span>{tolerance}</span></div>
                                <input type="range" min="1" max="100" value={tolerance} onChange={e => setTolerance(Number(e.target.value))} className="w-full h-1 bg-slate-200 rounded-full accent-sky-500"/>
                             </div>
                             <div className="space-y-1">
                                <div className="flex justify-between text-[10px] font-bold text-slate-400"><span>羽化</span><span>{feather}</span></div>
                                <input type="range" min="0" max="100" value={feather} onChange={e => setFeather(Number(e.target.value))} className="w-full h-1 bg-slate-200 rounded-full accent-sky-500"/>
                             </div>
                             <div className="space-y-1">
                                <div className="flex justify-between text-[10px] font-bold text-slate-400"><span>修复 (去噪)</span><span>{repair}</span></div>
                                <input type="range" min="0" max="100" value={repair} onChange={e => setRepair(Number(e.target.value))} className="w-full h-1 bg-slate-200 rounded-full accent-sky-500"/>
                                <p className="text-[9px] text-slate-400 mt-1">自动填充误删的小区域，值越大填充越强</p>
                             </div>
                             <div className="space-y-1">
                                <div className="flex justify-between text-[10px] font-bold text-slate-400"><span>清除边缘 (Erode)</span><span>{erode}</span></div>
                                <input type="range" min="0" max="100" value={erode} onChange={e => setErode(Number(e.target.value))} className="w-full h-1 bg-slate-200 rounded-full accent-sky-500"/>
                                <p className="text-[9px] text-slate-400 mt-1">收缩边缘，去除颜色溢出</p>
                             </div>
                           </>
                       ) : (
                           <p className="text-[10px] text-slate-400 text-center py-2">请切换到"取色"工具点击图片</p>
                       )}
                   </div>
               )}

               {/* Brush Settings */}
               {tool === 'brush' && (
                   <div className="space-y-3">
                       {/* Brush Type Toggles */}
                       <div className="flex gap-2">
                           <button onClick={() => setBrushType('pen')} className={`flex-1 py-1.5 rounded-lg text-xs font-bold border ${brushType==='pen' ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-500 border-slate-200'}`}>画笔</button>
                           <button onClick={() => setBrushType('eraser')} className={`flex-1 py-1.5 rounded-lg text-xs font-bold border ${brushType==='eraser' ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-500 border-slate-200'}`}>橡皮</button>
                           <button onClick={() => setBrushType('chroma')} className={`flex-1 py-1.5 rounded-lg text-xs font-bold border ${brushType==='chroma' ? 'bg-purple-500 text-white border-purple-500' : 'bg-white text-purple-500 border-purple-200'}`}>抠图笔</button>
                       </div>

                       <div className="space-y-1">
                           <div className="flex justify-between text-[10px] font-bold text-slate-400"><span>大小</span><span>{brushSize}</span></div>
                           <input type="range" min="5" max="150" value={brushSize} onChange={e => setBrushSize(Number(e.target.value))} className="w-full h-1 bg-slate-200 rounded-full accent-slate-800"/>
                       </div>

                       {brushType === 'pen' && (
                           <div className="flex items-center gap-2 overflow-x-auto pb-1">
                               {['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff', '#000000', '#ffffff'].map(c => (
                                   <button 
                                      key={c} 
                                      onClick={() => setBrushColor(c)}
                                      className={`w-8 h-8 rounded-full border-2 flex-shrink-0 ${brushColor === c ? 'border-slate-800 scale-110' : 'border-transparent'}`}
                                      style={{backgroundColor: c}}
                                   />
                               ))}
                               <input type="color" value={brushColor} onChange={e => setBrushColor(e.target.value)} className="w-8 h-8 rounded-full border-none p-0 overflow-hidden" />
                           </div>
                       )}

                       {brushType === 'chroma' && (
                           <div className="text-[10px] bg-purple-50 p-2 rounded text-purple-700 text-center">
                               {chromaScope === 'global' ? '提示: 涂抹会自动切换为"涂抹范围"模式' : '涂抹区域将应用色度抠图效果'}
                           </div>
                       )}

                       <button onClick={() => clearLayer(brushType)} className="w-full py-2 border border-red-200 text-red-500 rounded-lg text-xs font-bold flex items-center justify-center gap-2 active:bg-red-50">
                           <IconTrash className="w-3 h-3"/> 清空当前图层
                       </button>
                   </div>
               )}
               
               {tool === 'marquee' && (
                   <div className="flex flex-col gap-2">
                       <p className="text-[10px] text-slate-400 text-center">拖拽画面框选区域，进行裁剪或抠图</p>
                       <div className="flex gap-2 mt-2">
                           <button onClick={() => applyMarqueeCrop(false)} disabled={!selectionRect} className="flex-1 py-3 bg-slate-800 text-white rounded-xl text-xs font-bold shadow-lg flex items-center justify-center gap-2 disabled:opacity-50">
                                <IconScissors className="w-4 h-4" /> 仅保留
                           </button>
                           <button onClick={() => applyMarqueeCrop(true)} disabled={!selectionRect} className="flex-1 py-3 bg-red-500 text-white rounded-xl text-xs font-bold shadow-lg flex items-center justify-center gap-2 disabled:opacity-50">
                                <IconTrash className="w-4 h-4" /> 擦除选区
                           </button>
                       </div>
                       <button onClick={applyMarqueeChroma} disabled={!selectionRect} className="w-full py-3 bg-purple-500 text-white rounded-xl text-xs font-bold shadow-lg flex items-center justify-center gap-2 disabled:opacity-50">
                            <IconMagic className="w-4 h-4" /> 区域内色度抠图
                       </button>
                   </div>
               )}
               {tool === 'view' && <p className="text-[10px] text-slate-400 text-center py-2">单指拖动，双指缩放旋转</p>}
           </div>
        </div>
      )}
    </div>
  );
};

export default Editor;