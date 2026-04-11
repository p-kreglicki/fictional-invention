import { readFileSync } from 'node:fs';

const EXPECTED_AXIOS_VERSION = '1.13.6';
const FORBIDDEN_PACKAGES = [
  'plain-crypto-js',
];

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const packageLock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'));

const errors = [];
const lockPackages = packageLock.packages ?? {};
const lockEntries = Object.entries(lockPackages);

const packagePathPattern = packageName => new RegExp(`(^|/)node_modules/${packageName}$`);

if (packageJson.overrides?.axios !== EXPECTED_AXIOS_VERSION) {
  errors.push(`package.json must pin axios via overrides to ${EXPECTED_AXIOS_VERSION}.`);
}

for (const [packagePath, packageData] of lockEntries) {
  if (packagePathPattern('axios').test(packagePath) && packageData.version !== EXPECTED_AXIOS_VERSION) {
    errors.push(`Found axios@${packageData.version} at ${packagePath}; expected ${EXPECTED_AXIOS_VERSION}.`);
  }
}

for (const forbiddenPackage of FORBIDDEN_PACKAGES) {
  for (const [packagePath, packageData] of lockEntries) {
    if (packagePathPattern(forbiddenPackage).test(packagePath)) {
      errors.push(`Found forbidden package ${forbiddenPackage}@${packageData.version} at ${packagePath}.`);
    }
  }
}

if (errors.length > 0) {
  console.error('Dependency guard failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log('Dependency guard passed.');
