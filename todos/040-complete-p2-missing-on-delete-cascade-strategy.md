---
status: complete
priority: p2
issue_id: "040"
tags: [code-review, data-integrity, gdpr]
dependencies: []
---

# Missing ON DELETE Cascade Strategy for Responses

## Problem Statement

The foreign keys for `userId` and `exerciseId` in the `responses` table use the default `ON DELETE NO ACTION`. This means deleting a user or exercise is blocked if responses exist, which complicates GDPR compliance (right to deletion).

## Findings

**Location:** `/src/models/Schema.ts` (lines 136-137)

```typescript
userId: uuid('user_id').references(() => usersSchema.id).notNull(),
exerciseId: uuid('exercise_id').references(() => exercisesSchema.id).notNull(),
```

**Current Behavior:**
- Attempting to delete a user with responses: `ERROR: foreign key constraint violation`
- Attempting to delete an exercise with responses: `ERROR: foreign key constraint violation`

**GDPR Impact:** Article 17 (Right to Erasure) requires ability to delete user data upon request. Current schema makes this a multi-step manual process.

**Foreign Key Relationships:**

| Child Table | Parent Table | ON DELETE | Issue |
|-------------|--------------|-----------|-------|
| `responses.user_id` | `users.id` | NO ACTION | User deletion blocked |
| `responses.exercise_id` | `exercises.id` | NO ACTION | Exercise deletion blocked |
| `exercises.user_id` | `users.id` | NO ACTION | User deletion blocked |

## Proposed Solutions

### Option A: CASCADE Delete (Recommended for exercises)

When an exercise is deleted, cascade delete all its responses.

```sql
ALTER TABLE responses
DROP CONSTRAINT responses_exercise_id_exercises_id_fk,
ADD CONSTRAINT responses_exercise_id_exercises_id_fk
  FOREIGN KEY (exercise_id) REFERENCES exercises(id) ON DELETE CASCADE;
```

**Pros:**
- Automatic cleanup
- Simpler deletion logic

**Cons:**
- Data loss is permanent
- May want audit trail

**Effort:** Small (migration)
**Risk:** Medium (requires careful rollout)

### Option B: Soft Delete for Users

Add `deleted_at` timestamp and filter queries instead of hard delete.

**Pros:**
- Data preserved for audit
- Reversible

**Cons:**
- Query complexity
- Storage growth
- Still need hard delete eventually

**Effort:** Medium (schema + query changes)
**Risk:** Medium

### Option C: Explicit Deletion Service

Create a deletion service that handles the multi-step cleanup.

```typescript
async function deleteUser(userId: string) {
  await db.transaction(async (tx) => {
    await tx.delete(responsesSchema).where(eq(responsesSchema.userId, userId));
    await tx.delete(exercisesSchema).where(eq(exercisesSchema.userId, userId));
    await tx.delete(usersSchema).where(eq(usersSchema.id, userId));
  });
}
```

**Pros:**
- Full control over deletion order
- Can add logging/audit

**Cons:**
- Manual process
- Risk of orphaned data

**Effort:** Small (1-2 hours)
**Risk:** Low

## Recommended Action

1. For exercises → responses: Use CASCADE (Option A)
2. For users: Create deletion service (Option C) with proper ordering

This allows exercise cleanup to be automatic while maintaining control over user deletion.

## Technical Details

**Affected Files:**
- `/src/models/Schema.ts`
- New migration file
- New user deletion service
- `/src/libs/ContentIngestion.ts`
- `/src/app/[locale]/api/webhooks/clerk/route.ts`

**Migration Required:** Yes

## Acceptance Criteria

- [x] Exercises can be deleted with their responses
- [x] User deletion service handles all related data
- [x] GDPR deletion requests can be fulfilled without bypassing Pinecone cleanup
- [x] Tests cover webhook retry behavior and strict account-deletion document cleanup

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-03-06 | Created during PR #26 code review | Identified by data-integrity-guardian agent |
| 2026-03-06 | Implemented hybrid deletion strategy with DB cascades for relational children and explicit document cleanup for account deletion | Full user-level cascade was unsafe because `documents` require Pinecone cleanup before row removal. |
| 2026-03-06 | Added account deletion service, strict document cleanup helper, Clerk webhook retry behavior, and migration `0005_overrated_nemesis.sql` | `documents.user_id` must stay `NO ACTION`; exercises, responses, and generation jobs can safely cascade from `users`. |
| 2026-03-06 | Verified with `npm test -- src/libs/ContentIngestion.deleteDocument.test.ts src/libs/ContentIngestion.accountDeletion.test.ts src/libs/AccountDeletion.test.ts 'src/app/[locale]/api/webhooks/clerk/route.test.ts'` and `npm run check:types` | The new flow fails closed when cleanup fails and remains idempotent when the local user is already absent. |

## Resources

- PR #26: https://github.com/p-kreglicki/fictional-invention/pull/26
- GDPR Article 17: https://gdpr-info.eu/art-17-gdpr/
