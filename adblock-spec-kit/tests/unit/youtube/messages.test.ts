import { describe, expect, it } from 'vitest';

import {
  DISPLAY_LABELS,
  FORBIDDEN_MAIN_PHRASES,
  RELOAD_NOTE,
  WAITING_SAVED_NOTE,
  displayMessage,
  hasForbiddenMainPhrase,
} from '../../../src/youtube/state/messages';
import type { DisplayState } from '../../../src/youtube/state/toggle-state';

const STATES: readonly DisplayState[] = [
  'ENABLED',
  'DISABLED',
  'WAITING_FOR_REGISTRATION',
  'WAITING_FOR_ADAPTER',
  'INITIALIZING',
  'RECONCILING',
  'ERROR',
  'UNKNOWN',
];

describe('DISPLAY_LABELS', () => {
  it('has a non-empty label for every display state', () => {
    for (const state of STATES) {
      expect(typeof DISPLAY_LABELS[state]).toBe('string');
      expect(DISPLAY_LABELS[state].length).toBeGreaterThan(0);
    }
  });
});

describe('displayMessage', () => {
  it('returns a non-empty message for every display state', () => {
    for (const state of STATES) {
      expect(displayMessage(state).length).toBeGreaterThan(0);
    }
  });

  it('includes the supplied reason for ERROR and a fallback when omitted', () => {
    expect(displayMessage('ERROR', 'schema mismatch')).toContain('schema mismatch');
    expect(displayMessage('ERROR')).toContain('không xác định');
  });

  it('falls back to the UNKNOWN message for an unexpected state', () => {
    expect(displayMessage('nope' as DisplayState)).toBe(displayMessage('UNKNOWN'));
  });
});

describe('forbidden phrases for MAIN layers (contract §4)', () => {
  it('flags each forbidden phrase case-insensitively', () => {
    for (const phrase of FORBIDDEN_MAIN_PHRASES) {
      expect(hasForbiddenMainPhrase(phrase)).toBe(true);
      expect(hasForbiddenMainPhrase(phrase.toUpperCase())).toBe(true);
      expect(hasForbiddenMainPhrase(`... ${phrase} ...`)).toBe(true);
    }
    expect(hasForbiddenMainPhrase('Hook đang chạy theo mặc định: bật.')).toBe(false);
  });

  it('the WAITING_FOR_ADAPTER message never claims the choice was applied', () => {
    const message = displayMessage('WAITING_FOR_ADAPTER');
    expect(hasForbiddenMainPhrase(message)).toBe(false);
  });

  it('the saved-note for a MAIN layer never claims the choice was applied', () => {
    expect(hasForbiddenMainPhrase(WAITING_SAVED_NOTE)).toBe(false);
  });

  it('the reload note is phrased as pending, not applied', () => {
    expect(RELOAD_NOTE.length).toBeGreaterThan(0);
    expect(hasForbiddenMainPhrase(RELOAD_NOTE)).toBe(false);
  });
});
