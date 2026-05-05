import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Coloring Book',
        short_name: 'Coloring',
        description: 'Stylus-friendly coloring book',
        theme_color: '#fff8dc',
        background_color: '#fff8dc',
        // Open in fullscreen on Android (no status bar, no nav bar). Browsers
        // that don't support 'fullscreen' walk down the override chain to the
        // first one they recognise — so iOS / desktop fall back to
        // 'standalone' (which already gives a chromeless launch experience).
        display: 'fullscreen',
        display_override: ['fullscreen', 'standalone', 'minimal-ui'],
        orientation: 'any',
        start_url: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
      },
    }),
  ],
  worker: {
    format: 'es',
  },
});
