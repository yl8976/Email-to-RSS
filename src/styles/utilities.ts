// Utility styles for the application
// Contains styles for utility classes like copyable text, animations, etc.

export const utilityStyles = `
  /* Animations */
  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  
  .fade-in {
    animation: fadeIn 0.5s ease-out;
  }

  .muted {
    color: var(--color-text-secondary);
  }

  @media (prefers-reduced-motion: reduce) {
    .fade-in {
      animation: none;
    }

    * {
      scroll-behavior: auto !important;
      transition-duration: 0.01ms !important;
    }
  }
  
  /* Copyable content styling */
  .copyable {
    position: relative;
    display: flex;
    align-items: center;
    margin-bottom: var(--spacing-xs);
    padding: var(--spacing-sm) var(--spacing-md);
    background-color: rgba(60, 60, 67, 0.1);
    border-radius: var(--radius-md);
    transition: background-color var(--transition-fast);
  }
  
  /* When inside a grid, ensure proper fit */
  .email-metadata-grid .copyable {
    margin-bottom: 0; /* Remove bottom margin inside grid */
  }
  
  .copyable-label {
    font-weight: var(--font-weight-semibold);
    color: var(--color-text-secondary);
    margin-right: var(--spacing-sm);
    user-select: none;
    white-space: nowrap;
  }
  
  .copyable-content {
    display: inline-flex;
    align-items: center;
    cursor: pointer;
    padding: var(--spacing-xs) var(--spacing-sm);
    border-radius: var(--radius-sm);
    transition: background-color var(--transition-fast);
    width: fit-content;
    overflow: hidden; /* Prevent overflow in small containers */
    flex: 1; /* Take remaining space */
  }
  
  .copyable-content:hover {
    background-color: rgba(60, 60, 67, 0.2);
  }
  
  .copyable-value {
    word-break: break-all;
    margin-right: var(--spacing-xs);
    overflow: hidden;
    text-overflow: ellipsis;
    flex: 1;
  }
  
  .copy-icon-container {
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    width: 20px;
    height: 20px;
  }
  
  .copy-icon {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
  }
  
  /* Simplified icon states and transitions */
  .copy-icon-original {
    opacity: 0.6;
    transition: opacity 0.2s ease, transform 0.2s ease;
  }
  
  /* Only apply hover effect when not in copied state */
  .copyable-content:hover:not(.copied) .copy-icon-original {
    opacity: 1;
  }
  
  .copy-icon-success {
    opacity: 0;
    transform: translate(-50%, -50%) scale(0.8);
    color: var(--color-success);
    transition: opacity 0.2s ease, transform 0.2s ease;
  }
  
  /* When copied, hide original and show success icon with a smooth transition */
  .copyable-content.copied .copy-icon-original {
    opacity: 0;
    transform: translate(-50%, -50%) scale(0.8);
  }
  
  .copyable-content.copied .copy-icon-success {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1);
  }
`;
