/**
 * Malware / phishing warning page (T030, algorithm.md §F).
 *
 * This is the redirect target of the `malware` ruleset's main-frame rule: when
 * a navigation to a listed domain is blocked, the browser lands here instead of
 * on the malicious site. The page explains why and offers a way back.
 *
 * The blocked host is shown when the redirect could carry it; DNR's
 * `extensionPath` redirect cannot embed the original URL, so the host is read
 * from the URL fragment when present and the page falls back to a generic
 * message otherwise. TODO(verify): passing the exact target from a *static*
 * ruleset needs a fixed extension id, so it is left for a follow-up.
 *
 * The "continue anyway" temporary exception is added in T031. All strings come
 * from `shared/i18n.ts`, chosen from the browser UI language.
 */

import { isMessageKey, resolveLocale, t } from '../shared/i18n';

/** A bare host (optionally with a port) read from the URL fragment. */
const HOST_PATTERN = /^[a-z0-9.-]+(:\d+)?$/i;

function readTargetHost(href: string): string | undefined {
  const hash = new URL(href).hash.slice(1);
  return HOST_PATTERN.test(hash) ? hash : undefined;
}

function applyTranslations(): void {
  const locale = resolveLocale(chrome.i18n.getUILanguage());
  document.documentElement.lang = locale;
  for (const node of document.querySelectorAll<HTMLElement>('[data-i18n]')) {
    const key = node.dataset['i18n'];
    if (key !== undefined && isMessageKey(key)) {
      node.textContent = t(key, locale);
    }
  }

  const host = readTargetHost(window.location.href);
  const target = document.getElementById('warning-target');
  if (target !== null && host !== undefined) {
    target.textContent = t('warningBlockedDomain', locale, { domain: host });
  }

  document.getElementById('warning-back')?.addEventListener('click', () => {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      window.location.replace('about:blank');
    }
  });
}

applyTranslations();
