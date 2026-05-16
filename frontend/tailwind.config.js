/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: '#f97316', light: '#fb923c', dark: '#ea580c' },
        vault: { bg: '#0a0e17', card: '#111827', border: '#1f2937' },
      },
    },
  },
  plugins: [],
};
