import { defineConfig } from 'vite';
import mkcert from 'vite-plugin-mkcert';

// HTTPS is required for WebXR on the Quest. Set VITE_NO_HTTPS=1 for local 2D
// dev (e.g. CI / preview tooling that does not trust the mkcert root).
const useHttps = !process.env.VITE_NO_HTTPS;

export default defineConfig({
  plugins: [...(useHttps ? [mkcert()] : [])],
  server: {
    https: useHttps,
    port: 5173,
    host: '0.0.0.0',
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
  build: {
    target: 'esnext',
    sourcemap: true,
  },
});
