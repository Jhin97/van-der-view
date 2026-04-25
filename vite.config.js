import { defineConfig } from 'vite';
import mkcert from 'vite-plugin-mkcert';
import { WebSocketServer } from 'ws';

// HTTPS is required for WebXR on the Quest. Set VITE_NO_HTTPS=1 for local 2D
// dev (e.g. CI / preview tooling that does not trust the mkcert root).
const useHttps = !process.env.VITE_NO_HTTPS;

// Relay WebSocket plugin: any message a client sends is broadcast to every
// other connected client. Used to mirror cube transforms between the Quest
// session and a spectator browser on the laptop. Mounted at `/sync` so it
// doesn't collide with Vite's own HMR WebSocket.
function syncRelayPlugin() {
  return {
    name: 'van-der-view-sync',
    configureServer(server) {
      return () => {
        if (!server.httpServer) return;
        const wss = new WebSocketServer({ noServer: true });
        wss.on('connection', (ws) => {
          ws.on('message', (data, isBinary) => {
            for (const client of wss.clients) {
              if (client !== ws && client.readyState === 1) {
                client.send(data, { binary: isBinary });
              }
            }
          });
        });
        server.httpServer.on('upgrade', (req, socket, head) => {
          const url = new URL(req.url, 'http://localhost');
          if (url.pathname !== '/sync') return; // let Vite's HMR handle others
          wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
        });
        server.httpServer.on('close', () => wss.close());
      };
    },
  };
}

export default defineConfig({
  plugins: [...(useHttps ? [mkcert()] : []), syncRelayPlugin()],
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
