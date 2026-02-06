// Toast notifications (lightweight, no deps)
// Designed to match the project's "liquid glass" design language.

export const toastScripts = `
  (function () {
    function ensureToastStack() {
      let stack = document.getElementById('toast-stack');
      if (stack) return stack;
      stack = document.createElement('div');
      stack.id = 'toast-stack';
      stack.className = 'toast-stack';
      document.body.appendChild(stack);
      return stack;
    }

    function createToastEl(message, opts) {
      const type = (opts && opts.type) ? String(opts.type) : 'info';
      const loading = !!(opts && opts.loading);

      const toast = document.createElement('div');
      toast.className = 'toast toast-' + type;
      toast.setAttribute('role', 'status');
      toast.setAttribute('aria-live', 'polite');

      const body = document.createElement('div');
      body.className = 'toast-body';

      if (loading) {
        const spin = document.createElement('span');
        spin.className = 'spinner';
        spin.setAttribute('aria-hidden', 'true');
        body.appendChild(spin);
      }

      const text = document.createElement('div');
      text.className = 'toast-text';
      text.textContent = String(message || '');
      body.appendChild(text);

      const close = document.createElement('button');
      close.type = 'button';
      close.className = 'toast-close';
      close.setAttribute('aria-label', 'Dismiss notification');
      close.textContent = 'x';

      toast.appendChild(body);
      toast.appendChild(close);

      return { toast, text, close };
    }

    function showToast(message, opts) {
      const options = opts || {};
      const duration = Number.isFinite(options.duration) ? Number(options.duration) : 4500;

      const stack = ensureToastStack();
      const { toast, text, close } = createToastEl(message, options);

      let dismissed = false;
      let timeoutId = 0;

      function dismiss() {
        if (dismissed) return;
        dismissed = true;
        toast.classList.remove('visible');
        // Match CSS transition duration to avoid abrupt removal
        setTimeout(() => {
          toast.remove();
        }, 220);
      }

      function update(nextMessage, nextOpts) {
        if (dismissed) return;
        text.textContent = String(nextMessage || '');
        if (nextOpts && typeof nextOpts.type === 'string') {
          toast.className = 'toast toast-' + nextOpts.type;
        }
      }

      close.addEventListener('click', dismiss);
      toast.addEventListener('click', (e) => {
        // Clicking the toast itself dismisses, but keep buttons functional
        if (e.target === close) return;
        dismiss();
      });

      stack.appendChild(toast);
      requestAnimationFrame(() => toast.classList.add('visible'));

      // duration: 0 means "persistent"
      if (duration !== 0) {
        timeoutId = window.setTimeout(dismiss, duration);
      }

      return { dismiss, update };
    }

    // Expose globally
    window.showToast = showToast;
  })();
`;
