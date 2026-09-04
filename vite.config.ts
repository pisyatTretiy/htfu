import { defineConfig } from 'vite';

export default defineConfig({
  // Яндекс Игры отдают билд из подпути — все ссылки должны быть относительными.
  base: './',
  build: {
    target: 'es2020',
    assetsInlineLimit: 4096,
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        // Латиница в именах файлов — требование площадки.
        assetFileNames: 'assets/[name]-[hash][extname]',
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
      },
    },
  },
  server: { host: true, port: 5173 },
});
