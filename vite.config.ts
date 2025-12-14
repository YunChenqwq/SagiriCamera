import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [
        react(),
        VitePWA({
          registerType: 'autoUpdate',
          includeAssets: [
            'SagiriCamera.jpg',
            'Author.jpg',
            'favicon.ico'
          ],
          manifest: {
            name: 'Sagiri Camera',
            short_name: 'SagiriCam',
            description: '让虚拟贴纸、画框与拍摄体验随身携带的创意相机应用',
            theme_color: '#0ea5e9',
            background_color: '#0ea5e9',
            display: 'standalone',
            start_url: '/',
            icons: [
              {
                src: 'SagiriCamera.jpg',
                sizes: '512x512',
                type: 'image/jpeg',
                purpose: 'any'
              },
              {
                src: 'SagiriCamera.jpg',
                sizes: '192x192',
                type: 'image/jpeg',
                purpose: 'any maskable'
              }
            ]
          }
        })
      ],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
