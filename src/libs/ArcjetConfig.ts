import { NextResponse } from 'next/server';
import { Env } from '@/libs/Env';
import { logger } from '@/libs/Logger';

export function getMissingArcjetConfigResponse(input: { area: string }) {
  if (Env.NODE_ENV === 'production') {
    logger.error(`${input.area} rate limiting unavailable - ARCJET_KEY not configured`);
    return NextResponse.json(
      { error: 'SERVICE_UNAVAILABLE', message: 'Service temporarily unavailable' },
      { status: 503 },
    );
  }

  logger.warn(`${input.area} rate limiting disabled - ARCJET_KEY not configured`);
  return null;
}
