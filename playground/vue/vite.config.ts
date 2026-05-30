import { defineConfig } from 'vite'
import Vue from '@vitejs/plugin-vue'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [Vue()],
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:10010',
    },
  },
})
