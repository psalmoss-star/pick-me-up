/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        void: '#050508',
        panel: { DEFAULT: '#0F0D16', hi: '#1C1628' },
        frame: '#E8E4D9',
        rare: '#B57CE0',
        gold: '#D4AF37',
        blood: '#C1272D',
        amber: '#E0913A',
        ink: { DEFAULT: '#F0ECE2', dim: '#8A8496' },
      },
      fontFamily: {
        // 이 프로젝트의 본문 폰트는 명조 계열이다. 산세리프 금지.
        serif: ['"Nanum Myeongjo"', '"Noto Serif KR"', 'Batang', 'serif'],
      },
    },
  },
  plugins: [],
};
