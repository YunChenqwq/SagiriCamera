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
          'SagiriCamera.jpg',
          'Author.jpg',
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
          shortcuts: [
            {
              name: 'Sagiri Camera',
              url: '/',
              icons: [
                {
                  src: 'icon/web-app-manifest-192x192.png',
                  sizes: '192x192',
                  type: 'image/png',
                  purpose: 'any maskable',
                },
              ],
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,jpg,json}'],
          globIgnores: ['**/official/**'],
          runtimeCaching: [
            {
              urlPattern: ({ url, sameOrigin }) =>
                sameOrigin && url.pathname.startsWith('/official/'),
              handler: 'CacheFirst',
              options: {
                cacheName: 'official-assets',
                expiration: {
                  maxEntries: 100,
                  maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: ({ url, sameOrigin }) =>
                sameOrigin && /SagiriCamera\.jpg$|Author\.jpg$/i.test(url.pathname),
              handler: 'CacheFirst',
              options: {
                cacheName: 'profile-images',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 30,
                },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            {
              urlPattern: ({ url }) =>
                url.origin === 'https://cdn.tailwindcss.com',
              handler: 'CacheFirst',
              options: {
                cacheName: 'tailwind-cdn',
                expiration: {
                  maxEntries: 1,
                  maxAgeSeconds: 60 * 60 * 24 * 30,
                },
                cacheableResponse: { statuses: [0, 200] },
              },
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
