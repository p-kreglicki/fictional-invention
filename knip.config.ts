import type { KnipConfig } from 'knip';

const config: KnipConfig = {
  // Files to exclude from Knip analysis
  ignore: [
    '.storybook/**/*',
    'checkly.config.ts',
    'src/libs/I18n.ts',
    'src/types/I18n.ts',
    'src/utils/Helpers.ts',
    'tests/**/*.ts',
    'scripts/**/*',
    'src/libs/Auth.ts',
    'src/libs/Pinecone.ts',
    'src/libs/Mistral.ts',
  ],
  // Dependencies to ignore during analysis
  ignoreDependencies: [
    '@commitlint/types',
    '@clerk/types',
    '@mozilla/readability', // Used in content ingestion pipeline
    '@swc/helpers', // Transitive dependency required by Next.js
    'conventional-changelog-conventionalcommits',
    'file-type', // Used in content ingestion pipeline
    'ipaddr.js', // Used in content ingestion pipeline
    'linkedom', // Used in content ingestion pipeline
    'unpdf', // Used in content ingestion pipeline
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
