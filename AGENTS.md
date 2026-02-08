# EveryNotify Plugin — Agent Guide

This document provides essential information for AI agents working on the EveryNotify plugin. It covers build commands, project structure, code style guidelines, and key conventions.

## Build/Lint/Test Commands

Use these commands to manage the development lifecycle of the plugin:

- `bun install`: Install all project dependencies defined in `package.json`.
- `bun run build`: Compiles the source code into `dist/index.js` and generates type definitions in `dist/index.d.ts`. This command uses `bun build` and `tsc`.
- `bun run typecheck`: Runs the TypeScript compiler in `noEmit` mode to verify type safety across the project.
- `bun test`: Executes the full suite of tests using the built-in Bun test runner.
- `bun test <file>`: Runs tests within a specific file (e.g., `bun test src/__tests__/config.test.ts`).

## Project Structure

The project follows a modular structure where each component has a clear responsibility:

```text
/
├── AGENTS.md           — This guide for AI agents
├── package.json        — Metadata, dependencies, and build/test scripts
├── tsconfig.json       — TypeScript compiler configuration
├── dist/               — Built artifacts (generated via bun run build)
│   ├── index.js        — Compiled plugin entry point
│   └── index.d.ts      — Generated TypeScript declarations
└── src/                — Source code directory
    ├── index.ts        — Plugin entry point; implements event, permission.ask, and tool.execute.before hooks
    ├── types.ts        — Shared TypeScript definitions for config, payloads, and service interfaces
    ├── config.ts       — Logic for loading and merging global and project-level configuration
    ├── dispatcher.ts   — Core notification dispatcher; handles debouncing, timeouts, and parallel service calls
    ├── services/       — Individual notification service implementations
    │   ├── pushover.ts — Pushover notification service
    │   ├── telegram.ts — Telegram bot notification service
    │   ├── slack.ts    — Slack webhook notification service
    │   └── discord.ts  — Discord webhook notification service
    └── __tests__/      — Comprehensive test suite
        ├── config.test.ts      — Tests for configuration loading and merging
        ├── dispatcher.test.ts  — Tests for dispatcher logic, debouncing, and timeouts
        ├── integration.test.ts — End-to-end tests for the plugin hook flow
        └── services/           — Service-specific unit tests (mocked fetch)
```

## Code Style Guidelines

Maintain consistency by following these guidelines:

- **TypeScript**: Strict mode must be enabled (`"strict": true`). Target ES2022 and use ESNext modules.
- **Imports**:
  - Always use relative paths for internal modules (e.g., `import { loadConfig } from "./config"`).
  - Use `import type` when only importing types to minimize runtime overhead.
  - Named exports are preferred over default exports for clarity and better tree-shaking.
- **Naming Conventions**:
  - `camelCase`: Use for variables, functions, and object properties.
  - `PascalCase`: Use for interfaces, types, and classes (e.g., `NotificationPayload`).
  - `UPPER_CASE`: Use for constants and environment variables.
- **Type Safety**:
  - Explicit return types are required for all exported functions.
  - Avoid using `any` unless absolutely necessary (e.g., when interacting with SDK fields that have high variance).
- **Formatting**: No Prettier or ESLint is configured. Follow the existing style: 2-space indentation, trailing commas in objects and arrays.
- **Dependencies**:
  - **NO** runtime dependencies are allowed.
  - Use native `fetch()` for HTTP requests.
  - Use standard Node.js APIs (e.g., `fs`, `path`, `os`) for system interactions.

## Key Conventions

- **Services**:
  - All services must be disabled by default in `DEFAULT_CONFIG`.
  - Users must explicitly opt-in by setting `enabled: true` in their configuration.
- **Service Pattern**:
  - Each service in `src/services/` should export a single `send()` function.
  - This function must match the `ServiceSendFunction` type defined in `src/types.ts`.
- **Configuration**:
  - Config is loaded once at plugin initialization.
  - It merges three levels: Defaults ← Global (`~/.config/opencode/.everynotify.json`) ← Project (`.opencode/.everynotify.json`).
  - Project-level configuration always overrides global and default settings.
- **Error Handling**:
  - Wrap all async operations in `try/catch` blocks.
  - Use `console.error("[EveryNotify] ...")` for logging errors.
  - **NEVER** throw errors from plugin hooks (event, permission.ask, etc.). Log the error and allow the process to continue.
  - Isolation: A failure in one notification service should never prevent other enabled services from attempting their delivery.
- **Dispatching**:
  - Parallelism: Use `Promise.allSettled()` to dispatch to multiple services in parallel. **NEVER** use `Promise.all()`.
  - Debouncing: Implement a 1000ms debounce per event type to prevent notification floods.
  - Timeouts: Apply a strict 5-second timeout to every service call using `AbortController`.
- **Fire-and-Forget**: Notifications should be dispatched in a way that doesn't block the main opencode flow, although the hooks themselves are async.

## Testing

- **Framework**: We use the built-in Bun test runner (`bun test`).
- **Mocking**:
  - Always mock `globalThis.fetch` for all service tests.
  - **NO** real network calls are allowed during test execution.
- **File Naming**: All test files must follow the `*.test.ts` naming convention.
- **Coverage Requirements**:
  - Ensure 100% path coverage for both success and error scenarios in all service implementations.
  - Verify dispatcher logic including debouncing and timeouts.
- **Integration**: Use `integration.test.ts` to verify the end-to-end flow from hook trigger to service dispatch.
- **Execution**:
  - Run all tests: `bun test`
  - Run specific file: `bun test src/__tests__/config.test.ts`
  - Run with coverage: `bun test --coverage`
  - **Note**: Service tests mock `globalThis.fetch`. To avoid interference when running multiple files, it is recommended to run them sequentially if global pollution occurs in the environment.
