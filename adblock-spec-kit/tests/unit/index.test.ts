import { describe, expect, it } from 'vitest';

import { PROJECT_NAME, placeholder } from '../../src/index';

describe('T001 scaffold', () => {
  it('exposes the project name', () => {
    expect(PROJECT_NAME).toBe('adblock-security-extension');
  });

  it('placeholder returns the project name', () => {
    expect(placeholder()).toBe(PROJECT_NAME);
  });
});
