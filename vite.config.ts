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
          injectRegister: null,
          registerType: 'autoUpdate',
          includeAssets: ['Author.jpg', 'SagiriCamera.jpg'],
          manifest: {
            name: 'Sagiri Camera',
            short_name: 'SagiriCam',
            description: 'Sagiri Camera – 轻松制作“缇雅脸”相机贴纸效果的网页应用。',
            theme_color: '#121212',
            background_color: '#121212',
            start_url: '/',
            display: 'standalone',
            scope: '/',
            icons: [
              {
                src: 'SagiriCamera.jpg',
                sizes: '512x512',
                type: 'image/jpeg',
              },
              {
                src: 'Author.jpg',
                sizes: '192x192',
                type: 'image/jpeg',
              },
            ],
          },
        }),
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
