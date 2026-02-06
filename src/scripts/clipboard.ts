// Clipboard functionality
// Handles copying text to clipboard with visual feedback

export const clipboardScripts = `
  // Copy text to clipboard with animation feedback
  function copyToClipboard(text, contentElement) {
    if (!contentElement) return;
    
    navigator.clipboard.writeText(text).then(() => {
      // Add the 'copied' class to the content element for success styling
      contentElement.classList.add('copied');
      
      // Remove the class after a delay (let CSS handle the transitions)
      setTimeout(() => {
        contentElement.classList.remove('copied');
      }, 1500);
    }).catch(err => {
      console.error('Could not copy text: ', err);
    });
  }
  
  // Initialize copyable elements
  function setupCopyableElements() {
    // Event delegation avoids attaching hundreds/thousands of listeners
    // when many feeds/emails are rendered in table view.
    document.addEventListener('click', (event) => {
      const target = event.target;
      if (!target || !target.closest) return;
      
      const contentElement = target.closest('.copyable-content');
      if (!contentElement) return;
      
      const container = contentElement.closest('.copyable');
      const valueElement = container?.querySelector('.copyable-value');
      if (!valueElement) return;
      
      const textToCopy = valueElement.getAttribute('data-copy') || (valueElement.textContent || '').trim();
      if (!textToCopy) return;
      
      copyToClipboard(textToCopy, contentElement);
    });
  }
  
  // Confirmation dialogs for deletion
  function confirmDelete(feedId) {
    if (confirm('Are you sure you want to delete this feed? This action cannot be undone.')) {
      const form = document.createElement('form');
      form.method = 'POST';
      form.action = '/admin/feeds/' + feedId + '/delete';
      document.body.appendChild(form);
      form.submit();
    }
  }
  
  function confirmDeleteEmail(emailKey, feedId) {
    if (confirm('Are you sure you want to delete this email? This action cannot be undone.')) {
      const form = document.createElement('form');
      form.method = 'POST';
      form.action = '/admin/emails/' + emailKey + '/delete?feedId=' + feedId;
      document.body.appendChild(form);
      form.submit();
    }
  }
`; 
