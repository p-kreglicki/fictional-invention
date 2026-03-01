import { describe, expect, it } from 'vitest';
import {
  countTokens,
  countTokensEstimate,
  estimateCharsFromTokens,
  estimateTokensFromChars,
  exceedsTokenLimit,
  truncateToTokenLimit,
} from './TokenCounter';

describe('countTokens', () => {
  it('counts tokens in simple text', async () => {
    const count = await countTokens('Hello world!');

    // Should return a positive number
    expect(count).toBeGreaterThan(0);
  });

  it('counts tokens in Italian text', async () => {
    const count = await countTokens('Buongiorno, come stai oggi?');

    expect(count).toBeGreaterThan(0);
  });

  it('returns 0 for empty string', async () => {
    expect(await countTokens('')).toBe(0);
  });
});

describe('countTokensEstimate', () => {
  it('estimates ~0.25 tokens per character', () => {
    // 12 chars / 4 = 3 tokens
    expect(countTokensEstimate('Hello world!')).toBe(3);
  });

  it('rounds up to nearest integer', () => {
    // 5 chars / 4 = 1.25, rounds up to 2
    expect(countTokensEstimate('Hello')).toBe(2);
  });

  it('returns 0 for empty string', () => {
    expect(countTokensEstimate('')).toBe(0);
  });
});

describe('estimateCharsFromTokens', () => {
  it('estimates ~4 chars per token', () => {
    expect(estimateCharsFromTokens(100)).toBe(400);
    expect(estimateCharsFromTokens(500)).toBe(2000);
  });

  it('rounds up to nearest integer', () => {
    expect(estimateCharsFromTokens(1)).toBe(4);
    expect(estimateCharsFromTokens(0)).toBe(0);
  });
});

describe('estimateTokensFromChars', () => {
  it('estimates ~0.25 tokens per char', () => {
    expect(estimateTokensFromChars(400)).toBe(100);
    expect(estimateTokensFromChars(2000)).toBe(500);
  });

  it('rounds up to nearest integer', () => {
    // 5 / 4 = 1.25, rounds up to 2
    expect(estimateTokensFromChars(5)).toBe(2);
    expect(estimateTokensFromChars(0)).toBe(0);
  });
});

describe('exceedsTokenLimit', () => {
  it('returns false when under limit', async () => {
    expect(await exceedsTokenLimit('Hello', 100)).toBe(false);
  });

  it('returns true when over limit', async () => {
    const longText = 'word '.repeat(1000);

    expect(await exceedsTokenLimit(longText, 10)).toBe(true);
  });

  it('returns false for empty text', async () => {
    expect(await exceedsTokenLimit('', 1)).toBe(false);
  });
});

describe('truncateToTokenLimit', () => {
  it('returns original text when under limit', async () => {
    const text = 'Hello world!';

    expect(await truncateToTokenLimit(text, 100)).toBe(text);
  });

  it('truncates text to fit within limit', async () => {
    const text = 'This is a longer piece of text that should be truncated to fit within the specified token limit.';
    const truncated = await truncateToTokenLimit(text, 5);

    expect(truncated.length).toBeLessThan(text.length);
  });

  it('handles empty text', async () => {
    expect(await truncateToTokenLimit('', 10)).toBe('');
  });
});
