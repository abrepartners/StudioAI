/** @type {import('tailwindcss').Config} */
export default {
  // Match the CDN's class discovery: scan the root single-file shell, every
  // component, hook, template, and API response that returns HTML strings.
  content: [
    './index.html',
    './App.tsx',
    './index.tsx',
    './components/**/*.{ts,tsx,js,jsx}',
    './hooks/**/*.{ts,tsx,js,jsx}',
    './utils/**/*.{ts,tsx,js,jsx}',
    './src/**/*.{ts,tsx,js,jsx}',
    './templates/**/*.{ts,tsx,js,jsx}',
    './api/**/*.{ts,tsx,js,jsx,mjs}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      // F10 — type scale collapse.
      // Legacy pixel-specific bracket utilities (text-[7px]…text-[13px])
      // map here; ramp stays 12→20 so visual parity with the CDN holds.
      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '0.875rem' }], // 10px — replaces text-[8px]..text-[10px]
        'xs': ['0.75rem', { lineHeight: '1rem' }],       // 12px — replaces text-[11px]..text-[12px]
        'sm': ['0.8125rem', { lineHeight: '1.125rem' }], // 13px — replaces text-[13px]
        'base': ['0.9375rem', { lineHeight: '1.375rem' }], // 15px
        'lg': ['1.0625rem', { lineHeight: '1.5rem' }],     // 17px
        'xl': ['1.25rem', { lineHeight: '1.75rem' }],      // 20px
        'display': ['2.5rem', { lineHeight: '1.1', letterSpacing: '-0.02em' }],
      },
      // F12 — radius collapse.
      // rounded-[2.5rem]/[2rem]/[1.25rem] collapse to rounded-3xl (Apple card radius).
      // rounded-[10px]/[14px] collapse to rounded-lg/xl.
      borderRadius: {
        'sm': '0.375rem',
        'md': '0.625rem',
        'lg': '0.875rem',
        'xl': '1rem',
        '2xl': '1.25rem',
        '3xl': '2rem',
      },
      colors: {
        // Keep CSS vars as source of truth; alias common palette here so
        // Tailwind utilities resolve to the same tokens the CDN build did.
        ink: 'var(--color-ink)',
        surface: 'var(--color-surface)',
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'SF Pro Display', 'Segoe UI', 'Roboto', 'sans-serif'],
        display: ['"DM Serif Display"', 'Georgia', 'serif'],
      },
    },
  },
  plugins: [],
};
