import { describe, expect, it } from 'vitest';
import { isAllowed, parseAllowlist, toIsoLanguage } from './languages';

describe('languages', () => {
  it('maps whisper names to ISO codes', () => {
    expect(toIsoLanguage('norwegian')).toBe('no');
    expect(toIsoLanguage('English')).toBe('en');
    expect(toIsoLanguage('nb')).toBe('no');
    expect(toIsoLanguage('klingon')).toBe('und');
  });
  it('treats nynorsk as norwegian for the allowlist', () => {
    const allow = parseAllowlist('no,en');
    expect(allow).toEqual(['no', 'en']);
    expect(isAllowed('nn', allow)).toBe(true);
    expect(isAllowed('sv', allow)).toBe(false);
  });
});
