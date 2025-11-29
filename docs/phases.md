# LLM Analysis Quiz - Development Phases

This document outlines the phased development of the LLM Analysis Quiz project, a web service that uses large language models to automatically solve quizzes found on web pages.

## Phase 0: Project Setup
- Initialize Node.js project with TypeScript
- Set up package.json with dependencies (Fastify, Puppeteer, Papaparse, etc.)
- Configure tsconfig.json for compilation
- Set up ESLint for code quality
- Create basic project structure (src/, types/, utils/, etc.)
- Add .env.example for environment variables
- Set up git repository with .gitignore

## Phase 1: Basic Server Infrastructure
- Implement Fastify server in src/app/server.ts
- Add health check endpoint (/health)
- Set up request ID middleware
- Configure logging with Pino
- Add environment variable loading and validation
- Implement basic error handling

## Phase 2: Solve Endpoint
- Add /solve POST endpoint in routes.ts
- Implement request validation with Zod
- Add secret key authentication
- Set up basic response structure
- Connect endpoint to core solving logic (placeholder)

## Phase 3: Browser Page Extraction
- Implement Puppeteer browser client (src/core/browser/client.ts)
- Add page extraction logic (page-extractor.ts)
- Wait for #result selector on quiz pages
- Extract text, HTML, and metadata from pages
- Handle timeouts and errors for page loading

## Phase 4: Quiz Parsing
- Implement quiz parser (src/core/parsing/quiz-parser.ts)
- Parse task text from extracted content
- Extract submit URL from page content
- Detect answer type hints (number, string, etc.)
- Extract resource URLs (CSV, JSON, PDF links)

## Phase 5: Data Loading and Parsing
- Implement CSV parser using Papaparse
- Add JSON data parsing with normalization
- Implement PDF text extraction using pdf-parse
- Add data normalization utilities (coerce numbers, etc.)
- Handle different content types and file formats

## Phase 6: Deterministic Solving
- Implement operation parsing from task text (sum, avg, min, max, count, filter-eq)
- Add deterministic solver for common operations
- Apply operations to tabular data
- Return numerical results for solved quizzes

## Phase 7: LLM Advisor Integration
- Integrate Google Gemini API for complex operations
- Build prompts for operation identification
- Parse JSON responses from LLM
- Fallback to LLM when deterministic parsing fails

## Phase 8: Answer Submission
- Implement submit client for posting answers
- Build payload construction with email/secret
- Handle submission responses (correct/incorrect, next URL)
- Parse JSON responses from submit endpoints

## Phase 9: Chain Controller and Time Governor
- Implement quiz chain execution (follow next URLs)
- Add time governor to prevent timeouts
- Track quiz progress and outcomes
- Handle chain completion or failure

## Phase 10: Logging, Error Handling, and Polish
- Enhance error handling with custom error types
- Add comprehensive logging throughout the pipeline
- Implement retry logic for network operations
- Add validation for solve results
- Fix linting issues and type safety
- Add unit tests for core functions
- Optimize performance and add caching where needed

## Current Status
The project implements all phases 0-10 with the following notes:
- Build issues resolved (added @types/papaparse, fixed tsconfig)
- Linting errors present (12 issues to fix)
- Mock server and local testing available
- Ready for deployment to Railway

## Testing
- Use `scripts/run-local-test.sh` for end-to-end testing
- Mock server provides sample quiz for testing
- Test covers full chain: extraction → parsing → solving → submission