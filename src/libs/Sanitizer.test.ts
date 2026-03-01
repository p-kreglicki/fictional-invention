import { describe, expect, it } from 'vitest';
import { isEmptyText, sanitizeAndValidate, sanitizeText } from './Sanitizer';

describe('sanitizeText', () => {
  it('normalizes unicode to NFC form', () => {
    // é can be composed (U+00E9) or decomposed (e + U+0301)
    const decomposed = 'cafe\u0301'; // e + combining acute accent
    const composed = 'café'; // precomposed é

    expect(sanitizeText(decomposed)).toBe(composed);
  });

  it('removes null bytes', () => {
    expect(sanitizeText('hello\x00world')).toBe('helloworld');
    expect(sanitizeText('test\x00')).toBe('test');
  });

  it('removes control characters', () => {
    expect(sanitizeText('hello\x01\x02\x03world')).toBe('helloworld');
    expect(sanitizeText('\x1Ftest\x7F')).toBe('test');
  });

  it('preserves tabs and newlines', () => {
    expect(sanitizeText('hello\tworld')).toBe('hello\tworld');
    expect(sanitizeText('hello\nworld')).toBe('hello\nworld');
  });

  it('removes zero-width characters', () => {
    // Zero-width space, zero-width non-joiner, zero-width joiner, BOM, soft hyphen
    expect(sanitizeText('hello\u200Bworld')).toBe('helloworld');
    expect(sanitizeText('test\u200C\u200D')).toBe('test');
    expect(sanitizeText('\uFEFFstart')).toBe('start');
    expect(sanitizeText('soft\u00ADhyphen')).toBe('softhyphen');
  });

  it('removes bidirectional text override characters', () => {
    // LTR/RTL overrides and isolates (security risk for text spoofing)
    expect(sanitizeText('hello\u202Aworld')).toBe('helloworld'); // LTR embedding
    expect(sanitizeText('test\u202Bfoo')).toBe('testfoo'); // RTL embedding
    expect(sanitizeText('a\u202C\u202D\u202Eb')).toBe('ab'); // Pop, LTR/RTL override
    expect(sanitizeText('\u2066\u2067\u2068\u2069text')).toBe('text'); // Isolates
  });

  it('normalizes CRLF to LF', () => {
    expect(sanitizeText('line1\r\nline2')).toBe('line1\nline2');
    expect(sanitizeText('only\rcarriage')).toBe('only\ncarriage');
  });

  it('normalizes multiple spaces to single space', () => {
    expect(sanitizeText('hello   world')).toBe('hello world');
    expect(sanitizeText('too     many    spaces')).toBe('too many spaces');
  });

  it('normalizes excessive newlines to paragraph breaks', () => {
    expect(sanitizeText('para1\n\n\n\npara2')).toBe('para1\n\npara2');
    expect(sanitizeText('a\n\n\n\n\nb')).toBe('a\n\nb');
  });

  it('trims leading and trailing whitespace', () => {
    expect(sanitizeText('  hello  ')).toBe('hello');
    expect(sanitizeText('\n\ntext\n\n')).toBe('text');
  });

  it('handles combined edge cases', () => {
    const messy = '  \uFEFF\x00Hello\u200B   World\r\n\n\n\nTest\x1F  ';

    expect(sanitizeText(messy)).toBe('Hello World\n\nTest');
  });
});

describe('isEmptyText', () => {
  it('returns true for empty string', () => {
    expect(isEmptyText('')).toBe(true);
  });

  it('returns true for whitespace only', () => {
    expect(isEmptyText('   ')).toBe(true);
    expect(isEmptyText('\n\n\t')).toBe(true);
  });

  it('returns true for zero-width chars only', () => {
    expect(isEmptyText('\u200B\u200C\u200D')).toBe(true);
  });

  it('returns false for actual content', () => {
    expect(isEmptyText('hello')).toBe(false);
  });
});

describe('sanitizeAndValidate', () => {
  it('returns valid true when text meets minimum length', () => {
    const text = 'a'.repeat(100);
    const result = sanitizeAndValidate(text, 100);

    expect(result.valid).toBe(true);
    expect(result.length).toBe(100);
  });

  it('returns valid false when text is too short', () => {
    const result = sanitizeAndValidate('short', 100);

    expect(result.valid).toBe(false);
    expect(result.length).toBe(5);
  });

  it('uses default minimum of 100 characters', () => {
    const shortResult = sanitizeAndValidate('x'.repeat(99));
    const exactResult = sanitizeAndValidate('x'.repeat(100));

    expect(shortResult.valid).toBe(false);
    expect(exactResult.valid).toBe(true);
  });

  it('sanitizes text before length check', () => {
    // 100 chars but with zero-width chars that get removed
    const text = 'x'.repeat(95) + '\u200B'.repeat(10);
    const result = sanitizeAndValidate(text, 100);

    expect(result.valid).toBe(false);
    expect(result.length).toBe(95);
  });
});
