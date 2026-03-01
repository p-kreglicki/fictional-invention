# Italian Language Learning Tool with RAG

A web application that lets users upload Italian learning materials (PDFs, URLs, plain text) and generates interactive exercises. The app evaluates user answers on a spectrum (0-100 with rubric) and provides detailed explanations.

## Overview

**Target user:** Italian language learners who have their own study materials and want interactive practice.

### Features

- Upload learning materials (PDF, URL, or plain text)
- Generate three types of exercises:
  - **Multiple choice** - 4 options, 1 correct answer
  - **Fill-in-the-gap** - Sentence with blank placeholder
  - **Single answer** - Open-ended with grading criteria
- Nuanced answer evaluation (0-100 score with rubric breakdown)
- Detailed feedback with grammar corrections and explanations
- Progress tracking and review suggestions

## Tech Stack

| Component | Choice | Notes |
|-----------|--------|-------|
| Framework | Next.js (ixartz boilerplate) | App Router, TypeScript |
| Auth | Clerk | Passwordless, social auth, MFA |
| Database | Drizzle ORM + PGlite (local) / PostgreSQL (prod) | Type-safe queries |
| Vector DB | Pinecone | Semantic search for RAG |
| LLM | Mistral | Exercise generation and evaluation |
| Embeddings | Mistral | 1024-dimension vectors |
| Validation | Zod | Runtime type safety |

## Getting Started

### Prerequisites

- Node.js 22+
- npm

### Installation

```shell
git clone <repository-url>
cd exercise-maker
npm install
```

### Environment Variables

Create a `.env.local` file with the following variables:

```shell
# Clerk Authentication
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=your_clerk_pub_key
CLERK_SECRET_KEY=your_clerk_secret_key

# Pinecone Vector Database
PINECONE_API_KEY=your_pinecone_api_key
PINECONE_INDEX=italian-learning

# Mistral AI
MISTRAL_API_KEY=your_mistral_api_key

# Database (production)
DATABASE_URL=your_postgres_connection_string
```

### Development

Run the development server:

```shell
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

The project uses PGlite for local development, so no database setup is required.

### Database Migrations

Generate migrations after schema changes:

```shell
npm run db:generate
```

Apply migrations:

```shell
npm run db:migrate
```

Explore the database:

```shell
npm run db:studio
```

## Architecture

### Content Ingestion Pipeline

```
Upload → Extract → Chunk → Embed → Store
```

1. **Extract** - Parse content from PDF, URL, or plain text
2. **Chunk** - Split into ~300 token segments with Italian-aware sentence boundaries
3. **Embed** - Generate Mistral embeddings
4. **Store** - Save to Pinecone with metadata and PostgreSQL for persistence

### Exercise Generation (RAG)

```
Query → Retrieve → Generate → Validate
```

1. **Query** - User selects documents and exercise type
2. **Retrieve** - Fetch relevant chunks from Pinecone
3. **Generate** - LLM creates exercise from context
4. **Validate** - Zod schema validation with retry logic

### Answer Evaluation

Scoring rubric (0-100):

| Category | Max Points | Evaluates |
|----------|------------|-----------|
| Accuracy | 40 | Core meaning, vocabulary |
| Grammar | 30 | Conjugations, agreement |
| Fluency | 20 | Word order, idioms |
| Bonus | 10 | Native-like expression |

## Project Structure

```
.
├── src/
│   ├── app/                    # Next.js App Router pages
│   ├── components/             # React components
│   ├── libs/                   # External service clients
│   ├── models/                 # Drizzle database schema
│   ├── validations/            # Zod schemas
│   └── utils/                  # Utilities
├── migrations/                 # Database migrations
├── docs/
│   └── plans/                  # Implementation plans
└── tests/
    ├── e2e/                    # Playwright E2E tests
    └── integration/            # Integration tests
```

## Database Schema

### Entity Relationships

```
┌─────────┐       ┌───────────┐       ┌─────────┐
│  users  │───┬───│ documents │───────│ chunks  │
└─────────┘   │   └───────────┘       └─────────┘
     │        │                            │
     │        │   ┌───────────┐            │
     └────────┼───│ exercises │────────────┘
              │   └───────────┘      (source_chunk_ids)
              │         │
              │   ┌───────────┐
              └───│ responses │
                  └───────────┘
```

### Tables

- **users** - Clerk user shadow table
- **documents** - Uploaded learning materials
- **chunks** - Processed text segments with Pinecone references
- **exercises** - Generated exercises linked to source chunks
- **responses** - User answers with scores and feedback

## Testing

Run unit tests:

```shell
npm run test
```

Run E2E tests:

```shell
npx playwright install  # First time only
npm run test:e2e
```

## Security

- All queries filter by `user_id` for content isolation
- PDF header validation and URL SSRF protection
- File size limits (10MB) and rate limiting (20 req/min)
- User content in delimited prompt sections to prevent injection
- API keys server-side only

## License

MIT

## Acknowledgments

Built on [ixartz/Next-js-Boilerplate](https://github.com/ixartz/Next-js-Boilerplate)
