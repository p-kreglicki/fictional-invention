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
    'src/components/dashboard/DashboardAddContentModal.tsx', // WIP dashboard modal not mounted yet
    'src/components/ui/styles.ts', // Shared foundation exports are intentionally broader than current usage
    'src/components/ui/base/buttons/button-styles.ts', // Imported foundation staged ahead of adoption
    'src/components/ui/base/buttons/button.tsx', // Imported foundation staged ahead of adoption
    'src/components/untitled/application/file-upload/file-upload-base.tsx', // Shared upload primitives are intentionally broader than current usage
    'src/components/untitled/base/avatar/**/*', // Imported primitives staged ahead of adoption
    'src/components/untitled/base/badges/badge-types.ts', // Imported primitive types staged ahead of adoption
    'src/components/untitled/base/button-group/button-group.tsx', // Shared primitive exports are intentionally broader than current usage
    'src/components/untitled/base/buttons/button-utility.tsx', // Shared primitive exports are intentionally broader than current usage
    'src/components/untitled/base/buttons/button.tsx', // Shared primitive exports are intentionally broader than current usage
    'src/components/untitled/base/checkbox/checkbox.tsx', // Shared primitive exports are intentionally broader than current usage
    'src/components/untitled/base/input/input-group.tsx', // Imported primitive staged ahead of adoption
    'src/components/untitled/base/input/input-payment.tsx', // Imported primitive staged ahead of adoption
    'src/components/untitled/base/input/input.tsx', // Shared primitive exports are intentionally broader than current usage
    'src/components/untitled/base/progress-indicators/progress-indicators.tsx', // Shared primitive exports are intentionally broader than current usage
    'src/components/untitled/base/radio-buttons/radio-buttons.tsx', // Shared primitive exports are intentionally broader than current usage
    'src/components/untitled/base/select/**/*', // Imported select primitives staged ahead of adoption
    'src/components/untitled/base/tags/base-components/tag-close-x.tsx', // Imported primitive staged ahead of adoption
    'src/components/untitled/foundations/payment-icons/**/*', // Imported icons staged ahead of adoption
    'src/hooks/use-breakpoint.ts', // Imported hook staged ahead of adoption
    'src/hooks/use-resize-observer.ts', // Imported hook staged ahead of adoption
    'src/utils/is-react-component.ts', // Shared helper exports are intentionally broader than current usage
  ],
  // Dependencies to ignore during analysis
  ignoreDependencies: [
    '@commitlint/types',
    '@clerk/types',
    '@swc/helpers', // Transitive dependency required by Next.js
    'conventional-changelog-conventionalcommits',
    'vite',
    'postcss-load-config',
    '@react-stately/utils', // Transitive dependency retained for imported primitives
    'tailwindcss-animate', // Foundation styling dependency retained for imported primitives
    'tailwindcss-react-aria-components', // Foundation styling dependency retained for imported primitives
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
