/**
 * Integration Tests for EveryNotify Plugin
 *
 * Tests the full plugin lifecycle:
 * - Plugin initialization with mocked PluginInput
 * - All 3 hooks (event, permission.ask, tool.execute.before)
 * - Session enrichment (client.session.get/messages)
 * - Event type detection and dispatch
 * - Error handling (unknown events, disabled services)
 */

import {
  describe,
  test,
  expect,
  mock,
  beforeEach,
  beforeAll,
  afterAll,
  spyOn,
} from "bun:test";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import type { NotificationPayload } from "../types";

let tempDir: string;
let fakeHomeDir: string;
let homedirSpy: ReturnType<typeof spyOn>;
let mockPushoverSend: any;
let mockTelegramSend: any;
let mockSlackSend: any;
let mockDiscordSend: any;
let EverynotifyPlugin: any;

describe("EverynotifyPlugin Integration", () => {
  beforeAll(async () => {
    fakeHomeDir = fs.mkdtempSync(path.join(os.tmpdir(), "everynotify-home-"));
    homedirSpy = spyOn(os, "homedir").mockReturnValue(fakeHomeDir);

    tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "everynotify-integration-"),
    );
    const configDir = path.join(tempDir, ".opencode");
    fs.mkdirSync(configDir, { recursive: true });

    const testConfig = {
      pushover: {
        enabled: true,
        token: "test-token",
        userKey: "test-user",
        priority: 0,
      },
      telegram: {
        enabled: true,
        botToken: "test-bot-token",
        chatId: "test-chat-id",
      },
      slack: {
        enabled: true,
        webhookUrl: "https://hooks.slack.com/test",
      },
      discord: {
        enabled: true,
        webhookUrl: "https://discord.com/api/webhooks/test",
      },
    };

    fs.writeFileSync(
      path.join(configDir, ".everynotify.json"),
      JSON.stringify(testConfig),
    );

    mockPushoverSend = mock(() => Promise.resolve());
    mockTelegramSend = mock(() => Promise.resolve());
    mockSlackSend = mock(() => Promise.resolve());
    mockDiscordSend = mock(() => Promise.resolve());

    mock.module("../services/pushover", () => ({
      send: mockPushoverSend,
    }));

    mock.module("../services/telegram", () => ({
      send: mockTelegramSend,
    }));

    mock.module("../services/slack", () => ({
      send: mockSlackSend,
    }));

    mock.module("../services/discord", () => ({
      send: mockDiscordSend,
    }));

    mock.module("../logger", () => ({
      createLogger: mock(() => ({
        error: mock(() => {}),
        warn: mock(() => {}),
      })),
      getLogFilePath: mock(() => "/tmp/test.log"),
    }));

    const indexModule = await import("../index");
    EverynotifyPlugin = indexModule.default;
  });

  afterAll(() => {
    homedirSpy.mockRestore();
    if (tempDir) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    if (fakeHomeDir) {
      fs.rmSync(fakeHomeDir, { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    mockPushoverSend.mockClear();
    mockTelegramSend.mockClear();
    mockSlackSend.mockClear();
    mockDiscordSend.mockClear();
  });

  /**
   * Helper to create mock PluginInput
   */
  function createMockPluginInput(
    options: {
      parentID?: string | null;
      messages?: any[];
    } = {},
  ) {
    return {
      client: {
        session: {
          get: mock(() =>
            Promise.resolve({
              data: {
                id: "test-session-id",
                parentID: options.parentID ?? null,
              },
              error: undefined,
            }),
          ),
          messages: mock(() =>
            Promise.resolve({
              data: (options.messages ?? []).map((msg: any) => ({
                info: {
                  role: msg.role,
                  time: { created: msg.timestamp || Date.now() },
                },
                parts: [],
              })),
              error: undefined,
            }),
          ),
        },
      },
      directory: tempDir,
    };
  }

  test("plugin returns hooks object with correct shape", async () => {
    const mockInput = createMockPluginInput();

    const hooks = await EverynotifyPlugin(mockInput);

    expect(hooks).toHaveProperty("event");
    expect(typeof hooks.event).toBe("function");
    expect(typeof hooks["permission.ask"]).toBe("function");
    expect(typeof hooks["tool.execute.before"]).toBe("function");
  });

  test("event hook: session.idle → dispatch 'complete' event", async () => {
    const mockInput = createMockPluginInput({
      messages: [
        { role: "user", timestamp: Date.now() - 60000 }, // 1 minute ago
      ],
    });

    const hooks = await EverynotifyPlugin(mockInput);

    // Simulate session.idle event
    await hooks.event({
      event: {
        type: "session.idle",
        properties: { sessionID: "test-session-123" },
      },
    });

    // Wait for async dispatch
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Verify all services were called
    expect(mockPushoverSend).toHaveBeenCalledTimes(1);
    expect(mockTelegramSend).toHaveBeenCalledTimes(1);
    expect(mockSlackSend).toHaveBeenCalledTimes(1);
    expect(mockDiscordSend).toHaveBeenCalledTimes(1);

    // Verify payload structure
    const payload = mockPushoverSend.mock.calls[0][1] as NotificationPayload;
    expect(payload.eventType).toBe("complete");
    expect(payload.title).toContain("[complete]");
    expect(payload.message).toContain("elapsed:");
    expect(payload.projectName).toBeTruthy();
    expect(payload.sessionID).toBe("test-session-123");
    expect(payload.elapsedSeconds).toBeGreaterThan(0);
  });

  test("event hook: session.idle with subagent → dispatch 'subagent_complete' event", async () => {
    const mockInput = createMockPluginInput({
      parentID: "parent-session-id", // Subagent has parentID
      messages: [
        { role: "user", timestamp: Date.now() - 30000 }, // 30 seconds ago
      ],
    });

    const hooks = await EverynotifyPlugin(mockInput);

    // Simulate session.idle event
    await hooks.event({
      event: {
        type: "session.idle",
        properties: { sessionID: "subagent-session-123" },
      },
    });

    // Wait for async dispatch
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Verify dispatch occurred
    expect(mockPushoverSend).toHaveBeenCalledTimes(1);

    // Verify event type is adjusted for subagent
    const payload = mockPushoverSend.mock.calls[0][1] as NotificationPayload;
    expect(payload.eventType).toBe("subagent_complete");
    expect(payload.title).toContain("[subagent_complete]");
  });

  test("event hook: session.error → dispatch 'error' event with error message", async () => {
    const mockInput = createMockPluginInput();

    const hooks = await EverynotifyPlugin(mockInput);

    // Simulate session.error event
    await hooks.event({
      event: {
        type: "session.error",
        properties: {
          sessionID: "test-session-456",
          error: {
            name: "UnknownError",
            data: { message: "Unhandled exception in task" },
          },
        },
      },
    });

    // Wait for async dispatch
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Verify dispatch occurred
    expect(mockPushoverSend).toHaveBeenCalledTimes(1);

    // Verify payload contains error message
    const payload = mockPushoverSend.mock.calls[0][1] as NotificationPayload;
    expect(payload.eventType).toBe("error");
    expect(payload.title).toContain("[error]");
    expect(payload.message).toContain("Unhandled exception in task");
  });

  test("event hook: permission.updated → dispatch 'permission' event", async () => {
    const mockInput = createMockPluginInput();

    const hooks = await EverynotifyPlugin(mockInput);

    // Simulate permission.updated event
    await hooks.event({
      event: {
        type: "permission.updated",
        properties: { sessionID: "test-session-789" },
      },
    });

    // Wait for async dispatch
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Verify dispatch occurred
    expect(mockPushoverSend).toHaveBeenCalledTimes(1);

    // Verify payload
    const payload = mockPushoverSend.mock.calls[0][1] as NotificationPayload;
    expect(payload.eventType).toBe("permission");
    expect(payload.title).toContain("[permission]");
  });

  test("permission.ask hook → dispatch 'permission' event", async () => {
    const mockInput = createMockPluginInput();

    const hooks = await EverynotifyPlugin(mockInput);

    // Call permission.ask hook
    await hooks["permission.ask"]({}, { status: "ask" });

    // Wait for async dispatch
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Verify dispatch occurred
    expect(mockPushoverSend).toHaveBeenCalledTimes(1);

    // Verify payload
    const payload = mockPushoverSend.mock.calls[0][1] as NotificationPayload;
    expect(payload.eventType).toBe("permission");
    expect(payload.title).toContain("[permission]");
    expect(payload.sessionID).toBeNull(); // permission.ask hook has no sessionID
  });

  test("tool.execute.before hook: tool='question' → dispatch 'question' event", async () => {
    const mockInput = createMockPluginInput();

    const hooks = await EverynotifyPlugin(mockInput);

    // Call tool.execute.before hook with question tool
    await hooks["tool.execute.before"](
      { tool: "question", sessionID: "test", callID: "test" },
      { args: {} },
    );

    // Wait for async dispatch
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Verify dispatch occurred
    expect(mockPushoverSend).toHaveBeenCalledTimes(1);

    // Verify payload
    const payload = mockPushoverSend.mock.calls[0][1] as NotificationPayload;
    expect(payload.eventType).toBe("question");
    expect(payload.title).toContain("[question]");
  });

  test("tool.execute.before hook: tool='other' → no dispatch", async () => {
    const mockInput = createMockPluginInput();

    const hooks = await EverynotifyPlugin(mockInput);

    // Call tool.execute.before hook with non-question tool
    await hooks["tool.execute.before"](
      { tool: "bash", sessionID: "test", callID: "test" },
      { args: {} },
    );

    // Wait for async dispatch
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Verify NO dispatch occurred
    expect(mockPushoverSend).toHaveBeenCalledTimes(0);
    expect(mockTelegramSend).toHaveBeenCalledTimes(0);
    expect(mockSlackSend).toHaveBeenCalledTimes(0);
    expect(mockDiscordSend).toHaveBeenCalledTimes(0);
  });

  test("event hook: unknown event type → no dispatch, no error", async () => {
    const mockInput = createMockPluginInput();

    const hooks = await EverynotifyPlugin(mockInput);

    // Mock console.error to verify no error logged
    const originalError = console.error;
    const errorLogs: any[] = [];
    console.error = (...args: any[]) => errorLogs.push(args);

    // Simulate unknown event type
    await hooks.event({
      event: {
        type: "unknown.event.type",
        properties: { sessionID: "test-session-999" },
      },
    });

    // Restore console.error
    console.error = originalError;

    // Wait for async dispatch
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Verify NO dispatch occurred
    expect(mockPushoverSend).toHaveBeenCalledTimes(0);
    expect(mockTelegramSend).toHaveBeenCalledTimes(0);
    expect(mockSlackSend).toHaveBeenCalledTimes(0);
    expect(mockDiscordSend).toHaveBeenCalledTimes(0);

    // Verify no error logged
    expect(errorLogs.length).toBe(0);
  });

  test("all services disabled → plugin loads without error, zero dispatches", async () => {
    const disabledTempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "everynotify-disabled-"),
    );
    const disabledConfigDir = path.join(disabledTempDir, ".opencode");
    fs.mkdirSync(disabledConfigDir, { recursive: true });

    const disabledConfig = {
      pushover: { enabled: false, token: "", userKey: "", priority: 0 },
      telegram: { enabled: false, botToken: "", chatId: "" },
      slack: { enabled: false, webhookUrl: "" },
      discord: { enabled: false, webhookUrl: "" },
    };

    fs.writeFileSync(
      path.join(disabledConfigDir, ".everynotify.json"),
      JSON.stringify(disabledConfig),
    );

    const mockInput = createMockPluginInput();
    mockInput.directory = disabledTempDir;

    const hooks = await EverynotifyPlugin(mockInput);

    expect(hooks).toHaveProperty("event");
    expect(typeof hooks["permission.ask"]).toBe("function");
    expect(typeof hooks["tool.execute.before"]).toBe("function");

    await hooks.event({
      event: {
        type: "session.idle",
        properties: { sessionID: "test-session-000" },
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(mockPushoverSend).toHaveBeenCalledTimes(0);
    expect(mockTelegramSend).toHaveBeenCalledTimes(0);
    expect(mockSlackSend).toHaveBeenCalledTimes(0);
    expect(mockDiscordSend).toHaveBeenCalledTimes(0);

    fs.rmSync(disabledTempDir, { recursive: true, force: true });
  });

  test("SDK calls fail → graceful fallback to null, dispatch still succeeds", async () => {
    const mockInput = {
      client: {
        session: {
          get: mock(() => Promise.reject(new Error("SDK error"))),
          messages: mock(() => Promise.reject(new Error("SDK error"))),
        },
      },
      directory: tempDir,
    };

    const hooks = await EverynotifyPlugin(mockInput);

    await hooks.event({
      event: {
        type: "session.idle",
        properties: { sessionID: "test-session-sdk-fail" },
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(mockPushoverSend).toHaveBeenCalledTimes(1);

    const payload = mockPushoverSend.mock.calls[0][1] as NotificationPayload;
    expect(payload.eventType).toBe("complete");
    expect(payload.elapsedSeconds).toBeNull();
    expect(payload.sessionID).toBe("test-session-sdk-fail");
  });

  test("elapsed time calculation: first user message timestamp", async () => {
    const startTime = Date.now() - 120000; // 2 minutes ago
    const mockInput = createMockPluginInput({
      messages: [
        { role: "system", timestamp: startTime - 10000 }, // System message before user
        { role: "user", timestamp: startTime }, // First user message
        { role: "assistant", timestamp: startTime + 5000 },
        { role: "user", timestamp: startTime + 10000 }, // Second user message
      ],
    });

    const hooks = await EverynotifyPlugin(mockInput);

    // Trigger event hook
    await hooks.event({
      event: {
        type: "session.idle",
        properties: { sessionID: "test-session-elapsed" },
      },
    });

    // Wait for async dispatch
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Verify dispatch occurred
    expect(mockPushoverSend).toHaveBeenCalledTimes(1);

    // Verify elapsed time is calculated from first user message
    const payload = mockPushoverSend.mock.calls[0][1] as NotificationPayload;
    expect(payload.elapsedSeconds).toBeGreaterThanOrEqual(120); // At least 2 minutes
    expect(payload.elapsedSeconds).toBeLessThan(125); // Less than 2m 5s (allow some slack)
    expect(payload.message).toContain("2m"); // Message contains formatted time
  });

  test("project name extracted from directory basename", async () => {
    const projectTempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "my-awesome-project-"),
    );
    const projectConfigDir = path.join(projectTempDir, ".opencode");
    fs.mkdirSync(projectConfigDir, { recursive: true });

    fs.writeFileSync(
      path.join(projectConfigDir, ".everynotify.json"),
      JSON.stringify({
        pushover: {
          enabled: true,
          token: "test-token",
          userKey: "test-user",
          priority: 0,
        },
        telegram: { enabled: false, botToken: "", chatId: "" },
        slack: { enabled: false, webhookUrl: "" },
        discord: { enabled: false, webhookUrl: "" },
      }),
    );

    const mockInput = createMockPluginInput();
    mockInput.directory = projectTempDir;

    const hooks = await EverynotifyPlugin(mockInput);

    await hooks.event({
      event: {
        type: "session.idle",
        properties: { sessionID: "test-session-project-name" },
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(mockPushoverSend).toHaveBeenCalledTimes(1);

    const payload = mockPushoverSend.mock.calls[0][1] as NotificationPayload;
    expect(payload.projectName).toContain("my-awesome-project");
    expect(payload.title).toContain("my-awesome-project");

    fs.rmSync(projectTempDir, { recursive: true, force: true });
  });

  test("debouncing: same event type within 1000ms → second dispatch skipped", async () => {
    const mockInput = createMockPluginInput();

    const hooks = await EverynotifyPlugin(mockInput);

    // First dispatch
    await hooks.event({
      event: {
        type: "session.idle",
        properties: { sessionID: "test-session-debounce-1" },
      },
    });

    // Wait for first dispatch
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Verify first dispatch
    expect(mockPushoverSend).toHaveBeenCalledTimes(1);

    // Second dispatch within 1000ms (should be debounced)
    await hooks.event({
      event: {
        type: "session.idle",
        properties: { sessionID: "test-session-debounce-2" },
      },
    });

    // Wait for potential second dispatch
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Verify second dispatch was debounced (still only 1 call)
    expect(mockPushoverSend).toHaveBeenCalledTimes(1);

    // Wait for debounce window to expire
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Third dispatch after 1000ms (should go through)
    await hooks.event({
      event: {
        type: "session.idle",
        properties: { sessionID: "test-session-debounce-3" },
      },
    });

    // Wait for third dispatch
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Verify third dispatch went through
    expect(mockPushoverSend).toHaveBeenCalledTimes(2);
  });
});
