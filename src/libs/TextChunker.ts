/**
 * Text chunking utilities for content ingestion.
 * Implements recursive character splitting with overlap for RAG retrieval.
 */

import { sanitizeText } from './Sanitizer';

// Default chunking parameters optimized for Mistral embeddings
const DEFAULT_CHUNK_SIZE = 2000; // ~500 tokens
const DEFAULT_CHUNK_OVERLAP = 200; // ~50 tokens

// Hierarchical separators for recursive splitting (most to least specific)
const DEFAULT_SEPARATORS = [
  '\n\n', // Paragraph breaks
  '\n', // Line breaks
  '. ', // Sentence endings (space after avoids abbreviations)
  '! ',
  '? ',
  '; ', // Clause breaks
  ', ', // Phrase breaks
  ' ', // Word breaks
];

// Italian abbreviations that should NOT be treated as sentence endings
// These have a period but don't end sentences
const ITALIAN_ABBREVIATIONS = new Set([
  'dott', // dottore/dottoressa
  'sig', // signore
  'sig.ra', // signora (special case with internal period)
  'prof', // professore
  'ing', // ingegnere
  'avv', // avvocato
  'rag', // ragioniere
  'geom', // geometra
  'arch', // architetto
  'dr', // dottore (alternative)
  'ecc', // eccetera
  'es', // esempio
  'cfr', // confronta
  'pag', // pagina
  'pagg', // pagine
  'vol', // volume
  'voll', // volumi
  'cap', // capitolo
  'art', // articolo
  'n', // numero
  'nr', // numero (alternative)
  'tel', // telefono
  'fax', // fax
  'c.a', // corrente anno
  'p.es', // per esempio
  'ecc', // eccetera
]);

type Chunk = {
  text: string;
  position: number;
  startChar: number;
  endChar: number;
};

type ChunkingOptions = {
  maxChunkSize?: number;
  chunkOverlap?: number;
  separators?: string[];
};

/**
 * Checks if a potential sentence break is actually an Italian abbreviation.
 * @param text - The text being chunked
 * @param periodIndex - Index of the period in the text
 * @returns True if this is an abbreviation, not a sentence ending
 */
function isItalianAbbreviation(text: string, periodIndex: number): boolean {
  // Look backwards from the period to find the word
  let wordStart = periodIndex - 1;
  while (wordStart >= 0 && /[a-z.]/i.test(text[wordStart]!)) {
    wordStart--;
  }
  wordStart++; // Move past the non-letter character

  const word = text.slice(wordStart, periodIndex).toLowerCase();

  // Check if the word (without trailing period) is an abbreviation
  return ITALIAN_ABBREVIATIONS.has(word);
}

/**
 * Finds safe split positions in text, avoiding Italian abbreviations.
 * @param text - Text to find split positions in
 * @param separator - The separator to search for
 * @returns Array of safe split positions (indices after the separator)
 */
function findSafeSplitPositions(text: string, separator: string): number[] {
  const positions: number[] = [];
  let searchStart = 0;

  while (searchStart < text.length) {
    const index = text.indexOf(separator, searchStart);
    if (index === -1) {
      break;
    }

    // For sentence-ending separators, check for abbreviations
    if (separator === '. ') {
      if (!isItalianAbbreviation(text, index)) {
        positions.push(index + separator.length);
      }
    } else {
      positions.push(index + separator.length);
    }

    searchStart = index + 1;
  }

  return positions;
}

/**
 * Splits text at the best position for a given separator.
 * @param text - Text to split
 * @param maxSize - Maximum chunk size
 * @param separator - Separator to use
 * @returns Split position, or -1 if no good split found
 */
function findBestSplit(text: string, maxSize: number, separator: string): number {
  const positions = findSafeSplitPositions(text, separator);

  // Find the last position that keeps the chunk under maxSize
  let bestPosition = -1;
  for (const pos of positions) {
    if (pos <= maxSize) {
      bestPosition = pos;
    } else {
      break;
    }
  }

  return bestPosition;
}

/**
 * Recursively splits text using hierarchical separators.
 * @param text - Text to split
 * @param options - Chunking options
 * @param separatorIndex - Current separator index
 * @param startOffset - Starting character offset in original text
 * @returns Array of chunks
 */
function splitRecursively(
  text: string,
  options: Required<ChunkingOptions>,
  separatorIndex: number,
  startOffset: number,
): Chunk[] {
  const { maxChunkSize, separators } = options;

  // Base case: text fits in a single chunk
  if (text.length <= maxChunkSize) {
    return text.trim().length > 0
      ? [{
          text: text.trim(),
          position: 0, // Will be updated by caller
          startChar: startOffset,
          endChar: startOffset + text.length,
        }]
      : [];
  }

  // Try each separator starting from current index
  for (let i = separatorIndex; i < separators.length; i++) {
    const separator = separators[i]!;
    const splitPos = findBestSplit(text, maxChunkSize, separator);

    if (splitPos > 0) {
      const firstPart = text.slice(0, splitPos);
      const secondPart = text.slice(splitPos);

      // Recursively process both parts
      const firstChunks = splitRecursively(firstPart, options, i, startOffset);
      const secondChunks = splitRecursively(
        secondPart,
        options,
        i,
        startOffset + splitPos,
      );

      return [...firstChunks, ...secondChunks];
    }
  }

  // Fallback: force split at maxChunkSize (no good separator found)
  const firstPart = text.slice(0, maxChunkSize);
  const secondPart = text.slice(maxChunkSize);

  const firstChunks = [{
    text: firstPart.trim(),
    position: 0,
    startChar: startOffset,
    endChar: startOffset + maxChunkSize,
  }];

  const secondChunks = splitRecursively(
    secondPart,
    options,
    0,
    startOffset + maxChunkSize,
  );

  return [...firstChunks, ...secondChunks];
}

/**
 * Adds overlap between chunks for context preservation.
 * @param chunks - Array of chunks without overlap
 * @param originalText - The original text
 * @param overlap - Number of characters to overlap
 * @returns Chunks with overlap added
 */
function addOverlap(chunks: Chunk[], originalText: string, overlap: number): Chunk[] {
  if (chunks.length <= 1 || overlap <= 0) {
    return chunks;
  }

  return chunks.map((chunk, index) => {
    if (index === 0) {
      // First chunk: no prefix overlap needed
      return chunk;
    }

    // Calculate overlap start position
    const overlapStart = Math.max(0, chunk.startChar - overlap);
    const overlapText = originalText.slice(overlapStart, chunk.startChar);

    // Find a good break point for the overlap (prefer word boundary)
    let trimmedOverlap = overlapText;
    const lastSpace = overlapText.lastIndexOf(' ');
    if (lastSpace > 0 && lastSpace > overlapText.length / 2) {
      trimmedOverlap = overlapText.slice(lastSpace + 1);
    }

    return {
      text: trimmedOverlap + chunk.text,
      position: chunk.position,
      startChar: chunk.startChar - trimmedOverlap.length,
      endChar: chunk.endChar,
    };
  });
}

/**
 * Chunks text into smaller pieces for embedding.
 * Uses recursive character splitting with Italian-aware sentence boundaries.
 * @param text - Text to chunk
 * @param options - Chunking configuration
 * @returns Array of chunks with position metadata
 */
export function chunkText(text: string, options?: ChunkingOptions): Chunk[] {
  // Sanitize and normalize text
  const normalizedText = sanitizeText(text);

  if (normalizedText.length === 0) {
    return [];
  }

  const resolvedOptions: Required<ChunkingOptions> = {
    maxChunkSize: options?.maxChunkSize ?? DEFAULT_CHUNK_SIZE,
    chunkOverlap: options?.chunkOverlap ?? DEFAULT_CHUNK_OVERLAP,
    separators: options?.separators ?? DEFAULT_SEPARATORS,
  };

  // Split text recursively
  const rawChunks = splitRecursively(normalizedText, resolvedOptions, 0, 0);

  // Filter out empty chunks and assign sequential positions
  const validChunks = rawChunks
    .filter(chunk => chunk.text.length > 0)
    .map((chunk, index) => ({
      ...chunk,
      position: index,
    }));

  // Add overlap for context preservation
  return addOverlap(validChunks, normalizedText, resolvedOptions.chunkOverlap);
}

/**
 * Estimates the number of chunks for a given text length.
 * Useful for quota checking before processing.
 * @param textLength - Character count of text
 * @param options - Chunking options
 * @returns Estimated number of chunks
 */
export function estimateChunkCount(textLength: number, options?: ChunkingOptions): number {
  const chunkSize = options?.maxChunkSize ?? DEFAULT_CHUNK_SIZE;
  const overlap = options?.chunkOverlap ?? DEFAULT_CHUNK_OVERLAP;

  if (textLength <= chunkSize) {
    return textLength > 0 ? 1 : 0;
  }

  // Effective chunk size considering overlap
  const effectiveSize = chunkSize - overlap;
  return Math.ceil((textLength - overlap) / effectiveSize);
}
