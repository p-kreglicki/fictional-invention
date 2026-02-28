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
