/* START> Tharyn | ZedUI Cyberpunk
    2025-12-28
    What: Cyberpunk design system - glow effects, sharp edges, animations
    Why: Transform flat design to sharp/cyberpunk aesthetic
    Expected: All components use cyber utilities for consistent styling
    2025-12-28
    What: Warm neutral gray palette to match titleBarOverlay
    Why: Cool/blue-tinted grays clashed with Windows title bar tone
    Expected: All UI grays match the warm neutral tone of #202020 titlebar
*/
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/renderer/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // ZedCache-family surfaces
        'bg-primary': '#10110f',
        'bg-secondary': '#1c1d19',
        'bg-tertiary': '#23241f',
        'bg-elevated': '#2a2b25',

        // Accents (orange/amber spectrum)
        'accent': '#e5a43b',
        'accent-hover': '#ffb94c',
        'accent-muted': '#bc8127',

        // Glow variants
        'glow-amber': 'rgba(229, 164, 59, 0.22)',
        'glow-amber-intense': 'rgba(229, 164, 59, 0.34)',
        'accent-dim': 'rgba(229, 164, 59, 0.12)',
        'accent-border': 'rgba(229, 164, 59, 0.32)',

        // Semantic colors
        'success': '#7fb786',
        'warning': '#e5a43b',
        'error': '#ce6f62',
        'info': '#7898a1',

        // Text
        'text-primary': '#f0ede4',
        'text-secondary': '#9b9a8e',
        'text-muted': '#6d6d64',
        'text-tertiary': '#6d6d64',

        // Borders (warm neutral)
        'border': '#35362f',
        'border-light': '#4b4c42',
      },
      boxShadow: {
        'glow-sm': '0 0 0 1px rgba(229, 164, 59, 0.16)',
        'glow-md': '0 6px 20px rgba(0, 0, 0, 0.30)',
        'glow-lg': '0 10px 30px rgba(0, 0, 0, 0.38)',
        'glow-xl': '0 16px 44px rgba(0, 0, 0, 0.46)',
        'glow-pulse': '0 0 0 1px rgba(229, 164, 59, 0.22)',
        'inner-glow': 'inset 0 0 0 1px rgba(229, 164, 59, 0.12)',
        'cyber': '0 18px 56px rgba(0, 0, 0, 0.48)',
      },
      borderRadius: {
        'cyber': '4px',
        'none': '0',
      },
      animation: {
        'glow-pulse': 'glowPulse 2s ease-in-out infinite',
        'scan-line': 'scanLine 8s linear infinite',
        'slide-up': 'slideUp 0.2s ease-out',
      },
      keyframes: {
        glowPulse: {
          '0%, 100%': { boxShadow: '0 0 8px rgba(245, 158, 11, 0.3)' },
          '50%': { boxShadow: '0 0 20px rgba(245, 158, 11, 0.6)' },
        },
        scanLine: {
          '0%': { backgroundPosition: '0% 0%' },
          '100%': { backgroundPosition: '0% 100%' },
        },
        slideUp: {
          from: { opacity: '0', transform: 'translateY(10px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      fontFamily: {
        'mono': ['Cascadia Mono', 'Consolas', 'monospace'],
        'cyber': ['Bahnschrift', 'Aptos Display', 'Segoe UI', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
// <END Tharyn | ZedUI Cyberpunk
