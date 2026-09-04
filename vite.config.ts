import { defineConfig } from 'vite';

/**
 * Vite configuration tuned for YouTube Playables:
 *  - `base: './'` keeps every generated asset reference relative (hard requirement).
 *  - Assets below 8 KiB are inlined so the bundle ships fewer, smaller files.
 *  - No manual chunking: Playables prefer a small number of files over many
 *    round trips, and the whole game must be available at first interaction.
 */
export default defineConfig({
  base: './',
  build: {
    target: 'es2019',
    outDir: 'dist',
    assetsDir: 'assets',
    assetsInlineLimit: 8192,
    cssCodeSplit: false,
    sourcemap: false,
    minify: 'esbuild',
    reportCompressedSize: true,
    chunkSizeWarningLimit: 2048,
    rollupOptions: {
      output: {
        // Engine and game code are split so the (large, stable) Phaser chunk
        // is cacheable and the game chunk stays small and easy to inspect.
        manualChunks(id) {
          if (id.includes('node_modules/phaser')) return 'phaser';
          return undefined;
        },
      },
    },
  },
  esbuild: {
    drop: ['debugger'],
  },
  server: {
    host: true,
    port: 5173,
  },
  preview: {
    host: true,
    port: 4173,
  },
});
