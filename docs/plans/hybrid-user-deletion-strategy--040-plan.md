# Implement hybrid user-deletion strategy for `040`

## Summary

Fix `040` with a hybrid deletion design:

- Use DB cascades only for purely relational, user-owned records.
- Use an explicit user-deletion service for documents because document deletion has external Pinecone side effects.
- Make the Clerk `user.deleted` webhook fail closed on cleanup failure so Clerk retries instead of leaving a partially deleted account.

This plan deliberately does **not** use `ON DELETE CASCADE` for `documents.userId`, because that would bypass Pinecone cleanup.

## Key changes

### 1. Database delete semantics

Add a migration and schema updates so these relations cascade:

- `exercises.userId -> users.id`: `ON DELETE CASCADE`
- `responses.exerciseId -> exercises.id`: `ON DELETE CASCADE`
- `responses.userId -> users.id`: `ON DELETE CASCADE`
- `generationJobs.userId -> users.id`: `ON DELETE CASCADE`

Keep these as-is:

- `documents.userId -> users.id`: keep `NO ACTION`
- `chunks.documentId -> documents.id`: keep existing `ON DELETE CASCADE`

Reason:
- `documents` require external cleanup, so the DB must not delete them behind the application’s back.
- `exercises`, `responses`, and `generationJobs` are purely relational and safe to remove with DB cascade.

### 2. Add an explicit user-deletion service

Introduce a dedicated internal service, e.g. `deleteUserAccountByClerkId(clerkId: string)`, with a structured result like:

- `deleted`
- `not_found`
- `failed`

Behavior:

1. Load the local user by Clerk ID.
2. If no local user exists, return `not_found` and treat that as webhook-idempotent success.
3. Load all document IDs for that user.
4. Delete documents one by one through a **strict account-deletion document cleanup path**.
5. Only after all documents are removed successfully, delete the user row.
6. Let DB cascades remove exercises, responses, and generation jobs automatically.

Use sequential document deletion, not parallel deletion, to keep failure handling deterministic and simpler.

### 3. Add a strict document-deletion path for account deletion

Do **not** reuse the current user-facing `deleteDocument()` semantics unchanged for account deletion, because it returns success even when Pinecone cleanup fails.

Add a dedicated internal helper for account deletion, separate from the existing public delete path. Recommended behavior:

1. Load the document and its Pinecone IDs.
2. Delete Pinecone vectors first.
3. If Pinecone deletion fails, stop and return failure without deleting the DB row.
4. If Pinecone deletion succeeds, delete the document row from Postgres.
5. If DB deletion fails after Pinecone success, return failure so the webhook retries.

This is acceptable here because the Clerk account is already being deleted, so preserving “document still visible to the same user” is less important than preventing orphaned vectors. The existing user-facing `deleteDocument(documentId, userId)` API should remain unchanged.

### 4. Update Clerk webhook behavior

Update the `user.deleted` branch in the Clerk webhook to call the new deletion service instead of directly deleting `users`.

Webhook behavior:

- `not_found`: return `200`
- `deleted`: return `200`
- `failed`: log an error and return `500` so Clerk retries

Also update the misleading “Cascade delete will handle related records” comment to reflect the hybrid strategy.

## Test plan

Add focused tests for the new behavior:

- Webhook test: deleting a user with dependent exercises/responses/jobs succeeds through the service and returns `200`.
- Webhook test: if document cleanup fails, webhook returns `500` and user row is not deleted.
- Service test: `not_found` is treated as idempotent success.
- Service test: documents are deleted before user-row deletion.
- Service test: user deletion removes relational children via cascade.
- Account-deletion document helper test: Pinecone failure leaves the DB document intact.
- Account-deletion document helper test: successful Pinecone deletion followed by DB delete removes the document cleanly.

Keep existing user-facing document deletion tests unchanged unless refactoring requires shared internals.

## Important interface changes

- New internal deletion service for Clerk-driven account removal.
- New internal strict document-cleanup helper for account deletion.
- No change to public route contracts.
- No change to the existing user-facing `deleteDocument(documentId, userId): Promise<boolean>` API unless needed internally.

## Assumptions and defaults

- Chosen default: fail closed on account-deletion cleanup failure and rely on Clerk webhook retries.
- Chosen default: keep `documents.userId` as `NO ACTION` to enforce explicit cleanup.
- Chosen default: sequential document cleanup during account deletion.
- Assumption: Clerk `user.deleted` means the upstream auth account is already gone, so strict account-deletion cleanup may prioritize preventing Pinecone orphans over preserving temporary in-app document visibility.
- Assumption: the database is still small enough that adding the FK migration now is low risk and does not require a special backfill strategy.
