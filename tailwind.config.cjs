/** Paleta editorial do portfólio. Gera o tailwind.css com: npm run build:css */
module.exports = {
  content: ['./index.html', './script.js', './src/**/*.js'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        paper: '#F7F5F0',
        surface: '#FFFFFF',
        surfaceSubtle: '#F0EDE5',
        ink: {
          DEFAULT: '#0B1320',
          secondary: '#1E293B',
          body: '#334155',
          muted: '#556377'
        },
        ochre: {
          DEFAULT: '#B8860B',
          light: '#C5A059',
          dark: '#8B6508'
        }
      },
      fontFamily: {
        heading: ['Manrope', 'sans-serif'],
        sans: ['Manrope', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace']
      }
    }
  }
};
