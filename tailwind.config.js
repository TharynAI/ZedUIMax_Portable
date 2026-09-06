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
        // Backgrounds (warm neutral spectrum - matches titleBarOverlay #202020)
        'bg-primary': '#1c1c1c',
        'bg-secondary': '#252525',
        'bg-tertiary': '#303030',
        'bg-elevated': '#3a3a3a',

        // Accents (orange/amber spectrum)
        'accent': '#f59e0b',
        'accent-hover': '#fbbf24',
        'accent-muted': '#d97706',

        // Glow variants
        'glow-amber': 'rgba(245, 158, 11, 0.4)',
        'glow-amber-intense': 'rgba(245, 158, 11, 0.6)',
        'accent-dim': 'rgba(245, 158, 11, 0.15)',
        'accent-border': 'rgba(245, 158, 11, 0.3)',

        // Semantic colors
        'success': '#22c55e',
        'warning': '#eab308',
        'error': '#ef4444',
        'info': '#3b82f6',

        // Text
        'text-primary': '#f5f5f5',
        'text-secondary': '#9ca3af',
        'text-muted': '#6b7280',

        // Borders (warm neutral)
        'border': '#404040',
        'border-light': '#555555',
      },
      boxShadow: {
        'glow-sm': '0 0 8px rgba(245, 158, 11, 0.3)',
        'glow-md': '0 0 16px rgba(245, 158, 11, 0.4)',
        'glow-lg': '0 0 24px rgba(245, 158, 11, 0.5)',
        'glow-xl': '0 0 32px rgba(245, 158, 11, 0.6)',
        'glow-pulse': '0 0 20px rgba(245, 158, 11, 0.3), 0 0 40px rgba(245, 158, 11, 0.1)',
        'inner-glow': 'inset 0 0 12px rgba(245, 158, 11, 0.2)',
        'cyber': '0 4px 20px rgba(0, 0, 0, 0.5), 0 0 1px rgba(245, 158, 11, 0.5)',
      },
      borderRadius: {
        'cyber': '2px',
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
        'mono': ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace'],
        'cyber': ['Share Tech Mono', 'JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [],
}
// <END Tharyn | ZedUI Cyberpunk
