import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { handleBridgeMessage, injectBanner } from '../../src/background/content-bridge';
import { MSG_HIDE_ELEMENT, MSG_START_PICKER, MSG_TRUST_SITE } from '../../src/shared/messages';

/**
 * The bridge constructs its stores from the global `chrome` object, so the whole
 * `chrome` surface it touches (storage, scripting, i18n) is stubbed here. The
 * injected functions themselves are covered by the e2e suite; this suite checks
 * only the worker-side validation and wiring.
 */

const globals = globalThis as unknown as Record<string, unknown>;

interface InsertCssCall {
  readonly target: { readonly tabId: number };
  readonly css: string;
}

interface ExecuteScriptCall {
  readonly target: { readonly tabId: number };
  readonly func?: unknown;
  readonly args?: readonly unknown[];
}

interface Stub {
  readonly store: Map<string, unknown>;
  readonly insertCssCalls: InsertCssCall[];
  readonly executeScriptCalls: ExecuteScriptCall[];
}

function installChrome(uiLanguage = 'vi'): Stub {
  const store = new Map<string, unknown>();
  const insertCssCalls: InsertCssCall[] = [];
  const executeScriptCalls: ExecuteScriptCall[] = [];
  const area = {
    get: async (key: string): Promise<Record<string, unknown>> =>
      store.has(key) ? { [key]: store.get(key) } : {},
    set: async (items: Record<string, unknown>): Promise<void> => {
      for (const [key, value] of Object.entries(items)) {
        store.set(key, value);
      }
    },
    remove: async (key: string): Promise<void> => {
      store.delete(key);
    },
  };
  globals['chrome'] = {
    storage: { local: area },
    scripting: {
      insertCSS: async (options: InsertCssCall): Promise<void> => {
        insertCssCalls.push(options);
      },
      executeScript: async (options: ExecuteScriptCall): Promise<unknown[]> => {
        executeScriptCalls.push(options);
        return [];
      },
    },
    i18n: { getUILanguage: () => uiLanguage },
  };
  return { store, insertCssCalls, executeScriptCalls };
}

function sender(url: string | undefined, tabId = 7): chrome.runtime.MessageSender {
  return { tab: { id: tabId, url } } as unknown as chrome.runtime.MessageSender;
}

beforeEach(() => {
  installChrome();
});

afterEach(() => {
  delete globals['chrome'];
});

describe('handleBridgeMessage — hide element', () => {
  it('persists a valid selector and injects the hide rule at once', async () => {
    const stub = installChrome();

    const reply = await handleBridgeMessage(
      { type: MSG_HIDE_ELEMENT, selector: '#ad-slot' },
      sender('https://news.example.com/article'),
    );

    expect(reply).toEqual({ ok: true });
    expect(stub.store.get('hiddenSelectors')).toEqual({ 'news.example.com': ['#ad-slot'] });
    expect(stub.insertCssCalls).toEqual([
      { target: { tabId: 7 }, css: '#ad-slot{display:none !important}' },
    ]);
  });

  it('rejects a too-broad selector without persisting anything', async () => {
    const stub = installChrome();

    const reply = await handleBridgeMessage(
      { type: MSG_HIDE_ELEMENT, selector: 'body' },
      sender('https://news.example.com'),
    );

    expect(reply).toEqual({ ok: false, reason: 'tooBroad' });
    expect(stub.store.get('hiddenSelectors')).toBeUndefined();
    expect(stub.insertCssCalls).toEqual([]);
  });

  it('rejects a selector that could escape the rule context', async () => {
    const reply = await handleBridgeMessage(
      { type: MSG_HIDE_ELEMENT, selector: 'div{color:red}' },
      sender('https://news.example.com'),
    );

    expect(reply).toEqual({ ok: false, reason: 'invalid' });
  });

  it('rejects a sender that has no page host', async () => {
    const reply = await handleBridgeMessage(
      { type: MSG_HIDE_ELEMENT, selector: '#x' },
      sender('chrome://extensions'),
    );

    expect(reply).toEqual({ ok: false, reason: 'noHost' });
  });
});

describe('handleBridgeMessage — trust site', () => {
  it('records the sender host', async () => {
    const stub = installChrome();

    const reply = await handleBridgeMessage({ type: MSG_TRUST_SITE }, sender('https://shop.example.com'));

    expect(reply).toEqual({ ok: true });
    expect(stub.store.get('bannerTrusted')).toEqual(['shop.example.com']);
  });

  it('rejects a sender that has no page host', async () => {
    const reply = await handleBridgeMessage({ type: MSG_TRUST_SITE }, sender(undefined));

    expect(reply).toEqual({ ok: false, reason: 'noHost' });
  });
});

describe('handleBridgeMessage — start picker', () => {
  it('injects the picker into the requested tab with localised labels', async () => {
    const stub = installChrome('en');

    const reply = await handleBridgeMessage({ type: MSG_START_PICKER, tabId: 42 }, {});

    expect(reply).toEqual({ ok: true });
    expect(stub.executeScriptCalls).toHaveLength(1);
    const call = stub.executeScriptCalls[0];
    expect(call?.target).toEqual({ tabId: 42 });
    const options = call?.args?.[0] as {
      labels: { confirm: string; reasons: Record<string, string> };
      styles: string;
      maxLength: number;
    };
    expect(options.labels.confirm).toBe('Hide element');
    expect(options.labels.reasons['tooBroad']).toContain('too broad');
    expect(options.styles.length).toBeGreaterThan(0);
    expect(options.maxLength).toBeGreaterThan(0);
  });
});

describe('injectBanner', () => {
  it('does nothing for a plain https page', async () => {
    const stub = installChrome();

    await injectBanner(7, 'https://example.com/');

    expect(stub.executeScriptCalls).toEqual([]);
  });

  it('does nothing for a non-web page', async () => {
    const stub = installChrome();

    await injectBanner(7, 'chrome://newtab');

    expect(stub.executeScriptCalls).toEqual([]);
  });

  it('shows the insecure banner for a plain-http page', async () => {
    const stub = installChrome();

    await injectBanner(7, 'http://shop.example.com/pay');

    expect(stub.executeScriptCalls).toHaveLength(1);
    const args = stub.executeScriptCalls[0]?.args?.[0] as {
      reason: string;
      requirePasswordField: boolean;
    };
    expect(args.reason).toBe('insecure');
    expect(args.requirePasswordField).toBe(true);
  });

  it('shows the spoofed banner on https for a domain that impersonates a brand', async () => {
    const stub = installChrome();

    await injectBanner(7, 'https://paypal.secure-login.example.com/');

    expect(stub.executeScriptCalls).toHaveLength(1);
    const args = stub.executeScriptCalls[0]?.args?.[0] as { reason: string };
    expect(args.reason).toBe('spoofed');
  });

  it('skips a host the user already trusted', async () => {
    const stub = installChrome();
    stub.store.set('bannerTrusted', ['shop.example.com']);

    await injectBanner(7, 'http://shop.example.com/pay');

    expect(stub.executeScriptCalls).toEqual([]);
  });
});
