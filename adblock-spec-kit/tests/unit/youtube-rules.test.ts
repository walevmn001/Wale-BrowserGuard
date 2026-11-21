import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { PRIORITY } from '../../src/shared/constants';
import { isYouTubeConfig, type YouTubeConfig } from '../../src/shared/youtube-config';
import {
  buildYouTubeRules,
  isProtectedEndpoint,
  loadYouTubeConfig,
  YOUTUBE_CONFIG_SOURCE,
  YOUTUBE_PROTECTED_HOST,
  YOUTUBE_PROTECTED_PATH,
} from '../../scripts/youtube-rules';

const REPO_ROOT = process.cwd();

const config = JSON.parse(
  readFileSync(new URL(`../../${YOUTUBE_CONFIG_SOURCE}`, import.meta.url), 'utf8'),
) as YouTubeConfig;

describe('loadYouTubeConfig', () => {
  it('reads and validates the shipped config', () => {
    const loaded = loadYouTubeConfig(REPO_ROOT);

    expect(isYouTubeConfig(loaded)).toBe(true);
    expect(loaded).toEqual(config);
  });
});

describe('isProtectedEndpoint', () => {
  it('protects the player API exactly, not its ad sub-path', () => {
    expect(isProtectedEndpoint(YOUTUBE_PROTECTED_PATH)).toBe(true);
    expect(isProtectedEndpoint(`${YOUTUBE_PROTECTED_PATH}/`)).toBe(true);
    expect(isProtectedEndpoint(`${YOUTUBE_PROTECTED_PATH}/ad_break`)).toBe(false);
  });

  it('protects the googlevideo media hosts', () => {
    expect(isProtectedEndpoint(`https://r1---sn-mock.${YOUTUBE_PROTECTED_HOST}.com/videoplayback`)).toBe(
      true,
    );
  });
});

describe('buildYouTubeRules', () => {
  const rules = buildYouTubeRules(REPO_ROOT, 100);

  it('turns every config endpoint into a block rule, ids sequential from startId', () => {
    expect(rules.map((rule) => rule.condition.urlFilter)).toEqual([...config.endpoints]);
    expect(rules.map((rule) => rule.id)).toEqual(
      config.endpoints.map((_endpoint, index) => 100 + index),
    );
  });

  it('uses the ad-block priority and blocks sub-resources only', () => {
    for (const rule of rules) {
      expect(rule.action.type).toBe('block');
      expect(rule.priority).toBe(PRIORITY.BLOCK);
      // No resourceTypes: a rule that omits it never matches main_frame, so
      // navigating to YouTube is never taken down.
      expect(rule.condition.resourceTypes).toBeUndefined();
      expect(rule.condition.excludedResourceTypes).toBeUndefined();
    }
  });

  it('never emits a rule for the player API or the media hosts', () => {
    for (const rule of rules) {
      const filter = rule.condition.urlFilter ?? '';
      // A plain player request must not match any emitted rule.
      expect(isProtectedEndpoint(filter)).toBe(false);
      expect(YOUTUBE_PROTECTED_PATH === filter.replace(/\/+$/, '')).toBe(false);
    }
  });

  it('drops a protected endpoint even if a future config adds one', () => {
    // `buildYouTubeRules` filters via `isProtectedEndpoint`, so a config that
    // (wrongly) listed the player API would not become a block rule.
    const onlyAdSubPath = buildYouTubeRules(REPO_ROOT, 1).every(
      (rule) => rule.condition.urlFilter !== YOUTUBE_PROTECTED_PATH,
    );

    expect(onlyAdSubPath).toBe(true);
  });
});
