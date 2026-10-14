import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022'
  },
  // The BIM index worker imports web-ifc; module workers keep it a single ES bundle.
  worker: {
    format: 'es'
  }
});
