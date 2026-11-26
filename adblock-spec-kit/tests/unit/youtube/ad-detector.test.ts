import { describe, expect, it } from 'vitest';

import {
  AD_SIGNAL_WEIGHTS,
  classifyAd,
  classifyPlayback,
  type AdSignals,
  type MediaState,
} from '../../../src/youtube/core/ad-detector';

/** The all-false "empty" signal set unless overridden. */
function signals(overrides: Partial<AdSignals> = {}): AdSignals {
  return {
    playerHasAdClass: false,
    adBreakPlaying: false,
    playerResponseHasAdFields: false,
    adDurationMismatch: false,
    skipButtonVisible: false,
    ...overrides,
  };
}

/** A fully playable media element unless overridden. */
function media(overrides: Partial<MediaState> = {}): MediaState {
  return {
    paused: false,
    ended: false,
    readyState: 4,
    networkState: 1,
    error: false,
    ...overrides,
  };
}

describe('classifyAd — weighted vote', () => {
  it('classifies the empty signal set as NOT_AD', () => {
    expect(classifyAd(signals())).toBe('NOT_AD');
  });

  it('classifies a single weight-1 signal as UNCERTAIN at the default threshold', () => {
    expect(classifyAd(signals({ playerResponseHasAdFields: true }))).toBe('UNCERTAIN');
    expect(classifyAd(signals({ adDurationMismatch: true }))).toBe('UNCERTAIN');
  });

  it('classifies a single weight-2 signal as AD', () => {
    expect(classifyAd(signals({ playerHasAdClass: true }))).toBe('AD');
    expect(classifyAd(signals({ adBreakPlaying: true }))).toBe('AD');
    expect(classifyAd(signals({ skipButtonVisible: true }))).toBe('AD');
  });

  it('reaches the threshold from two weak signals', () => {
    expect(classifyAd(signals({ playerResponseHasAdFields: true, adDurationMismatch: true }))).toBe(
      'AD',
    );
  });

  it('honours a custom threshold', () => {
    expect(classifyAd(signals({ playerHasAdClass: true }), 5)).toBe('NOT_AD');
    expect(classifyAd(signals({ playerResponseHasAdFields: true }), 1)).toBe('AD');
  });

  it('exposes the documented weights', () => {
    expect(AD_SIGNAL_WEIGHTS).toEqual({
      playerHasAdClass: 2,
      adBreakPlaying: 2,
      playerResponseHasAdFields: 1,
      adDurationMismatch: 1,
      skipButtonVisible: 2,
    });
  });
});

describe('classifyPlayback', () => {
  it('reports MEDIA_ERROR first', () => {
    expect(classifyPlayback(media({ error: true, ended: true, paused: true }))).toBe('MEDIA_ERROR');
  });

  it('reports ENDED when the media has ended', () => {
    expect(classifyPlayback(media({ ended: true, paused: true }))).toBe('ENDED');
  });

  it('reports PAUSED', () => {
    expect(classifyPlayback(media({ paused: true }))).toBe('PAUSED');
  });

  it('reports LOADING while metadata is still being fetched', () => {
    expect(classifyPlayback(media({ networkState: 2, readyState: 1 }))).toBe('LOADING');
  });

  it('reports BUFFERING when there is not enough data', () => {
    expect(classifyPlayback(media({ readyState: 3 }))).toBe('BUFFERING');
  });

  it('reports PLAYING for a fully playable element', () => {
    expect(classifyPlayback(media())).toBe('PLAYING');
  });
});
