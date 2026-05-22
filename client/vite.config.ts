import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import type { Plugin } from "vite";

// Inline the generated CSS bundle into the HTML <style> tag at build time.
// This eliminates the render-blocking <link rel="stylesheet"> request (~180ms on mobile 4G)
// at the cost of the CSS not being separately cacheable, which is an acceptable trade-off
// for a small bundle (~8 KiB) and a landing-page-first usage pattern.
function inlineCssPlugin(): Plugin {
    return {
        name: "vite-plugin-inline-css",
        enforce: "post",
        apply: "build",
        generateBundle(_options, bundle) {
            const htmlEntry = Object.entries(bundle).find(([k]) => k.endsWith(".html"));
            if (!htmlEntry) return;
            const [, htmlAsset] = htmlEntry;
            if (htmlAsset.type !== "asset") return;

            let html = String(htmlAsset.source);

            for (const [fileName, asset] of Object.entries(bundle)) {
                if (!fileName.endsWith(".css") || asset.type !== "asset") continue;
                const cssContent = String(asset.source);
                // Match the <link rel="stylesheet"> tag for this specific CSS file
                // regardless of attribute order (Vite adds crossorigin before href).
                const baseName = fileName.split("/").pop()!;
                const escaped = baseName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
                const linkRe = new RegExp(`<link[^>]+href="[^"]*${escaped}"[^>]*>`, "i");
                if (linkRe.test(html)) {
                    html = html.replace(linkRe, `<style>${cssContent}</style>`);
                    delete bundle[fileName]; // Don't emit the standalone .css file
                }
            }

            htmlAsset.source = html;
        },
    };
}

// https://vite.dev/config/
export default defineConfig({
    plugins: [react(), tailwindcss(), inlineCssPlugin()],
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
