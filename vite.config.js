import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

// https://vitejs.dev/config/
import { resolve } from 'path';

export default defineConfig({
  root: resolve(__dirname, 'public'),
  base: '/LR-seq-data-db/',
  plugins: [svelte()],
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'public', 'index.html'),
      },
    },
  },
});
