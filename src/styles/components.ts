// Component styles for the application
// Contains styles for buttons, cards, forms, modals, etc.

export const componentStyles = `
  /* Card - Glass Effect */
  .card {
    background-color: var(--color-card);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-md);
    padding: var(--spacing-lg);
    margin-bottom: var(--spacing-lg);
    border: 1px solid var(--color-border);
    transition: all var(--transition-normal);
    backdrop-filter: blur(var(--blur-md));
    -webkit-backdrop-filter: blur(var(--blur-md));
  }
  
  /* Remove top margin for h2 elements in cards */
  .card h2 {
    margin-top: 0;
  }
  
  /* Feed header styling */
  .feed-header {
    margin-bottom: var(--spacing-md);
  }
  
  .feed-title {
    font-size: var(--font-size-xl);
    margin-bottom: var(--spacing-xs);
    color: var(--color-text-primary);
  }
  
  .feed-description {
    font-size: var(--font-size-md);
    color: var(--color-text-secondary);
    margin-top: 0;
    margin-bottom: var(--spacing-sm);
  }
  
  .feed-description.empty {
    color: var(--color-text-tertiary);
    font-style: italic;
  }
  
  /* In-place editing styles */
  input.feed-title-edit,
  .feed-title-edit {
    width: 100%;
    font-size: var(--font-size-xl) !important;
    font-weight: var(--font-weight-bold);
    margin-bottom: var(--spacing-xs);
    padding: 4px 6px !important;
    background-color: transparent !important;
    border: 1px solid var(--color-border);
    color: var(--color-text-primary);
    border-radius: var(--radius-sm);
  }
  
  textarea.feed-description-edit,
  .feed-description-edit {
    width: 100%;
    font-size: var(--font-size-md) !important;
    margin-bottom: var(--spacing-sm);
    padding: 4px 6px !important;
    min-height: 60px;
    background-color: transparent !important;
    border: 1px solid var(--color-border);
    color: var(--color-text-secondary);
    font-family: var(--font-family);
    border-radius: var(--radius-sm);
  }
  
  .hidden {
    display: none !important;
  }
  
  /* Success button styles */
  .button-success {
    background-color: var(--color-primary);
    color: var(--color-text-on-primary);
    border: 1px solid rgba(255, 255, 255, 0.1);
    transition: all 0.5s ease;
  }
  
  .button-success:hover, .button-success:focus {
    background-color: rgba(10, 132, 255, 0.9);
  }
  
  .button-success.saved {
    background-color: var(--color-success);
    transition: all 0.5s ease;
  }
  
  /* Force saved button to stay green on hover */
  .button-success.saved:hover {
    background-color: var(--color-success);
  }
  
  /* Button container with space-between layout */
  .feed-buttons {
    display: flex;
    justify-content: space-between;
    gap: var(--spacing-sm);
  }
  
  .feed-buttons-left {
    display: flex;
    gap: var(--spacing-sm);
  }
  
  /* Fixed width for action buttons to prevent layout shifts during state changes */
  .feed-buttons-left .button {
    width: 140px; /* Fixed exact width instead of min-width */
    justify-content: center; /* Ensure text is centered */
    box-sizing: border-box; /* Ensure padding is included in width calculation */
  }
  
  /* Ensure anchor tags in button containers match button styling exactly */
  .feed-buttons-left a.button {
    width: 140px; /* Same fixed width */
    box-sizing: border-box;
    text-align: center;
  }
  
  .feed-buttons-right {
    margin-left: auto;
  }
  
  /* Button - VisionOS Style with consistent height */
  .button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    height: 44px; /* Fixed height for consistency */
    padding: 0 var(--spacing-lg);
    border-radius: var(--radius-md);
    font-size: var(--font-size-md);
    font-weight: var(--font-weight-medium);
    text-decoration: none;
    cursor: pointer;
    transition: all var(--transition-fast), color 0.3s ease, background-color 0.3s ease;
    white-space: nowrap;
    opacity: 1;
    
    /* Glass effect for buttons */
    background-color: rgba(10, 132, 255, 0.8);
    backdrop-filter: blur(var(--blur-sm));
    -webkit-backdrop-filter: blur(var(--blur-sm));
    border: 1px solid rgba(255, 255, 255, 0.1);
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.1);
    color: var(--color-text-on-primary);
  }
  
  .button:hover, .button:focus {
    background-color: rgba(10, 132, 255, 0.9);
    box-shadow: 0 4px 10px rgba(0, 0, 0, 0.15);
    transform: translateY(-1px);
  }
  
  .button:active {
    transform: translateY(0);
    box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
  }
  
  .button-secondary {
    background-color: rgba(60, 60, 67, 0.1);
    color: var(--color-text-primary);
    border: 1px solid var(--color-border);
  }
  
  .button-secondary:hover, .button-secondary:focus {
    background-color: rgba(60, 60, 67, 0.2);
  }
  
  /* Light mode specific button styling */
  @media (prefers-color-scheme: light) {
    .button-secondary {
      background-color: rgba(60, 60, 67, 0.05);
      border: 1px solid rgba(60, 60, 67, 0.1);
    }
    
    .button-secondary:hover, .button-secondary:focus {
      background-color: rgba(60, 60, 67, 0.1);
    }
  }
  
  /* Logout button styling */
  .button-logout {
    background-color: var(--color-logout);
    color: var(--color-text-on-primary);
    border: 1px solid rgba(255, 255, 255, 0.1);
  }
  
  .button-logout:hover, .button-logout:focus {
    background-color: rgba(255, 159, 10, 0.9);
  }
  
  /* Back button styling */
  .button-back {
    display: inline-flex;
    align-items: center;
    padding-left: var(--spacing-md);
    margin-bottom: var(--spacing-md);
  }
  
  .button-back:before {
    content: "←";
    margin-right: var(--spacing-sm);
    font-size: var(--font-size-lg);
  }
  
  .button-danger {
    background-color: rgba(255, 69, 58, 0.8);
  }
  
  .button-danger:hover, .button-danger:focus {
    background-color: rgba(255, 69, 58, 0.9);
  }
  
  /* Small button variation */
  .button-small {
    height: 36px; /* Smaller height */
    padding: 0 var(--spacing-md);
    font-size: var(--font-size-sm);
  }
  
  /* Form Elements */
  .form-group {
    margin-bottom: var(--spacing-lg);
  }
  
  label {
    display: block;
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-semibold);
    margin-bottom: var(--spacing-xs);
    color: var(--color-text-secondary);
  }
  
  input[type="text"],
  input[type="email"],
  input[type="password"],
  textarea {
    display: block;
    width: 100%;
    padding: var(--spacing-md);
    font-size: var(--font-size-md);
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border);
    background-color: rgba(60, 60, 67, 0.1);
    color: var(--color-text-primary);
    transition: all var(--transition-fast);
    box-sizing: border-box;
    font-family: var(--font-family);
    backdrop-filter: blur(var(--blur-sm));
    -webkit-backdrop-filter: blur(var(--blur-sm));
  }
  
  input:focus,
  textarea:focus {
    outline: none;
    border-color: var(--color-primary);
    box-shadow: 0 0 0 2px rgba(10, 132, 255, 0.2);
  }
  
  /* Modal */
  .modal-bg {
    display: none;
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.3);
    backdrop-filter: blur(var(--blur-lg));
    -webkit-backdrop-filter: blur(var(--blur-lg));
    justify-content: center;
    align-items: center;
    z-index: 1000;
    opacity: 0;
    transition: opacity var(--transition-normal);
  }
  
  .modal-bg.visible {
    display: flex;
    opacity: 1;
  }
  
  .modal {
    background-color: var(--color-card);
    padding: var(--spacing-xl);
    border-radius: var(--radius-lg);
    max-width: 90%;
    width: 500px;
    box-shadow: var(--shadow-xl);
    transform: scale(0.98);
    opacity: 0;
    transition: all var(--transition-normal);
    border: 1px solid var(--color-border);
    backdrop-filter: blur(var(--blur-md));
    -webkit-backdrop-filter: blur(var(--blur-md));
  }
  
  .modal-bg.visible .modal {
    transform: scale(1);
    opacity: 1;
  }
  
  .modal-header {
    margin-bottom: var(--spacing-lg);
  }
  
  .modal-buttons {
    display: flex;
    justify-content: flex-end;
    gap: var(--spacing-md);
    margin-top: var(--spacing-xl);
  }
  
  /* Toggle/Switch */
  .toggle-switch {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--spacing-md);
  }
  
  .toggle-switch input[type="checkbox"] {
    height: 0;
    width: 0;
    visibility: hidden;
    position: absolute;
  }
  
  .toggle-switch label {
    cursor: pointer;
    width: 50px;
    height: 28px;
    background: var(--color-text-tertiary);
    display: block;
    border-radius: 100px;
    position: relative;
    transition: background-color var(--transition-fast);
  }
  
  .toggle-switch label:after {
    content: "";
    position: absolute;
    top: 2px;
    left: 2px;
    width: 24px;
    height: 24px;
    background: var(--color-text-on-primary);
    border-radius: 90px;
    transition: transform var(--transition-fast);
    box-shadow: var(--shadow-sm);
  }
  
  .toggle-switch input:checked + label {
    background: var(--color-primary);
  }
  
  .toggle-switch input:checked + label:after {
    transform: translateX(22px);
  }
  
  /* Email Content Iframe */
  .email-iframe-container {
    width: 100%;
    overflow: hidden;
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border);
    background-color: #ffffff;
  }
  
  .email-iframe {
    width: 100%;
    height: 500px; /* Smaller default height */
    border: none;
    background-color: #ffffff;
    transition: height 0.3s ease;
  }

  /* Dark mode specific styling for email iframe */
  @media (prefers-color-scheme: dark) {
    .email-iframe-container {
      background-color: #1c1c1e;
      border-color: #3a3a3c;
    }
    .email-iframe {
      background-color: #1c1c1e;
    }
  }

  /* Email Raw View */
  .email-raw {
    padding: var(--spacing-md);
    background-color: rgba(30, 30, 32, 0.7);
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border);
    overflow: auto;
    max-height: 500px; /* Match iframe default height */
    backdrop-filter: blur(var(--blur-sm));
  }
  
  /* Light mode specific styling for Raw HTML view */
  @media (prefers-color-scheme: light) {
    .email-raw {
      background-color: rgba(240, 240, 245, 0.9);
    }
  }
  
  .email-raw pre {
    margin: 0;
    font-family: var(--font-family-mono);
    font-size: 14px;
    white-space: pre-wrap;
    word-break: break-word;
  }
  
  /* Email Metadata Styling */
  .email-meta {
    margin-bottom: var(--spacing-md);
    padding-bottom: var(--spacing-md);
    border-bottom: 1px solid var(--color-border);
  }
  
  .email-meta h2 {
    margin-top: 0;
    margin-bottom: var(--spacing-md);
    font-size: var(--font-size-xl);
    color: var(--color-text-primary);
  }
  
  .email-metadata-grid {
    display: grid;
    grid-template-columns: 1fr;
    grid-template-rows: repeat(4, auto);
    gap: var(--spacing-sm);
  }
  
  @media (min-width: 640px) {
    .email-metadata-grid {
      grid-template-columns: repeat(2, 1fr);
      grid-template-rows: repeat(2, auto);
    }
  }
  
  /* Toggle buttons for email view */
  .toggle-view {
    display: flex;
    gap: var(--spacing-xs);
    margin-bottom: var(--spacing-md);
  }
  
  .toggle-button {
    padding: var(--spacing-sm) var(--spacing-md);
    border-radius: var(--radius-md);
    background-color: rgba(60, 60, 67, 0.1);
    border: 1px solid var(--color-border);
    color: var(--color-text-secondary);
    cursor: pointer;
    transition: all var(--transition-fast);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
  }
  
  .toggle-button:hover {
    background-color: rgba(60, 60, 67, 0.2);
  }
  
  .toggle-button.active {
    background-color: var(--color-primary);
    color: var(--color-text-on-primary);
    border-color: var(--color-primary);
  }
  
  /* Email content container */
  .email-content {
    margin-top: var(--spacing-md);
    border-radius: var(--radius-md);
    overflow: hidden;
  }

  /* Toolbar + segmented control (Apple-ish) */
  .toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--spacing-sm);
    flex-wrap: wrap;
    margin-bottom: var(--spacing-md);
  }

  .toolbar-group {
    display: inline-flex;
    align-items: center;
    gap: var(--spacing-sm);
    flex-wrap: wrap;
  }

  .toolbar-group-fill {
    width: 100%;
  }

  input.search {
    min-width: 280px;
    flex: 1;
  }

  .actions-row {
    display: flex;
    justify-content: flex-end;
    margin-top: var(--spacing-md);
  }

  .pill {
    display: inline-flex;
    align-items: center;
    height: 28px;
    padding: 0 10px;
    border-radius: var(--radius-pill);
    border: 1px solid var(--color-border);
    background-color: rgba(60, 60, 67, 0.12);
    color: var(--color-text-secondary);
    font-size: var(--font-size-sm);
    backdrop-filter: blur(var(--blur-sm));
    -webkit-backdrop-filter: blur(var(--blur-sm));
  }

  .segmented {
    display: inline-flex;
    border-radius: var(--radius-pill);
    padding: 2px;
    border: 1px solid var(--color-border);
    background-color: rgba(60, 60, 67, 0.12);
    backdrop-filter: blur(var(--blur-sm));
    -webkit-backdrop-filter: blur(var(--blur-sm));
    box-shadow: var(--shadow-sm);
  }

  .segmented-item {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 8px 12px;
    border-radius: var(--radius-pill);
    text-decoration: none;
    color: var(--color-text-secondary);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-semibold);
    user-select: none;
    transition: all var(--transition-fast);
  }

  .segmented-item:hover {
    color: var(--color-text-primary);
  }

  .segmented-item.is-active {
    color: var(--color-text-primary);
    background-color: rgba(255, 255, 255, 0.12);
    box-shadow: var(--shadow-sm);
  }

  @media (prefers-color-scheme: light) {
    .segmented-item.is-active {
      background-color: rgba(255, 255, 255, 0.85);
    }
  }

  /* Tables */
  .table-wrap {
    overflow-x: auto;
    border-radius: var(--radius-lg);
    border: 1px solid var(--color-border);
    background-color: rgba(60, 60, 67, 0.05);
  }

  @media (prefers-color-scheme: light) {
    .table-wrap {
      background-color: rgba(255, 255, 255, 0.6);
    }
  }

  table.table {
    width: 100%;
    border-collapse: collapse;
  }

  table.table.table-feeds {
    min-width: 860px;
    table-layout: fixed;
  }

  table.table.table-emails {
    min-width: 760px;
    table-layout: fixed;
  }

  table.table th,
  table.table td {
    padding: 10px 12px;
    border-bottom: 1px solid var(--color-border);
    text-align: left;
    vertical-align: top;
  }

  /* Resizable headers */
  th.th-resizable {
    position: relative;
    padding-right: 18px;
  }

  .th-button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 0;
    border: none;
    background: transparent;
    color: inherit;
    font: inherit;
    cursor: pointer;
    user-select: none;
  }

  .th-button:hover {
    color: var(--color-text-primary);
  }

  .sort-indicator {
    width: 12px;
    height: 12px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    opacity: 0.75;
    font-size: 12px;
  }

  .col-resizer {
    position: absolute;
    top: 0;
    right: 0;
    width: 12px;
    height: 100%;
    cursor: col-resize;
    touch-action: none;
  }

  .col-resizer:after {
    content: "";
    position: absolute;
    right: 5px;
    top: 24%;
    bottom: 24%;
    width: 1px;
    background: var(--color-border);
    opacity: 0.9;
    border-radius: 1px;
  }

  th.th-resizable:hover .col-resizer:after {
    background: rgba(255, 255, 255, 0.2);
  }

  @media (prefers-color-scheme: light) {
    th.th-resizable:hover .col-resizer:after {
      background: rgba(0, 0, 0, 0.15);
    }
  }

  body.is-resizing {
    cursor: col-resize;
    user-select: none;
  }

  table.table thead th {
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-semibold);
    color: var(--color-text-secondary);
    background-color: rgba(44, 44, 46, 0.35);
    backdrop-filter: blur(var(--blur-sm));
    -webkit-backdrop-filter: blur(var(--blur-sm));
  }

  @media (prefers-color-scheme: light) {
    table.table thead th {
      background-color: rgba(255, 255, 255, 0.55);
    }
  }

  table.table tbody tr:hover {
    background-color: rgba(255, 255, 255, 0.04);
  }

  @media (prefers-color-scheme: light) {
    table.table tbody tr:hover {
      background-color: rgba(0, 0, 0, 0.03);
    }
  }

  table.table tbody tr:last-child td {
    border-bottom: none;
  }

  table.table code {
    font-family: var(--font-family-mono);
    font-size: 13px;
  }

  .truncate {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 100%;
  }

  /* Compact copy-to-clipboard for table cells */
  .copyable.copyable-inline {
    margin-bottom: 0;
    padding: 0;
    background-color: transparent;
    border: none;
  }

  .copyable.copyable-inline .copyable-content {
    padding: 6px 8px;
    border-radius: var(--radius-sm);
    width: 100%;
  }

  .copyable.copyable-inline .copyable-value {
    margin-right: var(--spacing-xs);
    word-break: normal;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .row-actions {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }
  
  /* Feed and Email Lists */
  .feed-list,
  .email-list {
    list-style: none;
    padding: 0;
    margin: 0;
  }
`; 
