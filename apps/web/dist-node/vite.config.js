import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// https://vite.dev/config/
export default defineConfig({
    plugins: [react()],
    server: {
        port: 5173,
        strictPort: false,
        // Proxy /api → local Spring Boot backend (avoids CORS in dev).
        // See ../../../complaints/docs/TECHNICAL_DESIGN.md §16.6
        proxy: {
            '/api': {
                target: 'http://localhost:8080',
                changeOrigin: true,
            },
        },
    },
});
