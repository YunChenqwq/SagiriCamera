import React, { useState } from 'react';
import { GalleryItem, FrameData } from '../types';
import { IconClose, IconTrash, IconDownload, IconCheck, IconImage, IconSticker, IconFrame } from './Icons';
import { downloadBlob } from '../utils';
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

type Tab = 'photos' | 'stickers' | 'frames';

const Gallery: React.FC<GalleryProps> = ({ 
    items, setItems, onClose,
    frames, setFrames,
    stickers, setStickers
}) => {
  const [activeTab, setActiveTab] = useState<Tab>('photos');
  const [selectedItem, setSelectedItem] = useState<GalleryItem | null>(null);
  
  // Selection Mode State (Only for photos currently)
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isZipping, setIsZipping] = useState(false);

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

  const deleteSelectedPhotos = () => {
    if (selectedIds.size === 0) return;
    if (window.confirm(`确定删除这 ${selectedIds.size} 项吗?`)) {
        setItems(prev => prev.filter(i => !selectedIds.has(i.id)));
        setSelectedIds(new Set());
        setIsSelectMode(false);
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

  // --- Deletion for Assets ---
  const deleteAsset = (type: 'sticker'|'frame', id: string) => {
      if(window.confirm("确定删除这个素材吗？")) {
          if (type === 'sticker') setStickers(p => p.filter(s => s.id !== id));
          if (type === 'frame') setFrames(p => p.filter(f => f.id !== id));
      }
  }

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
                  <button onClick={(e) => {e.stopPropagation(); deleteAsset('sticker', s.id)}} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity z-20 shadow-sm"><IconTrash className="w-3 h-3"/></button>
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
                   <button onClick={(e) => {e.stopPropagation(); deleteAsset('frame', f.id)}} className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity z-20 shadow-sm"><IconTrash className="w-3 h-3"/></button>
              </div>
          ))}
      </div>
  );

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
            <button onClick={() => { if(window.confirm("删除?")) { setItems(p => p.filter(i=>i.id!==selectedItem.id)); setSelectedItem(null); } }} className="p-3 bg-red-500/10 text-red-400 rounded-full hover:bg-red-500/20"><IconTrash className="w-5 h-5" /></button>
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
          
          <div className="flex px-4 pb-0 gap-6">
              {[
                  { id: 'photos', label: '相册', icon: <IconImage className="w-4 h-4"/>, count: items.length },
                  { id: 'stickers', label: '贴纸', icon: <IconSticker className="w-4 h-4"/>, count: stickers.length },
                  { id: 'frames', label: '画框', icon: <IconFrame className="w-4 h-4"/>, count: frames.filter(f=>f.id!=='none').length },
              ].map(tab => (
                  <button 
                    key={tab.id}
                    onClick={() => { setActiveTab(tab.id as Tab); setIsSelectMode(false); }}
                    className={`pb-3 flex items-center gap-2 text-sm font-bold border-b-2 transition-all ${activeTab === tab.id ? 'border-sky-500 text-sky-400' : 'border-transparent text-gray-400'}`}
                  >
                      {tab.icon} {tab.label} <span className="text-[10px] opacity-60 bg-white/10 px-1.5 rounded-full">{tab.count}</span>
                  </button>
              ))}
          </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto bg-gray-900">
          {activeTab === 'photos' && renderPhotos()}
          {activeTab === 'stickers' && renderStickers()}
          {activeTab === 'frames' && renderFrames()}
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