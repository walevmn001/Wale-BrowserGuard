/**
 * Malware / phishing warning page (T030, T031; algorithm.md §F).
 *
 * This is the redirect target of the `malware` ruleset's main-frame rule: when
 * a navigation to a listed domain is blocked, the browser lands here instead of
 * on the malicious site. The page explains why, offers a way back, and — with
 * T031 — a "continue anyway" button that grants a 10-minute pass for the host
 * before sending the user on to the original URL.
 *
 * The blocked URL is carried to the page in the fragment: the malware rule's
 * `redirect` uses `regexSubstitution` (which needs the fixed extension id from
 * the manifest `key`) to append the original URL, so the page can name the host
 * it blocked. If the fragment is missing or malformed the page still renders
 * with a generic message and no continue button.
 *
 * All strings come from `shared/i18n.ts`, chosen from the browser UI language.
 */

import { createTempException, type TempException } from '../background/temp-exception';
import { isMessageKey, resolveLocale, t } from '../shared/i18n';
import { logger } from '../shared/logger';

/** How long the "continue anyway" button waits for the worker to install the pass. */
const EXCEPTION_WAIT_MS = 2000;
/** Poll cadence while waiting for the pass to appear. */
const EXCEPTION_POLL_MS = 25;

/** The original URL the malware rule carried in the fragment, if valid. */
function readTargetUrl(href: string): URL | undefined {
  const fragment = new URL(href).hash.slice(1);
  if (fragment === '') {
    return undefined;
  }
  try {
    return new URL(fragment);
  } catch {
    return undefined;
  }
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

  const target = readTargetUrl(window.location.href);
  const targetText = document.getElementById('warning-target');
  if (targetText !== null && target !== undefined) {
    // `hostname` (not `host`): a DNR `requestDomains` condition is a bare
    // hostname and rejects a trailing port, so the pass must key off it too.
    targetText.textContent = t('warningBlockedDomain', locale, { domain: target.hostname });
  }

  document.getElementById('warning-back')?.addEventListener('click', () => {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      window.location.replace('about:blank');
    }
  });

  // Only offered when the original URL is known: a pass without a destination
  // would leave the user nowhere to go.
  const continueButton = document.getElementById('warning-continue');
  if (continueButton !== null && target !== undefined) {
    continueButton.addEventListener('click', () => {
      void continueTo(target);
    });
  }
}

/**
 * Publishes a 10-minute pass for the host, waits for the worker to install the
 * matching rule, then navigates to the original URL.
 */
async function continueTo(target: URL): Promise<void> {
  const temp = createTempException();
  try {
    await temp.allow(target.hostname);
    await waitForPass(temp, target.hostname);
  } catch (error) {
    logger.error('failed to grant a temporary exception', error);
  }
  window.location.replace(target.href);
}

/**
 * Waits (bounded) until the "continue anyway" pass is actually in force.
 *
 * `allow` only publishes the host to `chrome.storage`; the worker installs the
 * `allowAllRequests` rule off its `storage.onChanged` listener a moment later.
 * Navigating before that would be rejected by the malware rule and bounce the
 * user straight back here, so the button holds until the rule is present.
 */
async function waitForPass(temp: TempException, host: string): Promise<void> {
  const deadline = Date.now() + EXCEPTION_WAIT_MS;
  while (Date.now() < deadline) {
    if (await temp.isActive(host)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, EXCEPTION_POLL_MS));
  }
  logger.warn(`temporary exception for ${host} was not installed in time`);
}

applyTranslations();
