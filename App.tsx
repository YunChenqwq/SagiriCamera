
import React, { useState, useEffect } from 'react';
import Camera from './components/Camera';
import Editor from './components/Editor';
import Decorator from './components/Decorator';
import Gallery from './components/Gallery';
import { GalleryItem, FrameData, Sticker } from './types';
import { IconCameraRotate, IconMagic, IconImage, IconClose, IconFrame, IconHeart, IconTv, IconGithub } from './components/Icons';
import { dbGetAll, dbAdd, dbDelete, STORE_GALLERY, STORE_STICKERS, STORE_FRAMES } from './utils';

// Cleared default frames as requested, keeping only 'None'
const INITIAL_FRAMES: FrameData[] = [
  { id: 'none', name: '无边框', url: '', aspectRatio: '3:4' },
];

// App is now the Router / Menu
const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<'menu' | 'camera' | 'editor' | 'decorator' | 'gallery'>('menu');
  const [galleryItems, setGalleryItems] = useState<GalleryItem[]>([]);
  
  // Cleared default stickers as requested
  const [availableStickers, setAvailableStickers] = useState<{id: string, url: string, blob?: Blob}[]>([]);

  const [frames, setFrames] = useState<FrameData[]>(INITIAL_FRAMES);

  // Edit Mode State (Edit existing photo/video)
  const [editMedia, setEditMedia] = useState<{type: 'image' | 'video', url: string} | null>(null);
  
  // Modal for Production Selection
  const [showProductionOptions, setShowProductionOptions] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [dataLoaded, setDataLoaded] = useState(false);

  // Load Persistence Data
  useEffect(() => {
    const loadData = async () => {
        try {
            // Load Gallery
            const savedGallery = await dbGetAll(STORE_GALLERY);
            const processedGallery = savedGallery.map(item => ({
                ...item,
                url: URL.createObjectURL(item.blob) // Recreate URL from Blob
            }));
            setGalleryItems(processedGallery);

            // Load Stickers
            const savedStickers = await dbGetAll(STORE_STICKERS);
            const processedStickers = savedStickers.map(item => ({
                ...item,
                url: item.blob ? URL.createObjectURL(item.blob) : item.url
            }));
            setAvailableStickers(processedStickers);

            // Load Frames
            const savedFrames = await dbGetAll(STORE_FRAMES);
            if (savedFrames.length > 0) {
                const processedFrames = savedFrames.map(item => ({
                    ...item,
                    url: item.blob ? URL.createObjectURL(item.blob) : item.url
                }));
                setFrames([...INITIAL_FRAMES, ...processedFrames]);
            }

            setDataLoaded(true);
        } catch (e) {
            console.error("Failed to load persistence data", e);
        }
    };
    loadData();
  }, []);

  // --- Wrapper Functions to update State AND DB ---
  
  const updateGalleryItems: React.Dispatch<React.SetStateAction<GalleryItem[]>> = (action) => {
      setGalleryItems(prev => {
          const newState = typeof action === 'function' ? action(prev) : action;
          return newState;
      });
  };

  const handleEditMediaUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
          const url = URL.createObjectURL(file);
          const type = file.type.startsWith('image') ? 'image' : 'video';
          setEditMedia({ type, url });
          setCurrentView('decorator'); // Route to Decorator
          setShowProductionOptions(false);
      }
  };

  // Menu Component
  if (currentView === 'menu') {
    return (
      <div className="relative w-full h-[100dvh] bg-sky-50 overflow-hidden flex flex-col items-center justify-center p-6 animate-fade-in font-sans">
        {/* Title */}
        <div className="mb-12 text-center">
            <div className="w-28 h-28 bg-white rounded-[2rem] flex items-center justify-center mb-6 shadow-2xl shadow-sky-200/50 mx-auto animate-bounce p-1.5 ring-4 ring-white/50">
                 <img 
                    src="./SagiriCamera.jpg" 
                    className="w-full h-full object-cover rounded-[1.5rem]" 
                    alt="Sagiri Icon"
                    onError={(e) => {
                        // Prevent falling back to author image if main icon fails
                        e.currentTarget.style.display = 'none';
                        if (e.currentTarget.parentElement) {
                            e.currentTarget.parentElement.innerText = '📷';
                            e.currentTarget.parentElement.classList.add('text-4xl', 'text-sky-300');
                        }
                    }}
                 />
            </div>
            {/* Added extra bottom margin (mb-6) to separate from subtitle */}
            <h1 className="text-5xl font-black tracking-tighter mb-6 bg-gradient-to-r from-pink-400 to-sky-400 bg-clip-text text-transparent drop-shadow-sm">
                Sagiri Camera
            </h1>
            <p className="text-slate-500 font-medium tracking-wide">让虚拟融合进现实</p>
        </div>

        {/* Menu Cards */}
        <div className="w-full max-w-sm space-y-4 relative z-10">
            <button 
                onClick={() => { setEditMedia(null); setCurrentView('camera'); }}
                className="w-full p-4 bg-white/60 backdrop-blur-xl border border-white/60 rounded-3xl shadow-lg hover:shadow-xl hover:bg-white/80 transition-all active:scale-95 flex items-center gap-4 group"
            >
                <div className="w-14 h-14 bg-sky-100 rounded-2xl flex items-center justify-center text-sky-500 group-hover:bg-sky-500 group-hover:text-white transition-colors shadow-sm">
                    <IconCameraRotate className="w-7 h-7" />
                </div>
                <div className="text-left">
                    <h3 className="font-bold text-slate-700 text-lg">拍摄</h3>
                    <p className="text-xs text-slate-400">拍照、实况与视频录制</p>
                </div>
            </button>

            <button 
                onClick={() => setShowProductionOptions(true)}
                className="w-full p-4 bg-white/60 backdrop-blur-xl border border-white/60 rounded-3xl shadow-lg hover:shadow-xl hover:bg-white/80 transition-all active:scale-95 flex items-center gap-4 group"
            >
                <div className="w-14 h-14 bg-pink-100 rounded-2xl flex items-center justify-center text-pink-500 group-hover:bg-pink-500 group-hover:text-white transition-colors shadow-sm">
                    <IconMagic className="w-7 h-7" />
                </div>
                <div className="text-left">
                    <h3 className="font-bold text-slate-700 text-lg">制作</h3>
                    <p className="text-xs text-slate-400">透明抠图、编辑照片与视频</p>
                </div>
            </button>

            <button 
                onClick={() => setCurrentView('gallery')}
                className="w-full p-4 bg-white/60 backdrop-blur-xl border border-white/60 rounded-3xl shadow-lg hover:shadow-xl hover:bg-white/80 transition-all active:scale-95 flex items-center gap-4 group"
            >
                <div className="w-14 h-14 bg-emerald-100 rounded-2xl flex items-center justify-center text-emerald-500 group-hover:bg-emerald-500 group-hover:text-white transition-colors shadow-sm">
                    <IconImage className="w-7 h-7" />
                </div>
                <div className="text-left">
                    <h3 className="font-bold text-slate-700 text-lg">图库</h3>
                    <p className="text-xs text-slate-400">查看与管理作品及素材</p>
                </div>
            </button>
        </div>
        
        {/* Production Options Modal */}
        {showProductionOptions && (
            <div className="absolute inset-0 z-50 bg-black/20 backdrop-blur-sm flex items-end">
                <div className="bg-white/95 backdrop-blur-2xl w-full rounded-t-[2.5rem] p-6 pb-safe animate-slide-up shadow-2xl border-t border-white/50">
                    <div className="flex justify-between items-center mb-6 px-2">
                        <h3 className="font-bold text-lg text-slate-800 tracking-tight">选择制作模式</h3>
                        <button onClick={() => setShowProductionOptions(false)} className="p-2 bg-slate-100 rounded-full hover:bg-slate-200 text-slate-500"><IconClose className="w-5 h-5"/></button>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <button onClick={() => { setShowProductionOptions(false); setCurrentView('editor'); }} className="flex flex-col items-center justify-center p-6 bg-slate-50 rounded-2xl border border-slate-200 active:scale-95 hover:bg-slate-100 transition-all gap-3">
                             <div className="w-12 h-12 rounded-full bg-pink-100 text-pink-500 flex items-center justify-center">
                                 <IconMagic className="w-6 h-6" />
                             </div>
                             <span className="font-bold text-slate-700 text-sm">透明抠图</span>
                             <span className="text-[10px] text-slate-400 text-center">智能去底，自由涂抹</span>
                        </button>
                        
                        <label className="flex flex-col items-center justify-center p-6 bg-slate-50 rounded-2xl border border-slate-200 active:scale-95 hover:bg-slate-100 transition-all gap-3 cursor-pointer">
                             <div className="w-12 h-12 rounded-full bg-sky-100 text-sky-500 flex items-center justify-center">
                                 <IconFrame className="w-6 h-6" />
                             </div>
                             <span className="font-bold text-slate-700 text-sm">装饰编辑</span>
                             <span className="text-[10px] text-slate-400 text-center">上传照片/视频加画框贴纸</span>
                             <input type="file" accept="image/*,video/*" className="hidden" onChange={handleEditMediaUpload} />
                        </label>
                    </div>
                </div>
            </div>
        )}

        <div className="absolute bottom-6 text-[10px] text-slate-400/80 font-mono pointer-events-none">
            V 1.0.0 • 纱雾相机·yunchenqwq
        </div>

        {/* About/Sponsor Button */}
         <button
            onClick={() => setShowAbout(true)}
            className="absolute bottom-6 right-6 p-2.5 bg-white/60 backdrop-blur-md rounded-full shadow-sm text-pink-400 hover:text-pink-500 hover:bg-white transition-all active:scale-95 border border-white/60 z-20"
        >
            <IconHeart className="w-5 h-5" />
        </button>

        {/* About Modal */}
        {showAbout && (
            <div className="absolute inset-0 z-50 bg-black/20 backdrop-blur-sm flex items-center justify-center p-6 animate-fade-in">
                <div className="bg-white/90 backdrop-blur-2xl w-full max-w-xs rounded-[2.5rem] p-6 shadow-2xl border border-white/60 relative animate-slide-up">
                    <button onClick={() => setShowAbout(false)} className="absolute top-4 right-4 p-2 bg-slate-100 rounded-full hover:bg-slate-200 text-slate-500 active:scale-95"><IconClose className="w-4 h-4"/></button>

                    <div className="flex flex-col items-center mb-6 mt-2">
                        <div className="w-20 h-20 rounded-full bg-slate-100 overflow-hidden mb-3 border-[3px] border-white shadow-lg relative group">
                            {/* Author Avatar */}
                            <img src="./author.jpg" alt="yunchenqwq" className="w-full h-full object-cover" onError={(e) => {e.currentTarget.src = "https://github.com/yunchenqwq.png"}} />
                        </div>
                        <h3 className="font-bold text-lg text-slate-800">yunchenqwq</h3>
                        <p className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full mt-1">独立开发者</p>
                    </div>

                    <div className="space-y-3">
                        <a href="https://b23.tv/a4asIxC" target="_blank" rel="noreferrer" className="flex items-center gap-3 p-3 bg-pink-50 rounded-2xl border border-pink-100 hover:bg-pink-100 transition-colors group active:scale-95">
                            <div className="w-10 h-10 rounded-full bg-pink-100 text-pink-500 flex items-center justify-center group-hover:bg-pink-200 shadow-sm">
                                <IconTv className="w-5 h-5" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="text-xs font-bold text-slate-700 truncate">哔哩哔哩</div>
                                <div className="text-[10px] text-slate-400 truncate">和泉纱霧ちゃん的个人空间</div>
                            </div>
                        </a>

                        <a href="https://github.com/yunchenqwq" target="_blank" rel="noreferrer" className="flex items-center gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-100 hover:bg-slate-100 transition-colors group active:scale-95">
                            <div className="w-10 h-10 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center group-hover:bg-slate-300 shadow-sm">
                                <IconGithub className="w-5 h-5" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="text-xs font-bold text-slate-700">Github</div>
                                <div className="text-[10px] text-slate-400">项目源码</div>
                            </div>
                        </a>

                        <a href="https://www.ifdian.net/a/yunchenqwq/plan" target="_blank" rel="noreferrer" className="flex items-center gap-3 p-3 bg-purple-50 rounded-2xl border border-purple-100 hover:bg-purple-100 transition-colors group active:scale-95">
                            <div className="w-10 h-10 rounded-full bg-purple-100 text-purple-500 flex items-center justify-center group-hover:bg-purple-200 shadow-sm">
                                <IconHeart className="w-5 h-5" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="text-xs font-bold text-slate-700">爱发电</div>
                                <div className="text-[10px] text-slate-400">赞助开发者</div>
                            </div>
                        </a>
                    </div>
                </div>
            </div>
        )}
      </div>
    );
  }

  return (
    <>
        {currentView === 'camera' && (
            <Camera 
                onBack={() => { setEditMedia(null); setCurrentView('menu'); }}
                onOpenGallery={() => setCurrentView('gallery')}
                setGalleryItems={setGalleryItems} 
                galleryItems={galleryItems}
                frames={frames}
                setFrames={setFrames}
                availableStickers={availableStickers}
                setAvailableStickers={setAvailableStickers}
            />
        )}
        {currentView === 'editor' && (
            <Editor 
                onBack={() => setCurrentView('menu')} 
                setGalleryItems={setGalleryItems}
                setFrames={setFrames}
                setAvailableStickers={setAvailableStickers}
            />
        )}
        {currentView === 'decorator' && editMedia && (
            <Decorator 
                media={editMedia}
                onBack={() => { setEditMedia(null); setCurrentView('menu'); }}
                setGalleryItems={setGalleryItems}
                frames={frames}
                setFrames={setFrames}
                availableStickers={availableStickers}
                setAvailableStickers={setAvailableStickers}
            />
        )}
        {currentView === 'gallery' && (
            <Gallery 
                items={galleryItems} 
                setItems={setGalleryItems} 
                onClose={() => setCurrentView('menu')} 
                frames={frames}
                setFrames={setFrames}
                stickers={availableStickers}
                setStickers={setAvailableStickers}
            />
        )}
    </>
  );
};

export default App;
