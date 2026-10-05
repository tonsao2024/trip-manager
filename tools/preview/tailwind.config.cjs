// Tailwind config used only by the offline design preview (mirrors index.html).
module.exports = {
  darkMode: ['class', '[data-theme="dark"]'],
  content: ['./tools/preview/out/*.html'],
  theme: {
    extend: {
      fontFamily: {
        display: ['Outfit', 'Plus Jakarta Sans', 'Noto Sans Thai', 'sans-serif'],
        sans: ['Plus Jakarta Sans', 'Noto Sans Thai', 'sans-serif']
      }
    }
  }
};
