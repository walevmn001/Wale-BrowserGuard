/**
 * Cosmetic MutationObserver — T022 (algorithm.md §D).
 *
 * Late-injected ads are handled on two levels: the injected stylesheet already
 * hides anything matching a selector, and this page-side observer additionally
 * pins `display: none !important` on newly added matches so a page's own inline
 * `!important` cannot win. It only ever looks at *added* nodes (never rescans
 * the whole page), batches work on a throttle, and goes dormant after a quiet
 * period so an idle page costs ~no CPU (AC-4.3). A large batch of additions
 * wakes it back up.
 *
 * `installCosmeticObserver` runs in the page via `chrome.scripting.executeScript`,
 * which serialises the function with `Function.prototype.toString()`. It must
 * therefore be **self-contained**: only its parameters and page globals — no
 * imports and no closure over module scope.
 */

/** Tuning for the observer; passed to the page function as an argument. */
export interface CosmeticObserverOptions {
  /** No mutations for this long → go dormant (stop scanning). */
  readonly idleMs: number;
  /** Minimum gap between scan passes. */
  readonly throttleMs: number;
  /** Added-node count in one batch that wakes a dormant observer. */
  readonly bigBatch: number;
}

export const OBSERVER_OPTIONS: CosmeticObserverOptions = {
  idleMs: 30_000,
  throttleMs: 200,
  bigBatch: 20,
};

export function installCosmeticObserver(
  selectors: readonly string[],
  options: CosmeticObserverOptions,
): void {
  // NOTE: every value used below must be inline or a parameter — the function is
  // serialised with `Function.prototype.toString()`, so module-scope names would
  // be undefined in the page. `tests/unit/cosmetic-observer.test.ts` guards this.
  const scope = window as unknown as Record<string, unknown>;
  if (scope['__adblockCosmeticObserver'] === true) {
    return;
  }
  scope['__adblockCosmeticObserver'] = true;

  let active = true;
  let flushTimer: ReturnType<typeof setTimeout> | undefined;
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  let pending: Element[] = [];

  function hide(element: Element): void {
    const styled = element as HTMLElement;
    if (
      styled.style.getPropertyValue('display') === 'none' &&
      styled.style.getPropertyPriority('display') === 'important'
    ) {
      return;
    }
    styled.style.setProperty('display', 'none', 'important');
  }

  function scan(root: Element): void {
    for (let index = 0; index < selectors.length; index += 1) {
      const selector = selectors[index] as string;
      try {
        if (root.matches(selector)) {
          hide(root);
        }
        const matches = root.querySelectorAll(selector);
        for (let i = 0; i < matches.length; i += 1) {
          const match = matches[i];
          if (match !== undefined) {
            hide(match);
          }
        }
      } catch {
        // A selector the browser rejects is skipped, never thrown (algorithm §D).
      }
    }
  }

  function flush(): void {
    flushTimer = undefined;
    const batch = pending;
    pending = [];
    for (const element of batch) {
      scan(element);
    }
  }

  function schedule(): void {
    if (flushTimer === undefined) {
      flushTimer = setTimeout(flush, options.throttleMs);
    }
  }

  function goDormant(): void {
    active = false;
    pending = [];
  }

  function armIdle(): void {
    if (idleTimer !== undefined) {
      clearTimeout(idleTimer);
    }
    idleTimer = setTimeout(goDormant, options.idleMs);
  }

  const observer = new MutationObserver((mutations) => {
    const batch: Element[] = [];
    for (const mutation of mutations) {
      const added = mutation.addedNodes;
      for (let i = 0; i < added.length; i += 1) {
        const node = added[i];
        if (node !== undefined && node.nodeType === 1) {
          batch.push(node as Element);
        }
      }
    }
    if (batch.length === 0) {
      return;
    }
    if (!active) {
      if (batch.length < options.bigBatch) {
        return;
      }
      active = true;
    }
    for (const element of batch) {
      pending.push(element);
    }
    schedule();
    armIdle();
  });

  const root = document.documentElement;
  if (root !== null) {
    scan(root);
    observer.observe(root, { childList: true, subtree: true });
  }
}
