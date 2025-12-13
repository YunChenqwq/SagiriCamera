
export enum CameraMode {
  PHOTO = 'PHOTO',
  LIVE = 'LIVE',
  VIDEO = 'VIDEO'
}

export interface Sticker {
  id: string;
  url: string;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  aspectRatio: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface GalleryItem {
  id: string;
  type: 'image' | 'video';
  url: string;
  blob: Blob;
  timestamp: string; // Display string
  filename: string;  // For download
}

export type FlashMode = 'off' | 'on' | 'auto';

// Update: Allow string for custom ratios
export type AspectRatio = '1:1' | '3:4' | '9:16' | '4:3' | '16:9' | string;

export type CameraResolution = '720P' | '1080P' | '2K' | '4K';

export interface FilterSettings {
  brightness: number; // 100 base
  contrast: number;   // 100 base
  saturation: number; // 100 base
  hue: number;        // 0 base (degrees)
  sepia: number;      // 0 base (simulates warmth)
  blur: number;       // 0 base (px)
  temperature: number; // 0 base, -50 to 50
  tint: number;        // 0 base, -50 to 50
}

export interface FrameData {
  id: string;
  name: string;
  url: string;
  aspectRatio: AspectRatio;
}