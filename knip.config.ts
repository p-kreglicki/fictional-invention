import type { KnipConfig } from 'knip';

const config: KnipConfig = {
  // Files to exclude from Knip analysis
  ignore: [
    'checkly.config.ts',
    'src/libs/I18n.ts',
    'src/types/I18n.ts',
    'src/utils/Helpers.ts',
    'tests/**/*.ts',
    'scripts/**/*',
    'src/libs/Auth.ts',
    'src/libs/Pinecone.ts',
    'src/libs/Mistral.ts',
    'src/libs/PdfValidator.ts', // Types exported for content ingestion consumers
    'src/libs/PdfExtractor.ts', // Types exported for content ingestion consumers
    'src/libs/UrlValidator.ts', // Types exported for content ingestion consumers
    'src/libs/UrlExtractor.ts', // Types exported for content ingestion consumers
    'src/validations/DocumentValidation.ts', // Used in content ingestion pipeline Phase 2.6
  ],
  // Dependencies to ignore during analysis
  ignoreDependencies: [
    '@commitlint/types',
    '@clerk/types',
    '@swc/helpers', // Transitive dependency required by Next.js
    'conventional-changelog-conventionalcommits',
    'vite',
    'postcss-load-config',
  ],
  // Binaries to ignore during analysis
  ignoreBinaries: [
    'production', // False positive raised with dotenv-cli
  ],
  compilers: {
    css: (text: string) => [...text.matchAll(/(?<=@)import[^;]+/g)].join('\n'),
  },
};

export default config;
