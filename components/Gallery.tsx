
import React, { useState, useEffect } from 'react';
import { GalleryItem, FrameData, AspectRatio } from '../types';
import { IconClose, IconTrash, IconDownload, IconCheck, IconImage, IconSticker, IconFrame, IconCloud, IconPlus } from './Icons';
import { downloadBlob, dbAdd, dbDelete, STORE_GALLERY, STORE_STICKERS, STORE_FRAMES, getTimestampStr, getPublicAssetUrl } from '../utils';
import JSZip from 'jszip';

interface GalleryProps {
  items: GalleryItem[];
  setItems: React.Dispatch<React.SetStateAction<GalleryItem[]>>;
  onClose: () => void;
  frames: FrameData[];
  setFrames: React.Dispatch<React.SetStateAction<FrameData[]>>;
  stickers: {id: string, url: string}[];
  setStickers: React.Dispatch<React.SetStateAction<{id: string, url: string}[]>>;
}

type Tab = 'photos' | 'stickers' | 'frames' | 'official';

const Gallery: React.FC<GalleryProps> = ({ 
    items, setItems, onClose,
    frames, setFrames,
    stickers, setStickers
}) => {
  const [activeTab, setActiveTab] = useState<Tab>('photos');
  const [selectedItem, setSelectedItem] = useState<GalleryItem | null>(null);
  
  // Official Tab State
  const [officialSubTab, setOfficialSubTab] = useState<'stickers' | 'frames'>('stickers');
  const [addingAsset, setAddingAsset] = useState<string | null>(null);
  const [officialStickersList, setOfficialStickersList] = useState<string[]>([]);
  const [officialFramesList, setOfficialFramesList] = useState<string[]>([]);

  // Selection Mode State (Only for photos currently)
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isZipping, setIsZipping] = useState(false);

  // Fetch Official Info
  useEffect(() => {
      const fetchInfo = async () => {
          try {
              const sRes = await fetch(getPublicAssetUrl('official/stickers/stickers_info.json'));
              if (sRes.ok) {
                  const sData = await sRes.json();
                  if (sData.image_count) {
                      setOfficialStickersList(Array.from({ length: sData.image_count }, (_, i) => `${i + 1}.png`));
                  }
              }
          } catch(e) { console.warn("Could not load stickers info", e); }

          try {
              const fRes = await fetch(getPublicAssetUrl('official/frame/frame_info.json'));
              if (fRes.ok) {
                  const fData = await fRes.json();
                  if (fData.image_count) {
                      setOfficialFramesList(Array.from({ length: fData.image_count }, (_, i) => `${i + 1}.png`));
                  }
              }
          } catch(e) { console.warn("Could not load frames info", e); }
      };
      fetchInfo();
  }, []);

  // --- Helpers for Photos ---
  const toggleSelection = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedIds(newSet);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === items.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(items.map(i => i.id)));
  };

  const deleteSelectedPhotos = async () => {
    if (selectedIds.size === 0) return;
    if (window.confirm(`确定删除这 ${selectedIds.size} 项吗?`)) {
        const idsToDelete = Array.from(selectedIds);
        for (const id of idsToDelete) {
            await dbDelete(STORE_GALLERY, id);
        }
        setItems(prev => prev.filter(i => !idsToDelete.includes(i.id)));
        setSelectedIds(new Set());
        setIsSelectMode(false);
    }
  };

  const deleteSinglePhoto = async (id: string) => {
      if(window.confirm("删除?")) { 
          await dbDelete(STORE_GALLERY, id);
          setItems(p => p.filter(i=>i.id!==id)); 
          setSelectedItem(null); 
      } 
  };

  const handleDownloadSelected = async () => {
    if (selectedIds.size === 0) return;
    const selectedItems = items.filter(i => selectedIds.has(i.id));
    if (selectedItems.length <= 5) {
        selectedItems.forEach(item => downloadBlob(item.blob, item.filename));
    } else {
        setIsZipping(true);
        try {
            const zip = new JSZip();
            selectedItems.forEach((item) => zip.file(item.filename, item.blob));
            const content = await zip.generateAsync({ type: "blob" });
            downloadBlob(content, `skycam_selected_${Date.now()}.zip`);
        } catch (e) { alert("打包失败"); } finally { setIsZipping(false); }
    }
  };

  // --- Deletion & Download for Assets ---
  const deleteAsset = async (type: 'sticker'|'frame', id: string) => {
      if(window.confirm("确定删除这个素材吗？")) {
          if (type === 'sticker') {
              await dbDelete(STORE_STICKERS, id);
              setStickers(p => p.filter(s => s.id !== id));
          }
          if (type === 'frame') {
              await dbDelete(STORE_FRAMES, id);
              setFrames(p => p.filter(f => f.id !== id));
          }
      }
  };
  
  const handleDownloadAsset = async (url: string, filename: string) => {
      try {
          const res = await fetch(url);
          const blob = await res.blob();
          downloadBlob(blob, filename);
      } catch (e) {
          console.error("Download failed", e);
          const a = document.createElement('a');
          a.href = url;
          a.download = filename;
          a.click();
      }
  };

  // --- Logic for Official Assets ---
  const handleAddOfficialAsset = async (filename: string) => {
      setAddingAsset(filename);
      const folder = officialSubTab === 'stickers' ? 'stickers' : 'frame';
      // Use relative path
      const path = getPublicAssetUrl(`official/${folder}/${filename}`);
      
      try {
          const res = await fetch(path);
          if (!res.ok) throw new Error("Asset not found");
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          const id = `off_${getTimestampStr()}_${Math.random().toString().slice(2,5)}`;

          if (officialSubTab === 'stickers') {
              const newSticker = { id, url, blob };
              // @ts-ignore
              setStickers(prev => [...prev, newSticker]);
              await dbAdd(STORE_STICKERS, newSticker);
          } else {
              // Calculate Aspect Ratio for Frame
              const img = new Image();
              img.onload = async () => {
                  const ratio = img.width / img.height;
                  let ar: AspectRatio = '3:4';
                  if (Math.abs(ratio - 1) < 0.1) ar = '1:1';
                  else if (Math.abs(ratio - 9/16) < 0.1) ar = '9:16';
                  else if (Math.abs(ratio - 4/3) < 0.1) ar = '4:3';
                  else if (Math.abs(ratio - 16/9) < 0.1) ar = '16:9';
                  else ar = `${img.width}:${img.height}`;

                  const newFrame: FrameData = { id, name: '官方素材', url, aspectRatio: ar, blob };
                  setFrames(prev => [...prev, newFrame]);
                  await dbAdd(STORE_FRAMES, newFrame);
                  setAddingAsset(null);
              };
              img.src = url;
              return; 
          }
      } catch (e) {
          console.error("Failed to add asset", e);
          // Simplified error message
          alert("添加素材失败。请检查网络或确认 official 文件夹资源是否存在。");
      }
      setAddingAsset(null);
  };

  // --- Renderers ---
  const renderPhotos = () => (
      <div className="grid grid-cols-3 gap-0.5 pb-24">
         {items.length === 0 && (
           <div className="col-span-3 text-center py-20 text-gray-500 flex flex-col items-center">
             <div className="w-16 h-16 bg-gray-800 rounded-full flex items-center justify-center mb-4">📷</div>
             <p>暂无照片或视频</p>
           </div>
         )}
         {[...items].reverse().map(item => {
           const isSelected = selectedIds.has(item.id);
           return (
             <div 
               key={item.id} 
               className={`aspect-square relative cursor-pointer bg-gray-800 overflow-hidden group ${isSelected ? 'opacity-100' : (isSelectMode ? 'opacity-60' : 'opacity-100')}`}
               onClick={() => {
                   if (isSelectMode) toggleSelection(item.id);
                   else setSelectedItem(item);
               }}
             >
               {item.type === 'image' ? (
                 <img src={item.url} alt="" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
               ) : (
                 <video src={item.url} className="w-full h-full object-cover pointer-events-none" />
               )}
               {item.type === 'video' && <div className="absolute top-1 right-1 bg-black/60 backdrop-blur-sm px-1.5 py-0.5 rounded text-[9px] font-bold">VIDEO</div>}
               {item.filename.includes('live') && <div className="absolute top-1 right-1 bg-yellow-400/90 text-black px-1.5 py-0.5 rounded text-[9px] font-bold">LIVE</div>}
               {isSelectMode && (
                   <div className="absolute top-2 left-2 z-20">
                       <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${isSelected ? 'bg-sky-500 border-sky-500' : 'bg-black/30 border-white/70'}`}>
                           {isSelected && <IconCheck className="w-3 h-3 text-white" />}
                       </div>
                   </div>
               )}
             </div>
           );
         })}
      </div>
  );

  const renderStickers = () => (
      <div className="grid grid-cols-4 gap-4 p-4 pb-24">
          {stickers.length === 0 && <div className="col-span-4 text-center py-10 text-gray-500">暂无自定义贴纸</div>}
          {stickers.map(s => (
              <div key={s.id} className="aspect-square relative group bg-white/5 rounded-xl border border-white/10 p-2 flex items-center justify-center">
                  <div className="absolute inset-0 bg-[url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAMUlEQVQ4T2NkYGAQYcAP3uCTZhw1gGGYhAGBZIA/nYDCgBDAm9BGDWAAjyQc6wcgAgA9xwwByzr4kgAAAABJRU5ErkJggg==')] opacity-10 rounded-lg"></div>
                  <img src={s.url} className="max-w-full max-h-full object-contain relative z-10" />
                  <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-20">
                      <button onClick={(e) => {e.stopPropagation(); handleDownloadAsset(s.url, `sticker_${s.id}.png`)}} className="bg-sky-500 text-white rounded-full p-1 shadow-sm hover:bg-sky-400"><IconDownload className="w-3 h-3"/></button>
                      <button onClick={(e) => {e.stopPropagation(); deleteAsset('sticker', s.id)}} className="bg-red-500 text-white rounded-full p-1 shadow-sm hover:bg-red-400"><IconTrash className="w-3 h-3"/></button>
                  </div>
              </div>
          ))}
      </div>
  );

  const renderFrames = () => (
      <div className="grid grid-cols-3 gap-4 p-4 pb-24">
          {frames.filter(f => f.id !== 'none').length === 0 && <div className="col-span-3 text-center py-10 text-gray-500">暂无自定义画框</div>}
          {frames.filter(f => f.id !== 'none').map(f => (
              <div key={f.id} className="aspect-[3/4] relative group bg-white/5 rounded-xl border border-white/10 overflow-hidden">
                   <img src={f.url} className="w-full h-full object-contain" />
                   <div className="absolute bottom-0 w-full bg-black/60 text-[9px] text-center py-1 truncate px-1">{f.name}</div>
                   <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-20">
                      <button onClick={(e) => {e.stopPropagation(); handleDownloadAsset(f.url, `frame_${f.id}.png`)}} className="bg-sky-500 text-white rounded-full p-1 shadow-sm hover:bg-sky-400"><IconDownload className="w-3 h-3"/></button>
                      <button onClick={(e) => {e.stopPropagation(); deleteAsset('frame', f.id)}} className="bg-red-500 text-white rounded-full p-1 shadow-sm hover:bg-red-400"><IconTrash className="w-3 h-3"/></button>
                   </div>
              </div>
          ))}
      </div>
  );

  const renderOfficial = () => {
      const currentList = officialSubTab === 'stickers' ? officialStickersList : officialFramesList;
      return (
      <div className="flex flex-col h-full">
          <div className="flex justify-center p-4">
              <div className="flex bg-white/10 rounded-full p-1">
                  <button 
                    onClick={() => setOfficialSubTab('stickers')}
                    className={`px-4 py-1.5 rounded-full text-xs font-bold transition-colors ${officialSubTab === 'stickers' ? 'bg-sky-500 text-white shadow-md' : 'text-gray-400 hover:text-white'}`}
                  >
                      贴纸
                  </button>
                  <button 
                    onClick={() => setOfficialSubTab('frames')}
                    className={`px-4 py-1.5 rounded-full text-xs font-bold transition-colors ${officialSubTab === 'frames' ? 'bg-sky-500 text-white shadow-md' : 'text-gray-400 hover:text-white'}`}
                  >
                      画框
                  </button>
              </div>
          </div>
          
          <div className="grid grid-cols-4 gap-4 p-4 pb-24 overflow-y-auto">
              {currentList.length === 0 && <div className="col-span-4 text-center text-gray-500 text-xs">加载中或无素材...</div>}
              {currentList.map(filename => {
                  const folder = officialSubTab === 'stickers' ? 'stickers' : 'frame';
                  // Use relative path for image display
                  const path = getPublicAssetUrl(`official/${folder}/${filename}`);
                  return (
                      <div key={filename} className="aspect-square relative group bg-white/5 rounded-xl border border-white/10 p-2 flex flex-col items-center justify-center">
                          <div className="absolute inset-0 bg-[url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAMUlEQVQ4T2NkYGAQYcAP3uCTZhw1gGGYhAGBZIA/nYDCgBDAm9BGDWAAjyQc6wcgAgA9xwwByzr4kgAAAABJRU5ErkJggg==')] opacity-10 rounded-lg"></div>
                          <img 
                            src={path} 
                            alt={filename} 
                            crossOrigin="anonymous"
                            className="max-w-full max-h-full object-contain relative z-10" 
                            onError={(e) => {
                                // Simple error fallback - hide image or show broken icon
                                e.currentTarget.style.opacity = '0.3';
                            }}
                          />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center z-20 rounded-xl">
                              <button 
                                onClick={() => handleAddOfficialAsset(filename)}
                                disabled={addingAsset === filename}
                                className="bg-sky-500 text-white rounded-full p-2 shadow-lg hover:bg-sky-400 active:scale-95 disabled:bg-gray-500"
                              >
                                  {addingAsset === filename ? (
                                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                  ) : (
                                      <IconPlus className="w-4 h-4"/>
                                  )}
                              </button>
                          </div>
                      </div>
                  )
              })}
          </div>
      </div>
  )};

  // --- Detail View (Only for Photos) ---
  if (selectedItem) {
    return (
      <div className="fixed inset-0 z-[60] bg-black text-white flex flex-col animate-fade-in">
        <div className="flex-1 flex items-center justify-center bg-black relative">
            {selectedItem.type === 'image' ? (
                <img src={selectedItem.url} className="max-h-full max-w-full object-contain" />
            ) : (
                <video src={selectedItem.url} controls autoPlay className="max-h-full max-w-full object-contain" />
            )}
        </div>
        <div className="flex justify-around items-center py-6 bg-gray-900 pb-safe border-t border-white/10">
            <button onClick={() => setSelectedItem(null)} className="text-gray-400 font-medium text-sm px-4">返回</button>
            <button onClick={() => downloadBlob(selectedItem.blob, selectedItem.filename)} className="px-8 py-3 bg-sky-500 rounded-full font-bold text-white shadow-lg active:scale-95 flex items-center gap-2"><IconDownload className="w-4 h-4" /> 保存</button>
            <button onClick={() => deleteSinglePhoto(selectedItem.id)} className="p-3 bg-red-500/10 text-red-400 rounded-full hover:bg-red-500/20"><IconTrash className="w-5 h-5" /></button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-gray-900 text-white flex flex-col animate-slide-up font-sans">
      {/* Header & Tabs */}
      <div className="bg-gray-800/80 backdrop-blur-md z-10 pt-safe border-b border-white/5 shadow-xl">
          <div className="flex justify-between items-center p-4 pb-2">
            <h2 className="text-lg font-bold">图库</h2>
            <button onClick={onClose} className="p-2 bg-white/10 rounded-full hover:bg-white/20"><IconClose className="w-5 h-5" /></button>
          </div>
          
          <div className="flex px-4 pb-0 gap-4 overflow-x-auto hide-scrollbar">
              {[
                  { id: 'photos', label: '相册', icon: <IconImage className="w-4 h-4"/>, count: items.length },
                  { id: 'stickers', label: '贴纸', icon: <IconSticker className="w-4 h-4"/>, count: stickers.length },
                  { id: 'frames', label: '画框', icon: <IconFrame className="w-4 h-4"/>, count: frames.filter(f=>f.id!=='none').length },
                  { id: 'official', label: '素材库', icon: <IconCloud className="w-4 h-4"/>, count: '' },
              ].map(tab => (
                  <button 
                    key={tab.id}
                    onClick={() => { setActiveTab(tab.id as Tab); setIsSelectMode(false); }}
                    className={`pb-3 flex items-center gap-2 text-sm font-bold border-b-2 transition-all whitespace-nowrap ${activeTab === tab.id ? 'border-sky-500 text-sky-400' : 'border-transparent text-gray-400'}`}
                  >
                      {tab.icon} {tab.label} {tab.count !== '' && <span className="text-[10px] opacity-60 bg-white/10 px-1.5 rounded-full">{tab.count}</span>}
                  </button>
              ))}
          </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto bg-gray-900">
          {activeTab === 'photos' && renderPhotos()}
          {activeTab === 'stickers' && renderStickers()}
          {activeTab === 'frames' && renderFrames()}
          {activeTab === 'official' && renderOfficial()}
      </div>

      {/* Action Bar (Photos Only) */}
      {activeTab === 'photos' && items.length > 0 && (
          <div className="absolute bottom-0 left-0 w-full bg-gray-800/90 backdrop-blur-lg border-t border-white/10 p-4 pb-safe flex justify-between items-center z-20">
              {isSelectMode ? (
                  <>
                    <button onClick={deleteSelectedPhotos} disabled={selectedIds.size === 0} className="text-red-400 font-bold text-sm px-4 disabled:opacity-30">删除 ({selectedIds.size})</button>
                    <div className="flex gap-3">
                         <button onClick={toggleSelectAll} className="px-4 py-2 bg-gray-700 rounded-full text-xs font-bold">{selectedIds.size === items.length ? '全不选' : '全选'}</button>
                         <button onClick={handleDownloadSelected} disabled={selectedIds.size === 0 || isZipping} className="px-6 py-2 bg-sky-500 rounded-full font-bold text-white shadow-lg active:scale-95 flex items-center gap-2 disabled:bg-gray-600 disabled:text-gray-400 text-xs">
                            {isZipping ? '打包中...' : `保存 (${selectedIds.size})`}
                         </button>
                    </div>
                  </>
              ) : (
                  <div className="w-full flex justify-center">
                      <button onClick={() => setIsSelectMode(true)} className="px-8 py-2 bg-gray-700 rounded-full text-sm font-bold shadow-md active:scale-95">批量管理</button>
                  </div>
              )}
          </div>
      )}
    </div>
  );
};

export default Gallery;
