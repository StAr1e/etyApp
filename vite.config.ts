import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load env variables from .env file
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react()],
    define: {
      // ONLY expose the key in Development mode for local testing
      // In Production (Render), this will be undefined, forcing the app to use the secure /api endpoint
      'import.meta.env.VITE_GEMINI_API_KEY': mode === 'development' ? JSON.stringify(env.GEMINI_API_KEY || env.VITE_GEMINI_API_KEY) : undefined,
    },
    server: {
      port: 5173,
      proxy: {
        // Proxy API requests to the Express server during development (if you run the backend manually)
        '/api': {
          target: 'http://localhost:3000',
          changeOrigin: true,
          secure: false,
        }
      }
    }
  }
})