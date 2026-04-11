import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const EXPECTED_AXIOS_VERSION = '1.13.6';
export const FORBIDDEN_PACKAGES = [
  'plain-crypto-js',
];

/**
 * @param {string} packagePath
 * @returns {string | null}
 */
export function getInstalledPackageName(packagePath) {
  const nodeModulesMarker = 'node_modules/';
  const markerIndex = packagePath.lastIndexOf(nodeModulesMarker);
  const installedPackagePath = markerIndex === -1
    ? null
    : packagePath.slice(markerIndex + nodeModulesMarker.length);

  if (!installedPackagePath) {
    return null;
  }

  const pathSegments = installedPackagePath.split('/');

  if (pathSegments[0]?.startsWith('@')) {
    return pathSegments[1] ? `${pathSegments[0]}/${pathSegments[1]}` : null;
  }

  return pathSegments[0] ?? null;
}

/**
 * @param {string} packageName
 * @returns {string}
 */
function getBarePackageName(packageName) {
  return packageName.startsWith('@') ? (packageName.split('/')[1] ?? packageName) : packageName;
}

/**
 * @param {{
 *   installedPackageName: string;
 *   expectedPackageName: string;
 *   matchScopedVariants: boolean;
 * }} input
 * @returns {boolean}
 */
export function matchesInstalledPackage(input) {
  if (input.installedPackageName === input.expectedPackageName) {
    return true;
  }

  if (!input.matchScopedVariants) {
    return false;
  }

  return getBarePackageName(input.installedPackageName) === getBarePackageName(input.expectedPackageName);
}

/**
 * @param {{
 *   packageJson: { overrides?: { axios?: string } };
 *   packageLock: { packages?: Record<string, { version?: string }> };
 *   expectedAxiosVersion: string;
 *   forbiddenPackages: string[];
 * }} input
 * @returns {string[]}
 */
export function buildDependencyGuardErrors(input) {
  const errors = [];
  const lockPackages = input.packageLock.packages ?? {};
  const lockEntries = Object.entries(lockPackages);

  if (input.packageJson.overrides?.axios !== input.expectedAxiosVersion) {
    errors.push(`package.json must pin axios via overrides to ${input.expectedAxiosVersion}.`);
  }

  for (const [packagePath, packageData] of lockEntries) {
    const installedPackageName = getInstalledPackageName(packagePath);
    if (!installedPackageName) {
      continue;
    }

    if (
      matchesInstalledPackage({
        installedPackageName,
        expectedPackageName: 'axios',
        matchScopedVariants: false,
      })
      && packageData.version !== input.expectedAxiosVersion
    ) {
      errors.push(`Found axios@${packageData.version} at ${packagePath}; expected ${input.expectedAxiosVersion}.`);
    }

    for (const forbiddenPackage of input.forbiddenPackages) {
      if (!matchesInstalledPackage({
        installedPackageName,
        expectedPackageName: forbiddenPackage,
        matchScopedVariants: true,
      })) {
        continue;
      }

      errors.push(`Found forbidden package ${installedPackageName}@${packageData.version} at ${packagePath}.`);
    }
  }

  return errors;
}

export function main() {
  const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  const packageLock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'));
  const errors = buildDependencyGuardErrors({
    packageJson,
    packageLock,
    expectedAxiosVersion: EXPECTED_AXIOS_VERSION,
    forbiddenPackages: FORBIDDEN_PACKAGES,
  });

  if (errors.length > 0) {
    console.error('Dependency guard failed:');
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exit(1);
  }

  console.log('Dependency guard passed.');
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main();
}
