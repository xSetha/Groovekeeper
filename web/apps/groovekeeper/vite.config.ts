import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';
import { checkSiteSettings, securityHeaders, supabaseUrl } from './deploy.ts';

// The repository root: the app imports the sample songs from samples/songs.
const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));
const appDir = fileURLToPath(new URL('.', import.meta.url));

// The Amp theme's colors (src/index.css, themes.ts): the tile behind the logo, the window and the toolbar.
const LOGO_TILE = '#141111';
const WINDOW = '#0f0d0d';
const TOOLBAR = '#161313';

// Installable and usable offline (PWA). The icons are drawn from public/favicon.svg at build time; the ones
// with a background (Android's maskable icon, the iPhone's home screen icon) get the logo's tile behind it.
const pwa = VitePWA({
  registerType: 'prompt', // a new version waits until the user reloads (src/updates.ts)
  injectRegister: false, // src/updates.ts registers it; no inline script for the CSP to allow
  pwaAssets: {
    image: 'public/favicon.svg',
    preset: {
      transparent: { sizes: [64, 192, 512], favicons: [[48, 'favicon.ico']] },
      maskable: { sizes: [512], padding: 0.3, resizeOptions: { background: LOGO_TILE } },
      apple: { sizes: [180], padding: 0.2, resizeOptions: { background: LOGO_TILE } },
    },
    injectThemeColor: false, // index.html has one, which themes.ts keeps in step with the theme
  },
  manifest: {
    name: 'Groovekeeper',
    short_name: 'Groovekeeper',
    description: 'Write chord sheets: lyrics with each chord on the syllable where it changes.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: WINDOW,
    theme_color: TOOLBAR,
  },
  workbox: {
    globPatterns: ['**/*.{js,css,html,svg,png,ico,webp}'],
    // Parts of jsPDF the app never uses stay out of the offline copy (named by the build, below).
    globIgnores: ['**/unused-*.js'],
    navigateFallback: 'index.html',
    // The PDF fonts (2.5 MB) are kept the first time a PDF is exported, not with the app.
    runtimeCaching: [
      {
        urlPattern: /\/assets\/[^/]+\.ttf$/,
        handler: 'CacheFirst',
        options: { cacheName: 'pdf-fonts', expiration: { maxEntries: 10 } },
      },
    ],
  },
});

// jsPDF's HTML and SVG rendering (html2canvas, DOMPurify, canvg) are chunks the app never loads.
const UNUSED = /[\\/]node_modules[\\/](html2canvas|dompurify|canvg)[\\/]/;

export default defineConfig(({ command, mode }) => {
  // A build checks its settings before anything else (deploy.ts).
  if (command === 'build') checkSiteSettings(mode, appDir);
  return {
    plugins: [
      react(),
      tailwindcss(),
      pwa,
      ...(command === 'build' ? [securityHeaders(supabaseUrl(mode, appDir))] : []),
    ],
    build: {
      rolldownOptions: {
        output: {
          chunkFileNames: (chunk) => (UNUSED.test(chunk.facadeModuleId ?? '') ? 'assets/unused-[name]-[hash].js' : 'assets/[name]-[hash].js'),
        },
      },
    },
    server: { fs: { allow: [repoRoot] } },
    test: {
      environment: 'jsdom',
      setupFiles: ['./test/react-renders.ts', './test/setup.ts'],
    },
  };
});
