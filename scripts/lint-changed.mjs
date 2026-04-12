import { execFileSync, spawnSync } from 'node:child_process';

const lintableFilePattern = /\.(?:[cm]?[jt]sx?|jsonc?)$/u;

function readArg(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1) {
    return null;
  }

  return process.argv[index + 1] ?? null;
}

const base = readArg('--base') ?? process.env.BASE_SHA ?? 'origin/main';
const head = readArg('--head') ?? process.env.HEAD_SHA ?? 'HEAD';

const changedFiles = execFileSync(
  'git',
  ['diff', '--name-only', '--diff-filter=ACMR', `${base}...${head}`],
  { encoding: 'utf8' },
)
  .split('\n')
  .map(file => file.trim())
  .filter(file => file.length > 0)
  .filter(file => lintableFilePattern.test(file));

if (changedFiles.length === 0) {
  console.log(`No lintable changed files found between ${base} and ${head}.`);
  process.exit(0);
}

console.log(`Linting ${changedFiles.length} changed file(s) between ${base} and ${head}.`);

const result = spawnSync('npx', ['eslint', '--no-warn-ignored', ...changedFiles], {
  stdio: 'inherit',
});

process.exit(result.status ?? 1);
