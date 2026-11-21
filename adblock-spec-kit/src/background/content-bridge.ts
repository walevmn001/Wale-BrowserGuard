/**
 * Bridge between the injected page components and the worker (Phase 7, §9.4).
 *
 * The element picker and the security banner run inside a page, so everything
 * they send is untrusted input: `isBridgeMessage` checks the shape, the
 * selector is re-validated with `validateSelector`, and the host is derived
 * from the sender tab rather than trusted from the payload. Nothing here keeps
 * module state — the worker can be stopped at any time (Constitution 14).
 *
 * It also owns injecting the banner: `injectBanner` decides, from the local URL
 * scanner, whether a top-level page deserves one, and skips hosts the user has
 * already trusted.
 */

import { pageHost } from '../content/cosmetic';
import { installElementPicker } from '../content/element-picker';
import { PICKER_STYLES, type PickerLabels, type PickerOptions } from '../content/picker-config';
import { installWarningBanner, type BannerLabels } from '../content/warning-banner';
import { createBannerTrust } from './banner-trust';
import { workerLocale } from './locale';
import { createSitePreferences } from './site-settings';
import { bannerReason } from './url-scan';
import { t, type Locale } from '../shared/i18n';
import { logger } from '../shared/logger';
import {
  isBridgeMessage,
  MSG_HIDE_ELEMENT,
  MSG_START_PICKER,
  MSG_TRUST_SITE,
  type BannerReason,
  type BridgeMessage,
  type BridgeReply,
  type HideElementMessage,
  type StartPickerMessage,
} from '../shared/messages';
import { MAX_SELECTOR_LENGTH, validateSelector } from '../shared/selector';

function pickerLabels(locale: Locale): PickerLabels {
  return {
    title: t('pickTitle', locale),
    hint: t('pickHint', locale),
    confirm: t('pickConfirm', locale),
    undo: t('pickUndo', locale),
    cancel: t('pickCancel', locale),
    hidden: t('pickHidden', locale),
    reasons: {
      empty: t('pickReasonEmpty', locale),
      tooLong: t('pickReasonTooLong', locale),
      invalid: t('pickReasonInvalid', locale),
      tooBroad: t('pickReasonTooBroad', locale),
      noHost: t('pickReasonNoHost', locale),
      failed: t('pickReasonFailed', locale),
    },
  };
}

function bannerLabels(reason: BannerReason, locale: Locale): BannerLabels {
  const spoofed = reason === 'spoofed';
  return {
    heading: t(spoofed ? 'bannerSpoofedHeading' : 'bannerInsecureHeading', locale),
    body: t(spoofed ? 'bannerSpoofedBody' : 'bannerInsecureBody', locale),
    trust: t('bannerTrust', locale),
    close: t('bannerClose', locale),
  };
}

/** Phase 9 §4: persists a picker selector and hides the element at once. */
async function hideElement(
  message: HideElementMessage,
  sender: chrome.runtime.MessageSender,
): Promise<BridgeReply> {
  const host = pageHost(sender.tab?.url);
  if (host === undefined) {
    return { ok: false, reason: 'noHost' };
  }
  const check = validateSelector(message.selector);
  if (!check.ok) {
    return { ok: false, reason: check.reason };
  }
  await createSitePreferences().addHidden(host, check.selector);
  const tabId = sender.tab?.id;
  if (tabId !== undefined) {
    try {
      await chrome.scripting.insertCSS({
        target: { tabId },
        css: `${check.selector}{display:none !important}`,
      });
    } catch (error) {
      logger.error('failed to inject the picked selector', error);
    }
  }
  return { ok: true };
}

/** Phase 7: the user told the banner to stay away from this host. */
async function trustSite(sender: chrome.runtime.MessageSender): Promise<BridgeReply> {
  const host = pageHost(sender.tab?.url);
  if (host === undefined) {
    return { ok: false, reason: 'noHost' };
  }
  await createBannerTrust().trust(host);
  return { ok: true };
}

/** Phase 9 §4: the popup asks the worker to open the picker in a tab. */
async function startPicker(message: StartPickerMessage): Promise<BridgeReply> {
  const locale = await workerLocale();
  const options: PickerOptions = {
    labels: pickerLabels(locale),
    maxLength: MAX_SELECTOR_LENGTH,
    styles: PICKER_STYLES,
  };
  await chrome.scripting.executeScript({
    target: { tabId: message.tabId },
    func: installElementPicker,
    args: [options],
  });
  return { ok: true };
}

/** Routes a validated bridge message to its handler. */
export async function handleBridgeMessage(
  message: BridgeMessage,
  sender: chrome.runtime.MessageSender,
): Promise<BridgeReply> {
  switch (message.type) {
    case MSG_HIDE_ELEMENT:
      return hideElement(message, sender);
    case MSG_TRUST_SITE:
      return trustSite(sender);
    case MSG_START_PICKER:
      return startPicker(message);
  }
}

/** Registers the page-message listener; returns `true` to answer asynchronously. */
export function registerBridge(): void {
  chrome.runtime.onMessage.addListener(
    (
      message: unknown,
      sender: chrome.runtime.MessageSender,
      sendResponse: (reply: BridgeReply) => void,
    ) => {
      if (!isBridgeMessage(message)) {
        return false;
      }
      void handleBridgeMessage(message, sender)
        .then(sendResponse)
        .catch(() => sendResponse({ ok: false, reason: 'failed' }));
      return true;
    },
  );
}

/** Shows the in-page security banner on a risky page (Phase 7), unless trusted. */
export async function injectBanner(tabId: number, url: string | undefined): Promise<void> {
  const reason = bannerReason(url);
  if (reason === undefined) {
    return;
  }
  const host = pageHost(url);
  if (host === undefined || (await createBannerTrust().has(host))) {
    return;
  }
  const locale = await workerLocale();
  await chrome.scripting.executeScript({
    target: { tabId },
    func: installWarningBanner,
    args: [
      {
        reason,
        labels: bannerLabels(reason, locale),
        requirePasswordField: reason === 'insecure',
      },
    ],
  });
}
