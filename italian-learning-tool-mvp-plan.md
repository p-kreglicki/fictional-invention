# Italian Language Learning Tool with RAG - MVP Plan

## Project Overview
A web app that lets users upload Italian language learning materials (PDFs, URLs, plain text) and generates interactive exercises (multiple choice, fill-in-the-gap, single answer) from that content. The app evaluates user answers on a spectrum (partial credit, accuracy vs fluency) and provides explanations for incorrect answers.

---

## Tech Stack

| Component | Choice |
|-----------|--------|
| Boilerplate | ixartz/Next-js-Boilerplate (12.6k stars, MIT license) |
| Authentication | Clerk (included with boilerplate) |
| Database | Drizzle ORM + PGlite locally, PostgreSQL in production |
| Vector database | Pinecone (free tier: 1 index, 100k vectors) |
| LLM | Mistral (free Experiment tier) |
| Embeddings | Mistral embedding endpoint |

---

## Phase 1: Project Setup & Infrastructure
**Goal:** Get the foundation running with auth, database, and external service connections.

1. Clone ixartz/Next-js-Boilerplate and run locally
2. Set up Clerk account and configure authentication
3. Create Pinecone account and configure index
4. Set up Mistral API access (Experiment tier)
5. Define data models:
   - Users (handled by Clerk)
   - Uploaded content (source URL/file, processing status, user reference)
   - Content chunks (text, embedding reference, source document ID, chunk position)
   - Exercises (type, question, correct answer, source chunk references, user reference)
   - User responses (user answer, evaluation result, timestamp)
6. Set up basic file/URL upload endpoint

---

## Phase 2: Content Ingestion Pipeline
**Goal:** Accept user content and prepare it for RAG retrieval.

1. Build content extractors:
   - PDF: use pdf-parse or similar library
   - URL: fetch and extract text content
   - Plain text: direct input
2. Implement chunking strategy:
   - Start with ~300 token chunks
   - Include overlap (e.g., 50 tokens) to preserve context at boundaries
   - Store chunk position metadata for potential re-ordering
3. Generate embeddings via Mistral embedding endpoint
4. Store chunks in Pinecone with metadata:
   - Source document ID
   - Chunk position
   - Content type
   - User ID
5. Update document status in database (processing → ready)

---

## Phase 3: Exercise Generation Flow
**Goal:** Create exercises from user's uploaded content.

1. User selects:
   - Which uploaded content to use
   - Exercise type (multiple choice, fill-in-gap, single answer)
   - Optionally: topic focus or difficulty
2. Retrieve relevant chunks from Pinecone based on content selection
3. Prompt Mistral to generate exercises:
   - Include retrieved chunks as context
   - Specify exercise type and format
   - Request correct answer and plausible distractors (for multiple choice)
4. Parse and validate LLM response
5. Store generated exercises with:
   - Correct answers
   - Source chunk references
   - Exercise metadata
6. Present exercises to user

---

## Phase 4: Answer Evaluation Flow
**Goal:** Evaluate user answers with nuanced feedback.

1. User submits answer
2. Retrieve fresh context from Pinecone (separate retrieval optimized for evaluation)
3. Prompt Mistral with:
   - User's answer
   - Correct answer
   - Retrieved context
   - Instructions for spectrum grading:
     - Grammatical accuracy
     - Partial credit for close answers
     - Fluency considerations
4. Parse evaluation result:
   - Score or rating
   - Explanation of errors (if any)
   - Relevant grammar rules applied

   **Note:** This is where you'll want your curated Italian grammar reference materials. The quality of explanations depends heavily on Mistral having good context about *why* something is wrong. Initially you're relying on Mistral's built-in knowledge, but adding a grammar corpus to retrieve against will improve evaluation quality significantly.

5. Store evaluation result
6. Display feedback to user with explanation

---

## Phase 5: Frontend & UX
**Goal:** Build the user-facing interface.

1. Upload interface:
   - File upload (PDF)
   - URL input
   - Plain text input
   - Processing status indicator
2. Content library:
   - List of uploaded materials
   - Status (processing/ready)
   - Delete option
3. Exercise generation:
   - Content selection
   - Exercise type selection
   - Generate button
4. Exercise presentation:
   - Clean question display
   - Input mechanism per exercise type
   - Submit button
5. Feedback display:
   - Score/rating visualization
   - Explanation text
   - Correct answer reveal
6. Progress history:
   - Past exercises attempted
   - Scores over time
   - Filter by content source

---

## Key Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Mistral free tier rate limits slow development | Batch requests where possible; cache generated exercises; implement retry logic with backoff |
| Chunking strategy produces poor exercise quality | Start conservative (300 tokens), iterate based on results; log chunk boundaries to debug |
| Exercise generation produces malformed output | Define strict output schema; implement parsing validation; retry on failure |
| Evaluation explanations lack depth without grammar corpus | Acceptable for MVP; plan to add curated grammar reference in V2 |
| Pinecone free tier limits (100k vectors) | More than enough for MVP; monitor usage |

---

## Out of Scope for MVP
- Pre-populated grammar/vocabulary corpus (select from list)
- Audio or pronunciation exercises
- Spaced repetition / learning scheduling
- Multiple language support
- Social features / leaderboards
