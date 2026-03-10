import { defineConfig } from 'vite';

export default defineConfig({
    // Serve assets folder as static
    publicDir: 'assets',
    build: {
        outDir: 'dist',
        assetsDir: 'assets',
        rollupOptions: {
            output: {
                manualChunks: {
                    three: ['three'],
                }
            }
        }
    },
    server: {
        port: 5173,
        https: false,
    }
});