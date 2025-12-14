
import { Point } from './types';

const baseUrl = import.meta.env.BASE_URL ?? '/';
const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
export const getPublicAssetUrl = (relativePath: string) => `${normalizedBaseUrl}${relativePath.replace(/^\//, '')}`;

// Standard download anchor method
export const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.style.display = 'none';
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
};

// Generate timestamp string YYYYMMDD_HHMMSS
export const getTimestampStr = () => {
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
};

// Format seconds to MM:SS
export const formatTime = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

// Geometry helpers for gesture manipulation
export const getDistance = (p1: Point, p2: Point) => {
  return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
};

export const getAngle = (p1: Point, p2: Point) => {
  return Math.atan2(p2.y - p1.y, p2.x - p1.x) * (180 / Math.PI);
};

export const getMidpoint = (p1: Point, p2: Point): Point => {
  return {
    x: (p1.x + p2.x) / 2,
    y: (p1.y + p2.y) / 2
  };
};

// --- IndexedDB Persistence ---
const DB_NAME = 'sagiri_cam_db';
const DB_VERSION = 1;
export const STORE_GALLERY = 'gallery';
export const STORE_STICKERS = 'stickers';
export const STORE_FRAMES = 'frames';

export const initDB = async () => {
    return new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (e) => {
            const db = (e.target as IDBOpenDBRequest).result;
            if (!db.objectStoreNames.contains(STORE_GALLERY)) db.createObjectStore(STORE_GALLERY, { keyPath: 'id' });
            if (!db.objectStoreNames.contains(STORE_STICKERS)) db.createObjectStore(STORE_STICKERS, { keyPath: 'id' });
            if (!db.objectStoreNames.contains(STORE_FRAMES)) db.createObjectStore(STORE_FRAMES, { keyPath: 'id' });
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
};

export const dbAdd = async (storeName: string, item: any) => {
    try {
        const db = await initDB();
        return new Promise<void>((resolve, reject) => {
            const tx = db.transaction(storeName, 'readwrite');
            tx.objectStore(storeName).put(item);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    } catch (e) {
        console.error("DB Add Error", e);
    }
};

export const dbGetAll = async (storeName: string) => {
    try {
        const db = await initDB();
        return new Promise<any[]>((resolve, reject) => {
            const tx = db.transaction(storeName, 'readonly');
            const req = tx.objectStore(storeName).getAll();
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    } catch (e) {
        console.error("DB Get Error", e);
        return [];
    }
};

export const dbDelete = async (storeName: string, id: string) => {
    try {
        const db = await initDB();
        return new Promise<void>((resolve, reject) => {
            const tx = db.transaction(storeName, 'readwrite');
            tx.objectStore(storeName).delete(id);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    } catch (e) {
        console.error("DB Delete Error", e);
    }
};
