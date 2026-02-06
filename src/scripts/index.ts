// Main scripts exports file
// Combines and re-exports all JavaScript functionality

import { modalScripts, emailViewScripts, initScripts } from "./interactions";
import { clipboardScripts } from "./clipboard";
import { authHelpers } from "./auth";
import { toastScripts } from "./toast";

// Combine all scripts into a single JavaScript string
export const interactiveScripts = `
  ${toastScripts}
  ${modalScripts}
  ${emailViewScripts}
  ${clipboardScripts}
  ${initScripts}
`;

// Re-export for modular usage if needed
export {
  modalScripts,
  emailViewScripts,
  initScripts,
  clipboardScripts,
  authHelpers,
  toastScripts,
};
