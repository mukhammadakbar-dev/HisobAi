/**
 * Central Theme Tokens for HisobAI (Baraka Mobile CRM)
 * Single source of truth for design tokens used across frontend components.
 */

export const THEME_TOKENS = {
  appName: 'HisobAI',
  companyName: 'Baraka Mobile CRM',
  
  colors: {
    primary: {
      main: 'var(--color-brand-primary, #10b981)',
      hover: 'var(--color-brand-primary-hover, #059669)',
      light: '#dcfce7',
      dark: '#064e3b',
    },
    accent: {
      blue: '#3b82f6',
      purple: '#8b5cf6',
    },
    background: {
      light: '#f8fafc',
      dark: '#090d16',
      cardLight: '#ffffff',
      cardDark: '#111827',
    },
    border: {
      light: '#e2e8f0',
      dark: '#1f2937',
    },
    text: {
      lightPrimary: '#0f172a',
      lightSecondary: '#64748b',
      darkPrimary: '#f8fafc',
      darkSecondary: '#94a3b8',
    },
    status: {
      success: '#10b981',
      warning: '#f59e0b',
      danger: '#ef4444',
      info: '#3b82f6',
    },
  },

  layout: {
    sidebarWidth: '260px',
    headerHeight: '64px',
    bottomNavHeight: '60px',
  },

  transitions: {
    fast: '150ms ease-in-out',
    normal: '250ms ease-in-out',
    slow: '350ms ease-in-out',
  },
} as const;

export type ThemeMode = 'light' | 'dark' | 'system';
