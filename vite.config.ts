import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
export default defineConfig({ root: 'apps/cockpit-ui', plugins: [viteSingleFile()], build: { outDir: '../../dist/ui', emptyOutDir: true } });
