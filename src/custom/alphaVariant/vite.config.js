import { defineConfig } from 'file:///D:/codexCode2/alpha-system/alpha-web/node_modules/vite/dist/node/index.js';
import vue from 'file:///D:/codexCode2/alpha-system/alpha-web/node_modules/@vitejs/plugin-vue/dist/index.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
export default defineConfig({
    root: here,
    base: './',
    plugins: [vue()],
    resolve: { alias: {
        axios: path.resolve(here, 'axiosAdapter.js'),
        vue: 'D:/codexCode2/alpha-system/alpha-web/node_modules/vue/dist/vue.esm-bundler.js',
        'element-plus': 'D:/codexCode2/alpha-system/alpha-web/node_modules/element-plus/es/index.mjs',
    } },
    build: { outDir: path.resolve(here, 'dist'), emptyOutDir: true, rollupOptions: { input: path.resolve(here, 'page.html') } },
});
