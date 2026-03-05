import { afterEach, describe, expect, it, vi } from 'vitest';

const REQUIRED_ENV = {
  CLERK_SECRET_KEY: 'sk_test_clerk',
  DATABASE_URL: 'postgres://postgres:postgres@localhost:5432/exercise_maker',
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_test_clerk',
};

const ORIGINAL_ENV = process.env;

function resetEnv(overrides: Record<string, string | undefined>) {
  process.env = {
    ...ORIGINAL_ENV,
    ...REQUIRED_ENV,
    ...overrides,
  };
}

describe('Env durable dispatch config', () => {
  afterEach(() => {
    process.env = ORIGINAL_ENV;
    vi.resetModules();
  });

  it('allows production without dispatch secrets', async () => {
    resetEnv({
      NODE_ENV: 'production',
      CRON_SECRET: undefined,
      GENERATION_DISPATCH_TOKEN: undefined,
    });

    await expect(import('./Env')).resolves.toMatchObject({
      Env: expect.objectContaining({
        NODE_ENV: 'production',
        CRON_SECRET: undefined,
        GENERATION_DISPATCH_TOKEN: undefined,
      }),
    });
  });

  it('allows development without dispatch secrets', async () => {
    resetEnv({
      NODE_ENV: 'development',
      CRON_SECRET: undefined,
      GENERATION_DISPATCH_TOKEN: undefined,
    });

    await expect(import('./Env')).resolves.toMatchObject({
      Env: expect.objectContaining({
        NODE_ENV: 'development',
      }),
    });
  });
});
