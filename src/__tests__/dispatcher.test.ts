/**
 * Tests for dispatcher.ts
 * Verifies parallel dispatch, debouncing, error isolation, and timeout behavior
 */

import { describe, test, expect, mock, beforeEach } from "bun:test";
import { createDispatcher, truncate } from "../dispatcher";
import type { EverynotifyConfig, NotificationPayload } from "../types";

// Mock all service send functions
const mockPushoverSend = mock(() => Promise.resolve());
const mockTelegramSend = mock(() => Promise.resolve());
const mockSlackSend = mock(() => Promise.resolve());
const mockDiscordSend = mock(() => Promise.resolve());

// Mock service modules
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

describe("dispatcher", () => {
  let mockLogger: {
    error: ReturnType<typeof mock>;
    warn: ReturnType<typeof mock>;
  };

  beforeEach(() => {
    mockPushoverSend.mockClear();
    mockTelegramSend.mockClear();
    mockSlackSend.mockClear();
    mockDiscordSend.mockClear();
    mockLogger = {
      error: mock(() => {}),
      warn: mock(() => {}),
    };
  });

  const createTestConfig = (
    enabledServices: {
      pushover?: boolean;
      telegram?: boolean;
      slack?: boolean;
      discord?: boolean;
    } = {},
  ): EverynotifyConfig => ({
    pushover: {
      enabled: enabledServices.pushover ?? false,
      token: "test-token",
      userKey: "test-user",
      priority: 0,
    },
    telegram: {
      enabled: enabledServices.telegram ?? false,
      botToken: "test-bot-token",
      chatId: "test-chat-id",
    },
    slack: {
      enabled: enabledServices.slack ?? false,
      webhookUrl: "https://hooks.slack.com/test",
    },
    discord: {
      enabled: enabledServices.discord ?? false,
      webhookUrl: "https://discord.com/api/webhooks/test",
    },
    log: {
      enabled: false,
    },
  });

  const createTestPayload = (
    eventType: "complete" | "error" = "complete",
  ): NotificationPayload => ({
    eventType,
    title: "Test Title",
    message: "Test message",
    projectName: "test-project",
    timestamp: Date.now(),
    sessionID: "test-session",
    elapsedSeconds: 10,
  });

  test("dispatches to all enabled services in parallel", async () => {
    const config = createTestConfig({
      pushover: true,
      telegram: true,
      slack: true,
      discord: true,
    });
    const dispatcher = createDispatcher(config, mockLogger);
    const payload = createTestPayload();

    await dispatcher.dispatch(payload);

    expect(mockPushoverSend).toHaveBeenCalledTimes(1);
    expect(mockTelegramSend).toHaveBeenCalledTimes(1);
    expect(mockSlackSend).toHaveBeenCalledTimes(1);
    expect(mockDiscordSend).toHaveBeenCalledTimes(1);

    // Verify each service received correct config and payload
    expect(mockPushoverSend).toHaveBeenCalledWith(
      config.pushover,
      payload,
      expect.any(Object), // AbortSignal
    );
    expect(mockTelegramSend).toHaveBeenCalledWith(
      config.telegram,
      payload,
      expect.any(Object),
    );
    expect(mockSlackSend).toHaveBeenCalledWith(
      config.slack,
      payload,
      expect.any(Object),
    );
    expect(mockDiscordSend).toHaveBeenCalledWith(
      config.discord,
      payload,
      expect.any(Object),
    );
  });

  test("skips disabled services", async () => {
    const config = createTestConfig({
      pushover: true,
      telegram: false,
      slack: true,
      discord: false,
    });
    const dispatcher = createDispatcher(config, mockLogger);
    const payload = createTestPayload();

    await dispatcher.dispatch(payload);

    expect(mockPushoverSend).toHaveBeenCalledTimes(1);
    expect(mockTelegramSend).toHaveBeenCalledTimes(0);
    expect(mockSlackSend).toHaveBeenCalledTimes(1);
    expect(mockDiscordSend).toHaveBeenCalledTimes(0);
  });

  test("debounces same event type within 1000ms", async () => {
    const config = createTestConfig({ pushover: true });
    const dispatcher = createDispatcher(config, mockLogger);
    const payload = createTestPayload("complete");

    // First dispatch — should go through
    await dispatcher.dispatch(payload);
    expect(mockPushoverSend).toHaveBeenCalledTimes(1);

    // Second dispatch within 1000ms — should be debounced
    await dispatcher.dispatch(payload);
    expect(mockPushoverSend).toHaveBeenCalledTimes(1); // Still 1

    // Wait 1000ms and dispatch again — should go through
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await dispatcher.dispatch(payload);
    expect(mockPushoverSend).toHaveBeenCalledTimes(2);
  });

  test("allows different event types within 1000ms", async () => {
    const config = createTestConfig({ pushover: true });
    const dispatcher = createDispatcher(config, mockLogger);
    const payload1 = createTestPayload("complete");
    const payload2 = createTestPayload("error");

    // Dispatch "complete" event
    await dispatcher.dispatch(payload1);
    expect(mockPushoverSend).toHaveBeenCalledTimes(1);

    // Dispatch "error" event immediately — should NOT be debounced
    await dispatcher.dispatch(payload2);
    expect(mockPushoverSend).toHaveBeenCalledTimes(2);
  });

  test("one service failing does not block others (Promise.allSettled)", async () => {
    // Mock one service to fail
    mockTelegramSend.mockImplementationOnce(() =>
      Promise.reject(new Error("Telegram failed")),
    );

    const config = createTestConfig({
      pushover: true,
      telegram: true,
      slack: true,
      discord: true,
    });
    const dispatcher = createDispatcher(config, mockLogger);
    const payload = createTestPayload();

    // Mock console.error to verify error logging
    const originalError = console.error;
    const errorLogs: any[] = [];
    console.error = (...args: any[]) => errorLogs.push(args);

    await dispatcher.dispatch(payload);

    // Restore console.error
    console.error = originalError;

    // All services should have been called
    expect(mockPushoverSend).toHaveBeenCalledTimes(1);
    expect(mockTelegramSend).toHaveBeenCalledTimes(1);
    expect(mockSlackSend).toHaveBeenCalledTimes(1);
    expect(mockDiscordSend).toHaveBeenCalledTimes(1);

    // Error should have been logged
    expect(errorLogs.length).toBeGreaterThan(0);
    expect(errorLogs[0][0]).toContain("[EveryNotify] Telegram failed:");
  });

  test("service failure logs to mockLogger.error", async () => {
    // Mock one service to fail
    mockTelegramSend.mockImplementationOnce(() =>
      Promise.reject(new Error("Network error")),
    );

    const config = createTestConfig({
      pushover: false,
      telegram: true,
      slack: false,
      discord: false,
    });
    const dispatcher = createDispatcher(config, mockLogger);
    const payload = createTestPayload();

    await dispatcher.dispatch(payload);

    // Verify mockLogger.error was called
    expect(mockLogger.error).toHaveBeenCalledTimes(1);
    // Verify error message format
    const errorCall = mockLogger.error.mock.calls[0][0];
    expect(errorCall).toContain("Telegram failed");
    expect(errorCall).toContain("Network error");
  });

  test("service timeout (>5s) is aborted and error logged", async () => {
    // Mock service to take longer than 5s
    mockPushoverSend.mockImplementationOnce(
      (_config, _payload, signal: AbortSignal) =>
        new Promise((resolve, reject) => {
          signal.addEventListener("abort", () => {
            reject(new Error("AbortError"));
          });
          // Never resolve — will be aborted by timeout
        }),
    );

    const config = createTestConfig({ pushover: true });
    const dispatcher = createDispatcher(config, mockLogger);
    const payload = createTestPayload();

    // Mock console.error to verify error logging
    const originalError = console.error;
    const errorLogs: any[] = [];
    console.error = (...args: any[]) => errorLogs.push(args);

    await dispatcher.dispatch(payload);

    // Restore console.error
    console.error = originalError;

    // Service should have been called
    expect(mockPushoverSend).toHaveBeenCalledTimes(1);

    // Error should have been logged
    expect(errorLogs.length).toBeGreaterThan(0);
    expect(errorLogs[0][0]).toContain("[EveryNotify] Pushover failed:");
  }, 10000); // 10s timeout for this test

  test("all services disabled — no send calls, no errors", async () => {
    const config = createTestConfig(); // All disabled
    const dispatcher = createDispatcher(config, mockLogger);
    const payload = createTestPayload();

    await dispatcher.dispatch(payload);

    expect(mockPushoverSend).toHaveBeenCalledTimes(0);
    expect(mockTelegramSend).toHaveBeenCalledTimes(0);
    expect(mockSlackSend).toHaveBeenCalledTimes(0);
    expect(mockDiscordSend).toHaveBeenCalledTimes(0);
  });

  test("truncate function works correctly", () => {
    // Text shorter than limit — no truncation
    expect(truncate("Hello", 10)).toBe("Hello");

    // Text exactly at limit — no truncation
    expect(truncate("Hello", 5)).toBe("Hello");

    // Text over limit — truncated with suffix
    const longText = "A".repeat(100);
    const truncated = truncate(longText, 50);
    expect(truncated.length).toBe(50);
    expect(truncated.endsWith("… [truncated]")).toBe(true);

    // Verify truncation preserves correct prefix length
    const suffix = "… [truncated]";
    const expectedPrefix = "A".repeat(50 - suffix.length);
    expect(truncated).toBe(expectedPrefix + suffix);
  });

  test("truncate handles boundary cases", () => {
    // Empty string
    expect(truncate("", 10)).toBe("");

    // maxLength = 0
    expect(truncate("Hello", 0)).toBe("… [truncated]");

    // maxLength < suffix length
    expect(truncate("Hello", 5)).toBe("Hello");
    expect(truncate("Hello World", 5)).toBe("… [truncated]");

    // maxLength = suffix length (text longer than maxLength)
    const suffix = "… [truncated]";
    const longText = "A".repeat(100);
    expect(truncate(longText, suffix.length)).toBe(suffix);
  });
});
