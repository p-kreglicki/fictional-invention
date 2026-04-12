import { spawn } from 'node:child_process';
import { config } from 'dotenv';

config({ path: '.env.local' });
config({ path: '.env' });

const usePglite = process.env.USE_PGLITE === 'true';
const isWindows = process.platform === 'win32';

const command = usePglite
  ? {
      cmd: isWindows ? 'npx.cmd' : 'npx',
      args: [
        'pglite-server',
        '--db=local.db',
        '--run',
        'npm run dev:next',
        '--include-database-url',
      ],
      modeLabel: 'PGlite',
      targetLabel: 'local.db',
    }
  : {
      cmd: isWindows ? 'npm.cmd' : 'npm',
      args: ['run', 'dev:next'],
      modeLabel: 'PostgreSQL',
      targetLabel: 'DATABASE_URL',
    };

console.log(`Starting dev server with ${command.modeLabel} (${command.targetLabel})`);

const child = spawn(command.cmd, command.args, {
  stdio: 'inherit',
  env: process.env,
});

const forwardSignal = (signal) => {
  if (child.killed) {
    return;
  }

  child.kill(signal);
};

process.on('SIGINT', () => {
  forwardSignal('SIGINT');
});

process.on('SIGTERM', () => {
  forwardSignal('SIGTERM');
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
