import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), '');

    return {
      // The base path for the deployed site
      base: '/Mini-Moog-Polyphonic-sim/',

      // The list of plugins
      plugins: [react()],

      // Global constant replacements
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },

      // Path resolver aliases
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});