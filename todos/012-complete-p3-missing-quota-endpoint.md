---
status: complete
priority: p3
issue_id: "012"
tags: [code-review, agent-native, api, feature]
dependencies: []
---

# Missing Quota Endpoint for Agents

## Problem Statement

There's no dedicated endpoint for agents/clients to check document quota before uploading. Currently, agents must:
- Upload and get 429 error to discover quota is full, OR
- List all documents and count them manually

**Why it matters:** Agents can't proactively manage quota or inform users before hitting limits. Poor developer experience for API consumers.

## Findings

**Source:** Agent-Native Reviewer

**Missing endpoint:** `GET /api/documents/quota`

**Expected response:**
```json
{
  "documentsUsed": 45,
  "documentsMax": 50,
  "canUpload": true
}
```

## Proposed Solutions

### Option 1: Add Dedicated Quota Endpoint (Recommended)
Create `GET /api/documents/quota` endpoint.

**Pros:** Clear purpose, simple implementation
**Cons:** One more endpoint to maintain
**Effort:** Small
**Risk:** Low

### Option 2: Include Quota in List Response
Add quota info to the existing `GET /api/documents` response.

**Pros:** No new endpoint
**Cons:** Pollutes list response, requires fetching all docs to check quota
**Effort:** Small
**Risk:** Low

### Option 3: Include Quota in Upload Success Response
Add quota info to upload response (already recommended separately).

**Pros:** Useful for tracking after uploads
**Cons:** Doesn't help before uploading
**Effort:** Small
**Risk:** Low

## Acceptance Criteria

- [ ] `GET /api/documents/quota` returns current usage and limits
- [ ] Response includes `documentsUsed`, `documentsMax`, `canUpload`
- [ ] Endpoint requires authentication
- [ ] Consider including chunk-level quotas if applicable

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-03-02 | Created from code review | Identified by Agent-Native Reviewer |

## Resources

- PR: feat/url-processing branch
