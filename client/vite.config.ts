import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import type { Plugin } from "vite";

// Inject a rel="preload" hint for the generated CSS bundle so the browser
// discovers it earlier in the waterfall, reducing render-blocking time.
function preloadCssPlugin(): Plugin {
    let cssFileName = "";
    return {
        name: "preload-css",
        generateBundle(_options, bundle) {
            for (const file of Object.keys(bundle)) {
                if (file.endsWith(".css")) {
                    cssFileName = file;
                    break;
                }
            }
        },
        transformIndexHtml(html) {
            if (!cssFileName) return html;
            return html.replace(
                "</head>",
                `  <link rel="preload" href="/${cssFileName}" as="style" />\n</head>`
            );
        },
    };
}

// https://vite.dev/config/
export default defineConfig({
    plugins: [react(), tailwindcss(), preloadCssPlugin()],
    server: {
        proxy: {
            '/api': {
                target: 'http://localhost:5000',
                changeOrigin: true,
            },
        },
    },
    build: {
        rollupOptions: {
            output: {
                manualChunks(id) {
                    // Keep react core in a stable vendor chunk (needed for initial render)
                    if (
                        id.includes('node_modules/react/') ||
                        id.includes('node_modules/react-dom/') ||
                        id.includes('node_modules/react-router-dom/')
                    ) return 'vendor';
                    // recharts intentionally left out — it lives in the lazy RankDetail
                    // chunk so it only loads when /rank/:id is visited
                },
            },
        },
    },
});
