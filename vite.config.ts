import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  /* Pinned, and strict on purpose. The older `ibsra heros` folder carries the
     same config: with a soft port the two walk up the range and whichever
     started first answers — which is how a stale admin page ended up on
     localhost:5182. This one is always 5182 or it refuses to start. */
  server: { port: 5182, strictPort: true, open: true },
  build: { target: 'es2022' },
})
