import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // ポート台帳でこのプロジェクトに割り当てた番号
    port: 5177,
    // 開発中は画面が 5177、ゲームサーバーが 3800 と別プロセスになる。
    // Socket.IO をサーバーへ中継しないと「接続中…」から進まない。ws:true は WebSocket 用
    proxy: {
      '/socket.io': { target: 'http://localhost:3800', ws: true },
    },
  },
});
