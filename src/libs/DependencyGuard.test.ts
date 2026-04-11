import { describe, expect, it } from 'vitest';
import {
  buildDependencyGuardErrors,
  EXPECTED_AXIOS_VERSION,
  getInstalledPackageName,
  matchesInstalledPackage,
} from '../../scripts/check-forbidden-deps.mjs';

describe('Dependency guard', () => {
  it('extracts installed package names from nested and scoped lockfile paths', () => {
    expect(getInstalledPackageName('node_modules/axios')).toBe('axios');
    expect(getInstalledPackageName('node_modules/@scope/plain-crypto-js')).toBe('@scope/plain-crypto-js');
    expect(getInstalledPackageName('node_modules/a/node_modules/@scope/plain-crypto-js')).toBe('@scope/plain-crypto-js');
  });

  it('matches scoped variants only when requested', () => {
    expect(matchesInstalledPackage({
      installedPackageName: '@scope/plain-crypto-js',
      expectedPackageName: 'plain-crypto-js',
      matchScopedVariants: true,
    })).toBe(true);

    expect(matchesInstalledPackage({
      installedPackageName: '@scope/plain-crypto-js',
      expectedPackageName: 'plain-crypto-js',
      matchScopedVariants: false,
    })).toBe(false);
  });

  it('flags scoped forbidden packages and keeps dotted names literal', () => {
    const errors = buildDependencyGuardErrors({
      packageJson: {
        overrides: {
          axios: EXPECTED_AXIOS_VERSION,
        },
      },
      packageLock: {
        packages: {
          'node_modules/@scope/plain-crypto-js': { version: '2.0.0' },
          'node_modules/plain.crypto-js': { version: '1.0.0' },
          'node_modules/plainXcrypto-js': { version: '1.0.0' },
          'node_modules/axios': { version: EXPECTED_AXIOS_VERSION },
        },
      },
      expectedAxiosVersion: EXPECTED_AXIOS_VERSION,
      forbiddenPackages: ['plain-crypto-js', 'plain.crypto-js'],
    });

    expect(errors).toContain('Found forbidden package @scope/plain-crypto-js@2.0.0 at node_modules/@scope/plain-crypto-js.');
    expect(errors).toContain('Found forbidden package plain.crypto-js@1.0.0 at node_modules/plain.crypto-js.');
    expect(errors.some(error => error.includes('plainXcrypto-js'))).toBe(false);
  });
});
