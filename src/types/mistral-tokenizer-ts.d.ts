declare module 'mistral-tokenizer-ts' {
  export type MistralTokenizer = {
    encode: (text: string) => number[];
    decode: (tokens: number[]) => string;
  };

  export function getTokenizerForModel(model: string): MistralTokenizer;
}
