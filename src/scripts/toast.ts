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

      let spinner = null;
      if (loading) {
        spinner = document.createElement('span');
        spinner.className = 'spinner';
        spinner.setAttribute('aria-hidden', 'true');
        body.appendChild(spinner);
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

      return { toast, text, close, spinner, body };
    }

    function showToast(message, opts) {
      const options = opts || {};
      const duration = Number.isFinite(options.duration) ? Number(options.duration) : 4500;

      const stack = ensureToastStack();
      const { toast, text, close, body } = createToastEl(message, options);

      let dismissed = false;
      let timeoutId = 0;
      let currentDuration = duration;

      function dismiss() {
        if (dismissed) return;
        dismissed = true;
        if (timeoutId) window.clearTimeout(timeoutId);
        toast.classList.remove('visible');
        // Match CSS transition duration to avoid abrupt removal
        setTimeout(() => {
          toast.remove();
        }, 220);
      }

      function scheduleDismiss(nextDuration) {
        if (timeoutId) window.clearTimeout(timeoutId);
        if (nextDuration !== 0) {
          timeoutId = window.setTimeout(dismiss, nextDuration);
        }
      }

      function update(nextMessage, nextOpts) {
        if (dismissed) return;
        text.textContent = String(nextMessage || '');
        if (nextOpts && typeof nextOpts.type === 'string') {
          toast.className = 'toast toast-' + nextOpts.type;
        }
        if (nextOpts && typeof nextOpts.loading === 'boolean') {
          const existing = body.querySelector('.spinner');
          if (nextOpts.loading && !existing) {
            const spin = document.createElement('span');
            spin.className = 'spinner';
            spin.setAttribute('aria-hidden', 'true');
            body.insertBefore(spin, body.firstChild);
          } else if (!nextOpts.loading && existing) {
            existing.remove();
          }
        }
        if (nextOpts && Object.prototype.hasOwnProperty.call(nextOpts, 'duration')) {
          currentDuration = Number.isFinite(nextOpts.duration) ? Number(nextOpts.duration) : currentDuration;
          scheduleDismiss(currentDuration);
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
      scheduleDismiss(currentDuration);

      return { dismiss, update };
    }

    // Expose globally
    window.showToast = showToast;
  })();
`;
