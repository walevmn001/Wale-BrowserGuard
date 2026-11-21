import { describe, expect, it } from 'vitest';

import { installElementPicker } from '../../src/content/element-picker';
import { installWarningBanner } from '../../src/content/warning-banner';
import {
  isBridgeMessage,
  MSG_HIDE_ELEMENT,
  MSG_START_PICKER,
  MSG_TRUST_SITE,
} from '../../src/shared/messages';

/**
 * The injected page components are serialised with
 * `Function.prototype.toString()`, so they cannot import the message constants
 * — they repeat the literals. These tests read the actual serialised source and
 * fail if a literal ever drifts from the shared constant.
 */
describe('bridge message literals stay in sync with the injected components', () => {
  it('the picker sends the shared hide-element type', () => {
    expect(installElementPicker.toString()).toContain(MSG_HIDE_ELEMENT);
  });

  it('the banner sends the shared trust-site type', () => {
    expect(installWarningBanner.toString()).toContain(MSG_TRUST_SITE);
  });
});

describe('isBridgeMessage', () => {
  it('accepts a hide-element message with a string selector', () => {
    expect(isBridgeMessage({ type: MSG_HIDE_ELEMENT, selector: '#ad' })).toBe(true);
  });

  it('rejects a hide-element message without a selector', () => {
    expect(isBridgeMessage({ type: MSG_HIDE_ELEMENT })).toBe(false);
    expect(isBridgeMessage({ type: MSG_HIDE_ELEMENT, selector: 5 })).toBe(false);
  });

  it('accepts a trust-site message', () => {
    expect(isBridgeMessage({ type: MSG_TRUST_SITE })).toBe(true);
  });

  it('accepts a start-picker message with a numeric tab id', () => {
    expect(isBridgeMessage({ type: MSG_START_PICKER, tabId: 3 })).toBe(true);
    expect(isBridgeMessage({ type: MSG_START_PICKER, tabId: 'x' })).toBe(false);
  });

  it('rejects unknown types, arrays and non-objects', () => {
    expect(isBridgeMessage({ type: 'wg:nope' })).toBe(false);
    expect(isBridgeMessage([])).toBe(false);
    expect(isBridgeMessage(null)).toBe(false);
    expect(isBridgeMessage('wg:hide-element')).toBe(false);
  });
});
