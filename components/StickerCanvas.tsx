import React, { useRef, useEffect, useCallback } from 'react';
import { Sticker } from '../types';

interface StickerCanvasProps {
  stickers: Sticker[];
  setStickers: React.Dispatch<React.SetStateAction<Sticker[]>>;
  width: number;
  height: number;
  canvasRef: React.RefObject<HTMLCanvasElement>;
  selectedStickerId: string | null;
  setSelectedStickerId: (id: string | null) => void;
}

const StickerCanvas: React.FC<StickerCanvasProps> = ({
  stickers,
  width,
  height,
  canvasRef,
  selectedStickerId,
}) => {
  const imageCache = useRef<Map<string, HTMLImageElement>>(new Map());

  // Load images
  useEffect(() => {
    stickers.forEach(s => {
      if (!imageCache.current.has(s.url)) {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.src = s.url;
        img.onload = () => {
          // Force redraw if needed, but the loop below handles it
        };
        imageCache.current.set(s.url, img);
      }
    });
  }, [stickers]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, width, height);

    stickers.forEach(sticker => {
      const img = imageCache.current.get(sticker.url);
      if (!img || !img.complete) return;

      ctx.save();
      ctx.translate(sticker.x, sticker.y);
      ctx.rotate((sticker.rotation * Math.PI) / 180);
      ctx.scale(sticker.scale, sticker.scale);

      // Draw image centered
      const w = 100 * sticker.aspectRatio; // Base width 100
      const h = 100;
      ctx.drawImage(img, -w / 2, -h / 2, w, h);

      // Selection indicator
      if (sticker.id === selectedStickerId) {
        ctx.strokeStyle = '#42A5F5';
        ctx.lineWidth = 2 / sticker.scale;
        ctx.strokeRect((-w / 2) - 5, (-h / 2) - 5, w + 10, h + 10);
      }

      ctx.restore();
    });
  }, [stickers, width, height, selectedStickerId]);

  // Animation loop for smooth rendering
  useEffect(() => {
    let animationFrameId: number;
    const render = () => {
      draw();
      animationFrameId = requestAnimationFrame(render);
    };
    render();
    return () => cancelAnimationFrame(animationFrameId);
  }, [draw]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className="absolute top-0 left-0 w-full h-full z-10"
      // Gestures are now handled by parent component overlay
    />
  );
};

export default StickerCanvas;