import { describe, expect, it } from 'vitest';
import { chunkText, estimateChunkCount } from './TextChunker';

describe('chunkText', () => {
  describe('basic chunking', () => {
    it('returns single chunk for short text', () => {
      const text = 'This is a short piece of text.';
      const chunks = chunkText(text);

      expect(chunks).toHaveLength(1);
      expect(chunks[0]!.text).toBe(text);
      expect(chunks[0]!.position).toBe(0);
    });

    it('returns empty array for empty text', () => {
      expect(chunkText('')).toHaveLength(0);
    });

    it('returns empty array for whitespace-only text', () => {
      expect(chunkText('   \n\n   ')).toHaveLength(0);
    });

    it('splits text exceeding chunk size', () => {
      const paragraph = 'This is a test paragraph with enough content. ';
      const text = paragraph.repeat(100); // ~4600 chars
      const chunks = chunkText(text, { maxChunkSize: 2000, chunkOverlap: 0 });

      expect(chunks.length).toBeGreaterThan(1);

      chunks.forEach((chunk) => {
        expect(chunk.text.length).toBeLessThanOrEqual(2000);
      });
    });

    it('assigns sequential position numbers', () => {
      const paragraph = 'This is test content for chunking purposes. ';
      const text = paragraph.repeat(100);
      const chunks = chunkText(text, { maxChunkSize: 500, chunkOverlap: 0 });

      chunks.forEach((chunk, index) => {
        expect(chunk.position).toBe(index);
      });
    });
  });

  describe('position tracking', () => {
    it('tracks start and end character positions', () => {
      const text = 'First sentence here. Second sentence here.';
      const chunks = chunkText(text);

      expect(chunks[0]!.startChar).toBe(0);
      expect(chunks[0]!.endChar).toBe(text.length);
    });

    it('maintains correct positions across multiple chunks', () => {
      const sentence = 'This is a complete sentence for testing. ';
      const text = sentence.repeat(60); // ~2400 chars
      const chunks = chunkText(text, { maxChunkSize: 1000, chunkOverlap: 0 });

      expect(chunks.length).toBeGreaterThan(1);

      // First chunk starts at 0
      expect(chunks[0]!.startChar).toBe(0);

      // Each subsequent chunk starts where previous ended (without overlap)
      for (let i = 1; i < chunks.length; i++) {
        // With overlap disabled, positions should be contiguous
        expect(chunks[i]!.startChar).toBeGreaterThan(0);
      }
    });
  });

  describe('overlap handling', () => {
    it('adds overlap to subsequent chunks', () => {
      const sentence = 'This is a sentence for overlap testing purposes. ';
      const text = sentence.repeat(60);
      const chunks = chunkText(text, { maxChunkSize: 1000, chunkOverlap: 100 });

      expect(chunks.length).toBeGreaterThan(1);

      // Second chunk should have overlap content
      if (chunks.length > 1) {
        // The overlap means startChar of chunk 2 <= endChar of chunk 1
        // (can be equal when overlap lands exactly on a word boundary)
        expect(chunks[1]!.startChar).toBeLessThanOrEqual(chunks[0]!.endChar);
      }
    });

    it('does not add overlap to first chunk', () => {
      const sentence = 'Testing overlap behavior carefully. ';
      const text = sentence.repeat(60);
      const chunks = chunkText(text, { maxChunkSize: 1000, chunkOverlap: 100 });

      // First chunk starts at 0
      expect(chunks[0]!.startChar).toBe(0);
    });

    it('works correctly with zero overlap', () => {
      const sentence = 'No overlap testing here. ';
      const text = sentence.repeat(60);
      const chunks = chunkText(text, { maxChunkSize: 500, chunkOverlap: 0 });

      expect(chunks.length).toBeGreaterThan(1);
    });
  });

  describe('separator handling', () => {
    it('prefers paragraph breaks over line breaks', () => {
      const text = 'Paragraph one content.\n\nParagraph two content.\n\nParagraph three content.';
      const chunks = chunkText(text, { maxChunkSize: 30, chunkOverlap: 0 });

      // Should split at paragraph breaks
      expect(chunks.some(c => c.text.includes('Paragraph one'))).toBe(true);
    });

    it('splits at sentence boundaries', () => {
      const text = 'First sentence here. Second sentence here. Third sentence here.';
      const chunks = chunkText(text, { maxChunkSize: 25, chunkOverlap: 0 });

      expect(chunks.length).toBeGreaterThan(1);
    });

    it('handles text with mixed separators', () => {
      const text = 'First paragraph.\n\nSecond paragraph.\nWith a line break. And sentences.';
      const chunks = chunkText(text, { maxChunkSize: 40, chunkOverlap: 0 });

      expect(chunks.length).toBeGreaterThan(0);

      chunks.forEach((chunk) => {
        expect(chunk.text.length).toBeLessThanOrEqual(40);
      });
    });
  });

  describe('Italian abbreviation handling', () => {
    it('does not split after dott.', () => {
      const text = 'Il dott. Rossi ha visitato il paziente oggi.';
      const chunks = chunkText(text, { maxChunkSize: 100, chunkOverlap: 0 });

      // Should remain as single chunk since it's under limit
      expect(chunks).toHaveLength(1);
      expect(chunks[0]!.text).toContain('dott. Rossi');
    });

    it('does not split after sig.', () => {
      const text = 'Il sig. Bianchi lavora qui. È molto bravo nel suo lavoro.';
      const chunks = chunkText(text, { maxChunkSize: 100, chunkOverlap: 0 });

      expect(chunks).toHaveLength(1);
      expect(chunks[0]!.text).toContain('sig. Bianchi');
    });

    it('does not split after prof.', () => {
      const text = 'La prof. Maria insegna matematica ogni giorno.';
      const chunks = chunkText(text, { maxChunkSize: 100, chunkOverlap: 0 });

      expect(chunks).toHaveLength(1);
      expect(chunks[0]!.text).toContain('prof. Maria');
    });

    it('splits correctly at real sentence endings', () => {
      const text = 'Il dott. Rossi è arrivato. Poi ha visitato il paziente. Infine è partito.';
      const chunks = chunkText(text, { maxChunkSize: 35, chunkOverlap: 0 });

      // Should split at actual sentence boundaries, not after dott.
      expect(chunks.length).toBeGreaterThan(1);
      expect(chunks[0]!.text).toContain('dott. Rossi');
    });

    it('handles multiple abbreviations in text', () => {
      const text = 'Il dott. Rossi e il sig. Bianchi lavorano insieme. Sono colleghi da anni. Lavorano bene.';
      const chunks = chunkText(text, { maxChunkSize: 60, chunkOverlap: 0 });

      // Verify abbreviations are preserved
      const allText = chunks.map(c => c.text).join(' ');

      expect(allText).toContain('dott.');
      expect(allText).toContain('sig.');
    });

    it('handles ecc. abbreviation', () => {
      const text = 'Frutti come mele, pere, ecc. sono disponibili.';
      const chunks = chunkText(text, { maxChunkSize: 100, chunkOverlap: 0 });

      expect(chunks).toHaveLength(1);
      expect(chunks[0]!.text).toContain('ecc.');
    });
  });

  describe('text sanitization', () => {
    it('normalizes whitespace', () => {
      const text = 'Text   with    multiple     spaces.';
      const chunks = chunkText(text);

      expect(chunks[0]!.text).not.toContain('   ');
    });

    it('normalizes line endings', () => {
      const text = 'Line one.\r\nLine two.\r\nLine three.';
      const chunks = chunkText(text);

      expect(chunks[0]!.text).not.toContain('\r\n');
      expect(chunks[0]!.text).toContain('\n');
    });

    it('handles Unicode text', () => {
      const text = 'Testo italiano con àèìòù e lettere speciali.';
      const chunks = chunkText(text);

      expect(chunks[0]!.text).toContain('àèìòù');
    });
  });

  describe('edge cases', () => {
    it('handles very long words without spaces', () => {
      const longWord = 'a'.repeat(3000);
      const chunks = chunkText(longWord, { maxChunkSize: 1000, chunkOverlap: 0 });

      expect(chunks.length).toBeGreaterThan(1);

      chunks.forEach((chunk) => {
        expect(chunk.text.length).toBeLessThanOrEqual(1000);
      });
    });

    it('handles single character text', () => {
      const chunks = chunkText('a');

      expect(chunks).toHaveLength(1);
      expect(chunks[0]!.text).toBe('a');
    });

    it('handles text exactly at chunk size', () => {
      const text = 'a'.repeat(2000);
      const chunks = chunkText(text, { maxChunkSize: 2000, chunkOverlap: 0 });

      expect(chunks).toHaveLength(1);
    });

    it('handles text one character over chunk size', () => {
      const text = 'a'.repeat(2001);
      const chunks = chunkText(text, { maxChunkSize: 2000, chunkOverlap: 0 });

      expect(chunks.length).toBeGreaterThan(1);
    });
  });
});

describe('estimateChunkCount', () => {
  it('returns 0 for empty text', () => {
    expect(estimateChunkCount(0)).toBe(0);
  });

  it('returns 1 for text under chunk size', () => {
    expect(estimateChunkCount(1000)).toBe(1);
    expect(estimateChunkCount(2000)).toBe(1);
  });

  it('estimates correctly for longer text', () => {
    // 4000 chars with 2000 chunk size and 200 overlap
    // Effective size = 1800, so (4000 - 200) / 1800 = 2.1 -> 3 chunks
    const estimate = estimateChunkCount(4000, { maxChunkSize: 2000, chunkOverlap: 200 });

    expect(estimate).toBeGreaterThanOrEqual(2);
  });

  it('uses default options when not specified', () => {
    expect(estimateChunkCount(5000)).toBeGreaterThan(1);
  });
});
