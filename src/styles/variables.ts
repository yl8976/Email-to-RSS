// Design system variables for the application
// Contains CSS variables for typography, colors, spacing, radius, animations, etc.

export const variables = `
  :root {
    /* Typography - Prefer system UI fonts (Apple HIG-ish) */
    --font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Helvetica Neue", Arial, sans-serif;
    --font-family-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
    color-scheme: light dark;
    --font-size-xs: 12px;
    --font-size-sm: 14px;
    --font-size-md: 16px;
    --font-size-lg: 20px;
    --font-size-xl: 24px;
    --font-size-xxl: 32px;
    --font-weight-regular: 400;
    --font-weight-medium: 500;
    --font-weight-semibold: 600;
    --font-weight-bold: 700;
    
    /* Colors - Dark Mode (Default) */
    --color-primary: #0a84ff;
    --color-primary-dark: #409cff;
    --color-secondary: #5e5ce6;
    --color-success: #30d158;
    --color-warning: #ff9f0a;
    --color-danger: #ff453a;
    --color-danger-dark: #ff6961;
    --color-background: rgba(28, 28, 30, 0.95); /* Semi-transparent for glass effect */
    --color-card: rgba(44, 44, 46, 0.8); /* Semi-transparent for glass effect */
    --color-border: rgba(255, 255, 255, 0.08);
    --color-text-primary: #ffffff;
    --color-text-secondary: #ebebf5;
    --color-text-tertiary: #8e8e93;
    --color-text-on-primary: #ffffff;
    --color-logout: rgba(255, 159, 10, 0.8); /* Orange-tinted for logout */
    
    /* Gradients */
    --gradient-title: linear-gradient(135deg, var(--color-primary), var(--color-secondary));
    
    /* Shadows for dark mode */
    --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.2);
    --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.2);
    --shadow-lg: 0 8px 16px rgba(0, 0, 0, 0.2);
    --shadow-xl: 0 12px 24px rgba(0, 0, 0, 0.2);
    
    /* Spacing */
    --spacing-xs: 4px;
    --spacing-sm: 8px;
    --spacing-md: 16px;
    --spacing-lg: 24px;
    --spacing-xl: 32px;
    --spacing-xxl: 48px;
    
    /* Radius */
    --radius-sm: 8px;
    --radius-md: 12px;
    --radius-lg: 16px;
    --radius-pill: 9999px;
    
    /* Animation - Subtle */
    --transition-fast: 0.15s cubic-bezier(0.16, 1, 0.3, 1);
    --transition-normal: 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    --transition-slow: 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    
    /* Blur for glass effect */
    --blur-sm: 8px;
    --blur-md: 12px;
    --blur-lg: 20px;
  }
`;

// Light mode variables
export const lightModeTheme = `
  /* Light Mode Support - Based on device preference */
  @media (prefers-color-scheme: light) {
    :root {
      --color-primary: #0070f3;
      --color-primary-dark: #0051a8;
      --color-secondary: #5e5ce6;
      --color-success: #34c759;
      --color-warning: #ff9500;
      --color-danger: #ff3b30;
      --color-danger-dark: #d70015;
      --color-background: rgba(245, 245, 247, 0.9); /* Semi-transparent for glass effect */
      --color-card: rgba(255, 255, 255, 0.8); /* Semi-transparent for glass effect */
      --color-border: rgba(0, 0, 0, 0.06);
      --color-text-primary: #000000;
      --color-text-secondary: #666666;
      --color-text-tertiary: #999999;
      --color-text-on-primary: #ffffff;
      --color-logout: rgba(255, 149, 0, 0.8); /* Orange-tinted for logout */
      
      /* Reset shadows for light mode */
      --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.03);
      --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.05);
      --shadow-lg: 0 8px 16px rgba(0, 0, 0, 0.06);
      --shadow-xl: 0 12px 24px rgba(0, 0, 0, 0.08);
      
      /* Update gradient for light mode */
      --gradient-title: linear-gradient(135deg, var(--color-primary), var(--color-secondary));
    }
  }
`;

// Inter font import
export const fontImport = `
  /* No external font imports. */
`;
