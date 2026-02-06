// Layout styles for the application
// Contains styles for containers, headers, page structure

export const layoutStyles = `
  /* Base Page Layout */
  .page {
    font-family: var(--font-family);
    line-height: 1.5;
    background-color: var(--color-background);
    color: var(--color-text-primary);
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    transition: background-color var(--transition-normal);
    overflow-x: hidden;
    margin: 0;
    padding: 0;
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
    
    /* Liquid-glass-ish background (subtle, non-distracting) */
    background-image:
      radial-gradient(1200px circle at 20% 10%, rgba(10, 132, 255, 0.18), transparent 55%),
      radial-gradient(900px circle at 80% 20%, rgba(94, 92, 230, 0.14), transparent 60%),
      radial-gradient(700px circle at 50% 100%, rgba(48, 209, 88, 0.10), transparent 60%),
      linear-gradient(135deg, rgba(255, 255, 255, 0.03) 0%, rgba(0, 0, 0, 0.03) 100%);
    background-attachment: fixed;
  }
  
  /* Main Container */
  .container {
    width: 100%;
    max-width: 980px;
    margin: 0 auto;
    padding: var(--spacing-xl);
    box-sizing: border-box;
  }
  
  /* Header Styles */
  .header {
    margin-bottom: var(--spacing-xl);
  }
  
  .header h1 {
    font-size: var(--font-size-xxl);
    font-weight: var(--font-weight-bold);
    margin-bottom: var(--spacing-xs);
    line-height: 1.2;
    background: var(--gradient-title);
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
    display: inline-block;
  }
  
  .header p {
    font-size: var(--font-size-lg);
    color: var(--color-text-secondary);
    margin-top: 0;
    max-width: 80%;
  }
  
  /* Authentication Screen Layout */
  .auth-container {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background-color: var(--color-background);
  }
  
  .auth-card {
    width: 100%;
    max-width: 400px;
    padding: var(--spacing-xl);
    background-color: var(--color-card);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-xl);
    border: 1px solid var(--color-border);
    transition: all var(--transition-normal);
    backdrop-filter: blur(var(--blur-md));
    -webkit-backdrop-filter: blur(var(--blur-md));
  }
  
  .auth-logo {
    text-align: center;
    margin-bottom: var(--spacing-xl);
  }
  
  .auth-title {
    font-size: var(--font-size-xl);
    text-align: center;
    margin-bottom: var(--spacing-xl);
  }
  
  .auth-error {
    color: var(--color-danger);
    background-color: rgba(255, 59, 48, 0.1);
    padding: var(--spacing-md);
    border-radius: var(--radius-md);
    margin-bottom: var(--spacing-lg);
    text-align: center;
    font-weight: var(--font-weight-medium);
    backdrop-filter: blur(var(--blur-sm));
    -webkit-backdrop-filter: blur(var(--blur-sm));
  }
  
  .auth-form {
    margin-bottom: var(--spacing-lg);
  }
  
  .auth-button {
    width: 100%;
    margin-top: var(--spacing-lg);
  }
  
  /* Responsive Adjustments */
  @media (max-width: 768px) {
    .container {
      padding: var(--spacing-md);
    }
    
    .header {
      padding: var(--spacing-md) 0;
      margin-bottom: var(--spacing-lg);
    }
    
    .header h1 {
      font-size: var(--font-size-xl);
    }
  }

  .header-with-actions {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: var(--spacing-xl);
  }
  
  .header-title {
    flex: 1;
  }
  
  .header h1, .header-title h1 {
    font-size: var(--font-size-xxl);
    font-weight: var(--font-weight-bold);
    margin-bottom: var(--spacing-xs);
    line-height: 1.2;
    color: var(--color-text-primary); /* Fallback color */
    background: var(--gradient-title);
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
    display: inline-block;
  }
  
  .header p, .header-title p {
    font-size: var(--font-size-lg);
    color: var(--color-text-secondary);
    margin-top: 0;
    max-width: 80%;
  }
  
  .header-actions {
    display: flex;
    align-items: center;
    margin-top: var(--spacing-md);
  }
  
  .feed-title {
    font-size: var(--font-size-xl);
    margin-bottom: var(--spacing-md);
    color: var(--color-text-primary);
  }
`; 
