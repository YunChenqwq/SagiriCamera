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
          'icon/favicon.ico',
          'icon/favicon.svg',
          'icon/apple-touch-icon.png',
        ],
        manifest: {
          name: 'Sagiri Camera',
          short_name: 'SagiriCam',
          description:
            'Portable creative camera for virtual stickers, frames, and live capture',
          theme_color: '#0ea5e9',
          background_color: '#0ea5e9',
          display: 'standalone',
          start_url: '/',
          scope: '/',
          icons: [
            {
              src: 'icon/web-app-manifest-192x192.png',
              sizes: '192x192',
              type: 'image/png',
            },
            {
              src: 'icon/web-app-manifest-512x512.png',
              sizes: '512x512',
              type: 'image/png',
            },
            {
              src: 'icon/favicon-96x96.png',
              sizes: '96x96',
              type: 'image/png',
            },
            {
              src: 'icon/apple-touch-icon.png',
              sizes: '180x180',
              type: 'image/png',
            },
          ],
        },
      }),
    ],
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
  };
});
