import { defineConfig } from 'vite';

// サーバーは1ファイルにバンドルする（senryu-game・anagram-game と同じ）。
// エンジンをそのまま取り込めるので、Node の ESM に拡張子付きの import を書いて回らずに済む。
// express / socket.io は node_modules から読むので Vite が自動で外す。
export default defineConfig({
  build: {
    ssr: 'server/index.ts',
    outDir: 'dist-server',
    target: 'node22',
    emptyOutDir: true,
    rollupOptions: { output: { entryFileNames: 'index.js' } },
  },
});
