# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Install dependencies
npm install

# Development (watch mode)
npm run start:dev

# Build
npm run build

# Run tests
npm run test

# Run a single test file
npx jest src/app.controller.spec.ts

# Run tests with coverage
npm run test:cov

# E2E tests
npm run test:e2e

# Lint (auto-fixes)
npm run lint

# Format
npm run format
```

## Architecture

This is a **NestJS** backend application (TypeScript). The project is currently a fresh scaffold — the core NestJS module/controller/service pattern is in place but no domain logic has been added yet.

**NestJS patterns used here:**
- Modules (`@Module`) wire together controllers and providers. `AppModule` is the root.
- Controllers (`@Controller`) handle HTTP routing via decorators (`@Get`, `@Post`, etc.).
- Services (`@Injectable` providers) contain business logic and are injected into controllers via constructor DI.
- The entry point is `src/main.ts`, which bootstraps `AppModule` and listens on `PORT` (default 3000).

**TypeScript config notes:**
- `noImplicitAny` is disabled — types can be inferred loosely.
- `emitDecoratorMetadata` and `experimentalDecorators` are enabled (required for NestJS DI).
- Module resolution is `nodenext`.

Unit tests (`.spec.ts`) live alongside source files in `src/`. E2E tests are in `test/` and use a separate Jest config (`test/jest-e2e.json`).
