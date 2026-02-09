# EveryNotify Plugin — Agent Guide

Multi-service notification plugin for opencode. Zero runtime dependencies. Pushover, Telegram, Slack, Discord.

## Build/Lint/Test Commands

- `bun install` — Install dependencies.
- `bun run build` — Compile to `dist/index.js` + generate `dist/index.d.ts` (uses `bun build` then `tsc --emitDeclarationOnly`).
- `bun run typecheck` — Type-check only (`tsc --noEmit`). Run this before committing.
- `bun test` — Run all tests.
- `bun test src/__tests__/config.test.ts` — Run a single test file.
- `bun test --coverage` — Run with coverage report.

No linter or formatter is configured. No CI pipeline to worry about beyond typecheck + test.

## Project Structure

```
src/
├── index.ts        — Plugin entry point: event, permission.ask, tool.execute.before hooks
├── types.ts        — All shared types (config interfaces, payload, ServiceSendFunction)
├── config.ts       — Config loading (defaults ← global ← project), validation
├── dispatcher.ts   — Dispatch engine: delay-and-replace queue, timeouts, parallel sends
├── logger.ts       — File-based logger with 7-day rotation
├── services/
│   ├── pushover.ts — Pushover (form-urlencoded, 1024 char limit)
│   ├── telegram.ts — Telegram Bot API (JSON, HTML parse_mode, 4096 char limit)
│   ├── slack.ts    — Slack webhook (JSON, mrkdwn, 40000 char limit)
│   └── discord.ts  — Discord webhook (JSON, markdown, 2000 char limit, rate-limit aware)
└── __tests__/
    ├── config.test.ts       — Config loading, merging, validation
    ├── dispatcher.test.ts   — Delay queue, flush, truncation, error isolation
    ├── integration.test.ts  — Full plugin lifecycle with mocked services
    ├── exit-flush.test.ts   — Process exit flush behavior
    ├── logger.test.ts       — File logging, rotation, cleanup
    └── services/            — Per-service unit tests (mocked fetch)
```

## Code Style

**TypeScript**: Strict mode (`"strict": true`), target ES2022, module ESNext, moduleResolution bundler.

**Imports**:

- Relative paths for internal modules: `import { loadConfig } from "./config"`.
- `import type` for type-only imports: `import type { NotificationPayload } from "./types"`.
- Named exports preferred. `index.ts` is the sole exception (exports both default and named for SDK compatibility).

**Naming**:

- `camelCase` — variables, functions, properties.
- `PascalCase` — interfaces, types, type aliases (e.g., `NotificationPayload`, `EventType`).
- `UPPER_CASE` — constants (e.g., `DEFAULT_CONFIG`, `IMMEDIATE_EVENTS`).

**Formatting**: 2-space indentation, trailing commas, double quotes for strings. No Prettier/ESLint — match surrounding code.

**Type Safety**:

- Explicit return types on all exported functions.
- `any` only for opencode SDK boundaries where types have high variance (e.g., `event.properties`, `msg.parts`). Never use `as any` to suppress errors in application code.
- Never use `@ts-ignore` or `@ts-expect-error`.

**Dependencies**: Zero runtime dependencies. Use native `fetch()` for HTTP. Use `fs`, `path`, `os` from Node.js stdlib.

## Key Conventions

### Services

- Each service exports a single `send(config, payload, signal)` function matching `ServiceSendFunction`.
- All services disabled by default in `DEFAULT_CONFIG` — users opt in via `enabled: true`.
- Each service handles its own message formatting and character limit truncation internally.
- Service-level `truncateFrom` overrides the global setting. Use `truncate()` from `dispatcher.ts`.

### Adding a New Service

1. Create `src/services/<name>.ts` with a `send()` function matching `ServiceSendFunction`.
2. Add the config interface to `src/types.ts` and add the field to `EverynotifyConfig`.
3. Add default (disabled) config to `DEFAULT_CONFIG` in `src/config.ts`.
4. Add validation rules to `validateConfig()` in `src/config.ts`.
5. Register in `createDispatcher()` in `src/dispatcher.ts` (follow existing if-block pattern).
6. Add `deepMerge` handling in `src/config.ts`.
7. Add tests: `src/__tests__/services/<name>.test.ts` (mock `globalThis.fetch`, no real HTTP).

### Configuration

- Merge order: `DEFAULT_CONFIG` ← `~/.config/opencode/.everynotify.json` ← `.opencode/.everynotify.json`.
- `validateConfig()` runs after merge — disables services with missing required credentials and emits warnings.
- Config is loaded once at plugin init, never reloaded.

### Error Handling

- **NEVER** throw from plugin hooks (`event`, `permission.ask`, `tool.execute.before`). Catch, log via `logger.error()`, continue.
- **NEVER** use `Promise.all()` for multi-service dispatch. Always `Promise.allSettled()` — one service failing must not block others.
- Use `logger.error()` / `logger.warn()` for file-based logging (not `console.error`, except in logger.ts itself as a last resort).
- 5-second timeout per service call via `AbortController`.

### Dispatching

- Delay-and-replace queue (default 120s): delayed events (`complete`, `subagent_complete`, `question`) are held; if a new event of the same type arrives, the old one is replaced and the timer resets.
- Immediate events (`error`, `permission`) bypass delay, with 500ms dedup to prevent dual-hook duplicates.
- `flush()` sends all pending delayed events immediately — used by the `beforeExit` handler to reduce message loss on process exit.
- `delay: 0` disables the queue entirely (all events send immediately).

## Testing

**Framework**: Bun test runner (`bun:test`). Imports: `describe`, `test`/`it`, `expect`, `mock`, `spyOn`, `beforeEach`, `beforeAll`, `afterAll`.

**Mocking pattern**:

- Service tests: mock `globalThis.fetch` — no real network calls ever.
- Integration/dispatcher tests: use `mock.module()` to replace service send functions.
- Config tests: use `spyOn(os, "homedir")` with temp directories to isolate from real filesystem.
- Always `mockClear()` in `beforeEach` to prevent cross-test pollution.

**Test file conventions**:

- Files: `*.test.ts` in `src/__tests__/` or `src/__tests__/services/`.
- Each test file has `beforeAll`/`afterAll` for setup/teardown of temp dirs and spies.
- Async delay tests use explicit `setTimeout` waits and extended timeouts (e.g., `}, 5000`).

**What to verify**:

- Success and error paths for every service.
- Dispatcher: delay queue, flush, replacement, immediate bypass, dedup, error isolation, timeouts.
- Config: merging precedence, validation warnings, disabled service handling.
- Integration: full hook → dispatch → service call flow with mocked SDK client.
