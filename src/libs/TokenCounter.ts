/**
 * Token counting utilities using Mistral tokenizer.
 * Provides accurate token counts for Mistral embedding model.
 */

// Tokenizer interface matching mistral-tokenizer-ts
type Tokenizer = {
  encode: (text: string) => number[];
  decode: (tokens: number[]) => string;
};

// Lazy-loaded tokenizer instance with race condition protection
let tokenizerPromise: Promise<Tokenizer | null> | null = null;

/**
 * Gets the Mistral tokenizer, initializing it lazily.
 * Uses promise caching to prevent race conditions on concurrent calls.
 * Falls back to character estimation if tokenizer unavailable.
 */
async function getTokenizer(): Promise<Tokenizer | null> {
  if (!tokenizerPromise) {
    tokenizerPromise = (async () => {
      try {
        const { getTokenizerForModel } = await import('mistral-tokenizer-ts');
        return getTokenizerForModel('mistral-embed');
      } catch {
        return null;
      }
    })();
  }
  return tokenizerPromise;
}

// Average chars per token for Mistral (used for estimation fallback)
const CHARS_PER_TOKEN = 4;

/**
 * Counts the number of tokens in a text string.
 * Uses Mistral tokenizer when available, falls back to estimation.
 * @param text - Text to count tokens for
 * @returns Number of tokens
 */
export async function countTokens(text: string): Promise<number> {
  const tok = await getTokenizer();
  if (tok) {
    return tok.encode(text).length;
  }
  // Fallback: estimate based on character count
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Counts tokens synchronously using estimation.
 * Use when async is not possible or accuracy is less critical.
 * @param text - Text to count tokens for
 * @returns Estimated number of tokens
 */
export function countTokensEstimate(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Estimates character count from token count.
 * Mistral averages ~4 characters per token for English/Italian text.
 * @param tokens - Number of tokens
 * @returns Estimated character count
 */
export function estimateCharsFromTokens(tokens: number): number {
  return Math.ceil(tokens * CHARS_PER_TOKEN);
}

/**
 * Estimates token count from character count.
 * @param chars - Number of characters
 * @returns Estimated token count
 */
export function estimateTokensFromChars(chars: number): number {
  return Math.ceil(chars / CHARS_PER_TOKEN);
}

/**
 * Checks if text exceeds a token limit.
 * @param text - Text to check
 * @param maxTokens - Maximum allowed tokens
 * @returns True if text exceeds limit
 */
export async function exceedsTokenLimit(text: string, maxTokens: number): Promise<boolean> {
  const count = await countTokens(text);
  return count > maxTokens;
}

/**
 * Truncates text to fit within a token limit.
 * Uses tokenizer when available, falls back to character estimation.
 * @param text - Text to truncate
 * @param maxTokens - Maximum allowed tokens
 * @returns Truncated text that fits within limit
 */
export async function truncateToTokenLimit(text: string, maxTokens: number): Promise<string> {
  const tok = await getTokenizer();

  if (tok) {
    const tokens = tok.encode(text);
    if (tokens.length <= maxTokens) {
      return text;
    }
    const truncatedTokens = tokens.slice(0, maxTokens);
    return tok.decode(truncatedTokens);
  }

  // Fallback: truncate based on character estimation
  const maxChars = maxTokens * CHARS_PER_TOKEN;
  if (text.length <= maxChars) {
    return text;
  }
  return text.slice(0, maxChars);
}
