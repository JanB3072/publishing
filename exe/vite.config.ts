import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 5173,
    // cargo 编译时会持续写入 src-tauri/target，vite 的 watcher 扫到被锁定的
    // .dll 会抛 EBUSY 导致 beforeDevCommand 崩溃，这里排除掉。
    watch: { ignored: ['**/src-tauri/target/**', '**/target/**'] },
  },
});
