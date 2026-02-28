import type { WebhookEvent } from '@clerk/nextjs/server';
import { eq } from 'drizzle-orm';
import { headers } from 'next/headers';
import { Webhook } from 'svix';
import { db } from '@/libs/DB';
import { Env } from '@/libs/Env';
import { logger } from '@/libs/Logger';
import { usersSchema } from '@/models/Schema';

export async function POST(req: Request) {
  const WEBHOOK_SECRET = Env.CLERK_WEBHOOK_SECRET;

  if (!WEBHOOK_SECRET) {
    logger.error('Missing CLERK_WEBHOOK_SECRET environment variable');
    return new Response('Webhook secret not configured', { status: 500 });
  }

  // Get Svix headers
  const headerPayload = await headers();
  const svixId = headerPayload.get('svix-id');
  const svixTimestamp = headerPayload.get('svix-timestamp');
  const svixSignature = headerPayload.get('svix-signature');

  if (!svixId || !svixTimestamp || !svixSignature) {
    logger.warn('Missing Svix headers in webhook request');
    return new Response('Missing Svix headers', { status: 400 });
  }

  // Get and verify payload
  const payload = await req.json();
  const body = JSON.stringify(payload);

  const wh = new Webhook(WEBHOOK_SECRET);
  let evt: WebhookEvent;

  try {
    evt = wh.verify(body, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    }) as WebhookEvent;
  } catch (err) {
    logger.error('Webhook verification failed', { error: err });
    return new Response('Invalid signature', { status: 400 });
  }

  // Handle events
  switch (evt.type) {
    case 'user.created': {
      const { id } = evt.data;

      // Check if user already exists (idempotency)
      const existing = await db.query.usersSchema.findFirst({
        where: eq(usersSchema.clerkId, id),
      });

      if (!existing) {
        await db.insert(usersSchema).values({
          clerkId: id,
        });
        logger.info('Created user from webhook', { clerkId: id });
      } else {
        logger.debug('User already exists, skipping', { clerkId: id });
      }
      break;
    }

    case 'user.deleted': {
      const { id } = evt.data;
      if (id) {
        // Cascade delete will handle related records
        await db.delete(usersSchema).where(eq(usersSchema.clerkId, id));
        logger.info('Deleted user from webhook', { clerkId: id });
      }
      break;
    }

    default:
      logger.debug('Unhandled webhook event', { type: evt.type });
  }

  return new Response('Webhook processed', { status: 200 });
}
