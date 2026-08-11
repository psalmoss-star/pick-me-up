import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react()],
  server: {
    /*
      실기기(폰) 확인용 — 0.0.0.0에 바인딩해 같은 WiFi의 폰에서 접속할 수 있게 한다.
      Vite 기본값은 localhost 전용이라 폰에서 접속 자체가 불가능하다.
      이 프로젝트는 모바일 세로 전용이므로 실기기 확인이 상시 필요하다.
    */
    host: true,
  },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
