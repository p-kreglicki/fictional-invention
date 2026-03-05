---
status: complete
priority: p3
issue_id: "030"
tags: [code-review, documentation, quality]
dependencies: []
---

# README uses machine-local absolute links for vercel.json

## Problem Statement

The PR adds Markdown links in `README.md` that point to `/Users/piotrkreglicki/Projects/exercise-maker/vercel.json`. Those links only work on the author’s machine and will be broken on GitHub, in the repository browser, and for every other developer.

**Why it matters:** The new deployment instructions are meant for shared consumption. Broken links make the setup guide harder to follow and reduce confidence in the documentation.

## Findings

- The new link at [`README.md`](/Users/piotrkreglicki/Projects/exercise-maker/README.md:81) points to an absolute local filesystem path.
- The deployment step at [`README.md`](/Users/piotrkreglicki/Projects/exercise-maker/README.md:125) repeats the same machine-local link.
- Existing repository documentation is otherwise written for GitHub consumption, so these links are inconsistent with the rest of the README.

## Proposed Solutions

### Option 1: Use a relative repo link (Recommended)

**Approach:** Replace the absolute path with a relative Markdown link such as `[vercel.json](./vercel.json)` or a plain code reference `` `vercel.json` ``.

**Pros:**
- Works on GitHub and for every collaborator.
- Minimal change.

**Cons:**
- None.

**Effort:** Trivial

**Risk:** Low

---

### Option 2: Link to the GitHub blob URL

**Approach:** Use the repository’s web URL for the file.

**Pros:**
- Always clickable in GitHub-rendered docs.

**Cons:**
- Hard-codes repository hosting details.

**Effort:** Trivial

**Risk:** Low

## Recommended Action

Replace machine-local filesystem links with repo-relative Markdown links to `./vercel.json`.

## Technical Details

**Affected files:**
- `README.md`

**Related components:**
- Deployment/setup documentation

**Database changes (if any):**
- No

## Resources

- **PR:** #24
- **Branch:** `codex/fix-generation-dispatch-durability`

## Acceptance Criteria

- [x] README links resolve for collaborators outside the author’s machine
- [x] `vercel.json` is referenced using a repo-relative path or plain code formatting

## Work Log

### 2026-03-05 - Review finding

**By:** Codex (ce-review)

**Actions:**
- Audited the README additions in PR #24.
- Verified the new `vercel.json` links point to an absolute local filesystem path.

**Learnings:**
- Repository docs should use shared paths, not author-specific filesystem locations.

### 2026-03-05 - README links corrected

**By:** Codex

**Actions:**
- Replaced the machine-local `vercel.json` links in [`README.md`](/Users/piotrkreglicki/Projects/exercise-maker/README.md) with repo-relative Markdown links.
- Verified the documentation change alongside the durable-dispatch follow-up tests and type-check run.

**Learnings:**
- Shared repository docs should avoid Codex-local absolute paths even when the authoring environment supports them.
