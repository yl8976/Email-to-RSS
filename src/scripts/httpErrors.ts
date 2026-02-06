// Helpers for turning failed fetch() responses into actionable, user-friendly
// error messages (especially for Cloudflare quota / rate-limit pages).

export const httpErrorScripts = `
  (function () {
    function extractRayIdFromText(text) {
      const match = String(text || '').match(/ray id\\s*[:#]?\\s*([a-z0-9-]+)/i);
      return match ? match[1] : '';
    }

    function compact(text, maxLen) {
      const str = String(text || '');
      if (str.length <= maxLen) return str;
      return str.slice(0, Math.max(0, maxLen - 3)) + '...';
    }

    function classifyCloudflareError(status, text) {
      const lower = String(text || '').toLowerCase();
      const looksLikeCloudflare =
        lower.includes('cloudflare') ||
        lower.includes('ray id') ||
        lower.includes('cf-ray');

      if (!looksLikeCloudflare) return null;

      const isRateLimited =
        status === 429 ||
        lower.includes('error 1015') ||
        lower.includes('rate limited') ||
        lower.includes('you are being rate limited');

      const isQuota =
        lower.includes('worker') &&
        (lower.includes('exceeded') ||
          lower.includes('quota') ||
          lower.includes('limit') ||
          lower.includes('requests'));

      const isBlocked =
        status === 403 &&
        (lower.includes('access denied') || lower.includes('forbidden'));

      if (isRateLimited) return { kind: 'rate_limit', label: 'Cloudflare rate limit' };
      if (isQuota) return { kind: 'quota', label: 'Cloudflare plan limit' };
      if (isBlocked) return { kind: 'blocked', label: 'Cloudflare security block' };

      return { kind: 'cloudflare', label: 'Cloudflare error page' };
    }

    function buildHelpfulErrorMessage(prefix, status, headers, text, json) {
      const safePrefix = prefix ? String(prefix) : 'Request failed';
      const cfRayHeader = headers && headers.get ? (headers.get('cf-ray') || '') : '';
      const retryAfter = headers && headers.get ? (headers.get('retry-after') || '') : '';

      // Prefer our own API's structured error first.
      let apiError = '';
      if (json && typeof json === 'object') {
        if (typeof json.error === 'string') apiError = json.error;
        else if (json.error && typeof json.error.message === 'string') apiError = json.error.message;
      }

      if (apiError) {
        const parts = [safePrefix + ': ' + apiError, '(HTTP ' + status + ')'];
        if (cfRayHeader) parts.push('cf-ray ' + cfRayHeader);
        return parts.join(' ');
      }

      const cf = classifyCloudflareError(status, text);
      if (cf) {
        const ray = cfRayHeader || extractRayIdFromText(text);
        const base = safePrefix + ': ' + cf.label + ' (HTTP ' + status + ').';
        let hint = '';
        if (cf.kind === 'rate_limit') {
          hint = 'Try again in a bit, or delete smaller batches.';
        } else if (cf.kind === 'quota') {
          hint = 'It looks like you hit a plan quota/limit. Try again later or check Cloudflare usage.';
        } else if (cf.kind === 'blocked') {
          hint = 'Cloudflare blocked the request. Check WAF/rules and logs.';
        } else {
          hint = 'Please try again; if it persists, check Cloudflare logs/usage.';
        }

        const extras = [];
        if (retryAfter) extras.push('retry-after ' + retryAfter + 's');
        if (ray) extras.push('cf-ray ' + ray);
        const extra = extras.length ? ' (' + extras.join(', ') + ')' : '';
        return base + ' ' + hint + extra;
      }

      const snippet = compact(String(text || '').replace(/\\s+/g, ' ').trim(), 140);
      const fallbackParts = [safePrefix + ' (HTTP ' + status + ')'];
      if (snippet) fallbackParts.push('- ' + snippet);
      if (cfRayHeader) fallbackParts.push('(cf-ray ' + cfRayHeader + ')');
      return fallbackParts.join(' ');
    }

    async function parseJsonResponseOrThrow(res, opts) {
      const options = opts || {};
      const prefix = options.prefix ? String(options.prefix) : 'Request failed';

      const contentType = String(res.headers.get('content-type') || '').toLowerCase();
      let text = '';
      try {
        text = await res.text();
      } catch (e) {
        text = '';
      }

      const trimmed = String(text || '').trim();
      let json = null;
      if (
        trimmed &&
        (contentType.includes('application/json') ||
          trimmed.startsWith('{') ||
          trimmed.startsWith('['))
      ) {
        try {
          json = JSON.parse(trimmed);
        } catch (e) {
          json = null;
        }
      }

      if (!res.ok) {
        throw new Error(buildHelpfulErrorMessage(prefix, res.status, res.headers, text, json));
      }

      if (json !== null) return json;
      if (options && options.allowText) return { text: text };
      throw new Error(prefix + ': Unexpected response format (HTTP ' + res.status + ').');
    }

    // Expose globally for inline route scripts.
    window.parseJsonResponseOrThrow = parseJsonResponseOrThrow;
  })();
`;
