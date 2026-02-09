/**
 * Tests for dispatcher.ts
 * Verifies parallel dispatch, debouncing, error isolation, and timeout behavior
 */

import { describe, test, expect, mock, beforeEach } from "bun:test";
import { createDispatcher, truncate } from "../dispatcher";
import type {
  EverynotifyConfig,
  NotificationPayload,
  ServiceSendFunction,
} from "../types";

// Mock all service send functions
const mockPushoverSend = mock<ServiceSendFunction>(() => Promise.resolve());
const mockTelegramSend = mock<ServiceSendFunction>(() => Promise.resolve());
const mockSlackSend = mock<ServiceSendFunction>(() => Promise.resolve());
const mockDiscordSend = mock<ServiceSendFunction>(() => Promise.resolve());

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
    events: {
      complete: true,
      subagent_complete: true,
      error: true,
      permission: true,
      question: true,
    },
    truncateFrom: "end",
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

    expect(mockPushoverSend).toHaveBeenCalledWith(
      { ...config.pushover, truncateFrom: "end" },
      payload,
      expect.any(Object),
    );
    expect(mockTelegramSend).toHaveBeenCalledWith(
      { ...config.telegram, truncateFrom: "end" },
      payload,
      expect.any(Object),
    );
    expect(mockSlackSend).toHaveBeenCalledWith(
      { ...config.slack, truncateFrom: "end" },
      payload,
      expect.any(Object),
    );
    expect(mockDiscordSend).toHaveBeenCalledWith(
      { ...config.discord, truncateFrom: "end" },
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

    await dispatcher.dispatch(payload);

    // All services should have been called
    expect(mockPushoverSend).toHaveBeenCalledTimes(1);
    expect(mockTelegramSend).toHaveBeenCalledTimes(1);
    expect(mockSlackSend).toHaveBeenCalledTimes(1);
    expect(mockDiscordSend).toHaveBeenCalledTimes(1);

    // Error should have been logged via logger
    expect(mockLogger.error).toHaveBeenCalledTimes(1);
    expect(mockLogger.error.mock.calls[0][0]).toContain("Telegram failed");
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

    await dispatcher.dispatch(payload);

    // Service should have been called
    expect(mockPushoverSend).toHaveBeenCalledTimes(1);

    // Error should have been logged via logger
    expect(mockLogger.error).toHaveBeenCalledTimes(1);
    expect(mockLogger.error.mock.calls[0][0]).toContain("Pushover failed");
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

  test("truncate from end (default) keeps beginning of text", () => {
    expect(truncate("Hello", 10)).toBe("Hello");
    expect(truncate("Hello", 5)).toBe("Hello");

    const longText = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const result = truncate(longText, 10);
    expect(result.length).toBe(10);
    expect(result).toBe("ABCDEFG...");
  });

  test("truncate from start keeps end of text", () => {
    expect(truncate("Hello", 10, "start")).toBe("Hello");
    expect(truncate("Hello", 5, "start")).toBe("Hello");

    const longText = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const result = truncate(longText, 10, "start");
    expect(result.length).toBe(10);
    expect(result).toBe("...TUVWXYZ");
  });

  test("truncate handles boundary cases", () => {
    expect(truncate("", 10)).toBe("");
    expect(truncate("Hello World", 0)).toBe("...");
    expect(truncate("Hello World", 3)).toBe("...");
    expect(truncate("Hello World", 4)).toBe("H...");
    expect(truncate("Hello World", 4, "start")).toBe("...d");
  });
});
