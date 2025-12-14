# Sagiri Camera

高颜值的 Web 相机应用，集成拍摄、装饰、素材管理与离线使用能力，可直接作为 iOS / Android PWA 安装到主屏幕。

## 功能亮点
- **多模式拍摄**：支持照片、视频、Live Photo，并提供滤镜、画框、贴纸、构图辅助等工具。
- **可视化编辑**：编辑器与装饰模式能抠图、加画框、叠贴纸，实时预览。
- **素材库**：本地自定义素材 + 官方素材源（贴纸/画框）一键导入，已接入 IndexedDB 持久化。
- **图库管理**：查看、批量操作、导出 ZIP；支持直播录像与图片混排。
- **PWA 离线体验**：vite-plugin-pwa 提供缓存＆安装能力，Tailwind CDN、官方素材与主图标都有离线策略，iOS/Android 均可离线打开。

## 快速开始
> 需要 Node.js 18+。

```bash
npm install
npm run dev
```
访问终端提示的地址（默认 http://localhost:3000）。首次运行会自动生成 PWA manifest 与 Service Worker。

### 环境变量
如果需要调用外部 API（如 Gemini），请在根目录创建 `.env.local` 并设置：
```
GEMINI_API_KEY=你的密钥
```
缺省情况下应用仍能运行。

## 构建与预览
```bash
npm run build   # 产出 dist/
npm run preview # 本地预览生产包
```
预览时同样会注册 Service Worker，用于验证离线/安装体验。

## PWA 使用说明
1. 先在线打开一次页面，确保官方素材与 Tailwind CDN 缓存完毕。
2. 在浏览器菜单中选择 “添加到主屏幕”/“Install app”。
3. 离线模式：断网后再点击图标即可离线使用；若样式异常，清理浏览器的站点数据重试。
4. Android 图标使用 maskable PNG，iOS 则使用 `icon/apple-touch-icon.png`，均与 manifest 对齐。

## 目录结构速览
```
├─ App.tsx             # 主菜单与路由控制
├─ components/         # Camera、Editor、Gallery 等核心组件
├─ public/
│  ├─ icon/            # favicon、maskable、apple-touch 图标
│  └─ official/        # 官方素材（贴纸/画框）
├─ utils.ts            # 下载、IndexedDB、几何等工具
├─ vite.config.ts      # Vite + React + PWA 配置
└─ pwa.ts              # Service Worker 注册入口
```

## 部署提示
- 任何支持静态站点的托管（Netlify、Vercel 等）均可直接上传 `dist/`。
- 确保 `public/manifest.webmanifest` 与 `icon/` 目录一起发布，否则 PWA 图标无法加载。
- 需要自定义官方素材时，更新 `public/official/` 内文件与对应的 `*_info.json`。

Enjoy Sagiri Camera! 💙
