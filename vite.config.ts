import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiPort = env.VITE_API_PORT || '3001';

  return {
    plugins: [react()],
    root: 'client',
    server: {
      port: 5173,
      strictPort: false,
      proxy: {
        '/api': {
          target: `http://localhost:${apiPort}`,
          changeOrigin: true,
          timeout: 300000, // 5 min pour uploads lourds (extract/complete)
        },
        '/files': { target: `http://localhost:${apiPort}`, changeOrigin: true },
        '/models': { target: `http://localhost:${apiPort}`, changeOrigin: true },
      },
    },
  };
});
