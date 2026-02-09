/**
 * Tests for dispatcher.ts
 * Verifies parallel dispatch, delay-and-replace queue, error isolation, and timeout behavior
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
    overrides: { delay?: number } = {},
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
    delay: overrides.delay ?? 0,
  });

  const createTestPayload = (
    eventType: NotificationPayload["eventType"] = "complete",
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

  // --- Delay-and-replace queue tests (replaced old debounce tests) ---

  test("delay: 0 sends all events immediately (feature disabled)", async () => {
    const config = createTestConfig({ pushover: true }, { delay: 0 });
    const dispatcher = createDispatcher(config, mockLogger);

    await dispatcher.dispatch(createTestPayload("complete"));
    expect(mockPushoverSend).toHaveBeenCalledTimes(1);

    await dispatcher.dispatch(createTestPayload("error"));
    expect(mockPushoverSend).toHaveBeenCalledTimes(2);
  });

  test("delayed event waits for delay before sending", async () => {
    const config = createTestConfig({ pushover: true }, { delay: 1 });
    const dispatcher = createDispatcher(config, mockLogger);

    await dispatcher.dispatch(createTestPayload("complete"));
    expect(mockPushoverSend).toHaveBeenCalledTimes(0);

    await new Promise((resolve) => setTimeout(resolve, 1200));
    expect(mockPushoverSend).toHaveBeenCalledTimes(1);
  }, 5000);

  test("timer replacement: second dispatch replaces first, only last payload sent", async () => {
    const config = createTestConfig({ pushover: true }, { delay: 1 });
    const dispatcher = createDispatcher(config, mockLogger);

    const payload1: NotificationPayload = {
      ...createTestPayload("complete"),
      message: "First message",
    };
    const payload2: NotificationPayload = {
      ...createTestPayload("complete"),
      message: "Second message",
    };

    await dispatcher.dispatch(payload1);
    await dispatcher.dispatch(payload2);

    await new Promise((resolve) => setTimeout(resolve, 1200));

    expect(mockPushoverSend).toHaveBeenCalledTimes(1);
    const sentPayload = mockPushoverSend.mock
      .calls[0][1] as NotificationPayload;
    expect(sentPayload.message).toBe("Second message");
  }, 5000);

  test("immediate bypass: error events send without delay", async () => {
    const config = createTestConfig({ pushover: true }, { delay: 10 });
    const dispatcher = createDispatcher(config, mockLogger);

    await dispatcher.dispatch(createTestPayload("error"));
    expect(mockPushoverSend).toHaveBeenCalledTimes(1);
  });

  test("immediate bypass: permission events send without delay", async () => {
    const config = createTestConfig({ pushover: true }, { delay: 10 });
    const dispatcher = createDispatcher(config, mockLogger);

    await dispatcher.dispatch(createTestPayload("permission"));
    expect(mockPushoverSend).toHaveBeenCalledTimes(1);
  });

  test("500ms dedup: duplicate immediate events within 500ms are suppressed", async () => {
    const config = createTestConfig({ pushover: true }, { delay: 10 });
    const dispatcher = createDispatcher(config, mockLogger);

    await dispatcher.dispatch(createTestPayload("permission"));
    expect(mockPushoverSend).toHaveBeenCalledTimes(1);

    await dispatcher.dispatch(createTestPayload("permission"));
    expect(mockPushoverSend).toHaveBeenCalledTimes(1);
  });

  test("mixed: delayed complete + immediate error, error sends now, complete still pending", async () => {
    const config = createTestConfig({ pushover: true }, { delay: 1 });
    const dispatcher = createDispatcher(config, mockLogger);

    await dispatcher.dispatch(createTestPayload("complete"));
    expect(mockPushoverSend).toHaveBeenCalledTimes(0);

    await dispatcher.dispatch(createTestPayload("error"));
    expect(mockPushoverSend).toHaveBeenCalledTimes(1);

    const sentPayload = mockPushoverSend.mock
      .calls[0][1] as NotificationPayload;
    expect(sentPayload.eventType).toBe("error");

    await new Promise((resolve) => setTimeout(resolve, 1200));
    expect(mockPushoverSend).toHaveBeenCalledTimes(2);
  }, 5000);

  test("independent timers per event type", async () => {
    const config = createTestConfig({ pushover: true }, { delay: 1 });
    const dispatcher = createDispatcher(config, mockLogger);

    const completePayload: NotificationPayload = {
      ...createTestPayload("complete"),
      message: "complete msg",
    };
    const questionPayload: NotificationPayload = {
      ...createTestPayload("complete"),
      eventType: "question",
      message: "question msg",
    };

    await dispatcher.dispatch(completePayload);
    await dispatcher.dispatch(questionPayload);
    expect(mockPushoverSend).toHaveBeenCalledTimes(0);

    await new Promise((resolve) => setTimeout(resolve, 1200));
    expect(mockPushoverSend).toHaveBeenCalledTimes(2);

    const messages = mockPushoverSend.mock.calls.map(
      (call: any) => (call[1] as NotificationPayload).message,
    );
    expect(messages).toContain("complete msg");
    expect(messages).toContain("question msg");
  }, 5000);

  test("flush() sends all pending events immediately", async () => {
    const config = createTestConfig({ pushover: true }, { delay: 60 });
    const dispatcher = createDispatcher(config, mockLogger);

    await dispatcher.dispatch(createTestPayload("complete"));
    await dispatcher.dispatch(createTestPayload("question"));
    expect(mockPushoverSend).toHaveBeenCalledTimes(0);

    await dispatcher.flush();
    expect(mockPushoverSend).toHaveBeenCalledTimes(2);
  }, 5000);

  test("flush() clears timers — no duplicate sends after flush", async () => {
    const config = createTestConfig({ pushover: true }, { delay: 1 });
    const dispatcher = createDispatcher(config, mockLogger);

    await dispatcher.dispatch(createTestPayload("complete"));
    await dispatcher.flush();
    expect(mockPushoverSend).toHaveBeenCalledTimes(1);

    await new Promise((resolve) => setTimeout(resolve, 1200));
    expect(mockPushoverSend).toHaveBeenCalledTimes(1);
  }, 5000);

  test("no services + delay: delayed event fires without crash", async () => {
    const config = createTestConfig({}, { delay: 1 });
    const dispatcher = createDispatcher(config, mockLogger);

    await dispatcher.dispatch(createTestPayload("complete"));
    await new Promise((resolve) => setTimeout(resolve, 1200));

    expect(mockPushoverSend).toHaveBeenCalledTimes(0);
    expect(mockLogger.error).toHaveBeenCalledTimes(0);
  }, 5000);

  test("invalid delay values: negative treated as 0 (immediate)", async () => {
    const config = createTestConfig({ pushover: true }, { delay: -5 });
    const dispatcher = createDispatcher(config, mockLogger);

    await dispatcher.dispatch(createTestPayload("complete"));
    expect(mockPushoverSend).toHaveBeenCalledTimes(1);
  });

  test("invalid delay: NaN falls through to timer path (expected Bun TimeoutNaNWarning)", async () => {
    const config = createTestConfig({ pushover: true }, { delay: NaN as any });
    const dispatcher = createDispatcher(config, mockLogger);

    await dispatcher.dispatch(createTestPayload("complete"));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(mockPushoverSend).toHaveBeenCalledTimes(1);
  });

  // --- Memory leak prevention tests ---

  test("timer fire cleans up: re-dispatch after timer completes queues fresh", async () => {
    const config = createTestConfig({ pushover: true }, { delay: 1 });
    const dispatcher = createDispatcher(config, mockLogger);

    await dispatcher.dispatch(createTestPayload("complete"));
    expect(mockPushoverSend).toHaveBeenCalledTimes(0);

    await new Promise((resolve) => setTimeout(resolve, 1200));
    expect(mockPushoverSend).toHaveBeenCalledTimes(1);

    await dispatcher.dispatch(createTestPayload("complete"));
    expect(mockPushoverSend).toHaveBeenCalledTimes(1);

    await new Promise((resolve) => setTimeout(resolve, 1200));
    expect(mockPushoverSend).toHaveBeenCalledTimes(2);
  }, 5000);

  test("replacement cleans up old timer: only latest fires", async () => {
    const config = createTestConfig({ pushover: true }, { delay: 1 });
    const dispatcher = createDispatcher(config, mockLogger);

    await dispatcher.dispatch({
      ...createTestPayload("complete"),
      message: "msg-A",
    });
    await dispatcher.dispatch({
      ...createTestPayload("complete"),
      message: "msg-B",
    });

    await new Promise((resolve) => setTimeout(resolve, 1200));
    expect(mockPushoverSend).toHaveBeenCalledTimes(1);
    expect(
      (mockPushoverSend.mock.calls[0][1] as NotificationPayload).message,
    ).toBe("msg-B");

    await new Promise((resolve) => setTimeout(resolve, 1200));
    expect(mockPushoverSend).toHaveBeenCalledTimes(1);
  }, 5000);

  test("10 rapid replacements: only final payload sends once", async () => {
    const config = createTestConfig({ pushover: true }, { delay: 1 });
    const dispatcher = createDispatcher(config, mockLogger);

    for (let i = 0; i < 10; i++) {
      await dispatcher.dispatch({
        ...createTestPayload("complete"),
        message: `msg-${i}`,
      });
    }

    await new Promise((resolve) => setTimeout(resolve, 1200));
    expect(mockPushoverSend).toHaveBeenCalledTimes(1);
    expect(
      (mockPushoverSend.mock.calls[0][1] as NotificationPayload).message,
    ).toBe("msg-9");
  }, 5000);

  test("flush() fully clears map: subsequent dispatch queues fresh", async () => {
    const config = createTestConfig({ pushover: true }, { delay: 60 });
    const dispatcher = createDispatcher(config, mockLogger);

    await dispatcher.dispatch(createTestPayload("complete"));
    await dispatcher.dispatch(createTestPayload("question"));
    await dispatcher.dispatch(createTestPayload("subagent_complete"));

    await dispatcher.flush();
    expect(mockPushoverSend).toHaveBeenCalledTimes(3);

    await dispatcher.dispatch(createTestPayload("complete"));
    await dispatcher.flush();
    expect(mockPushoverSend).toHaveBeenCalledTimes(4);
  }, 5000);

  test("large payload: 10KB message dispatches and completes without error", async () => {
    const config = createTestConfig({ pushover: true }, { delay: 1 });
    const dispatcher = createDispatcher(config, mockLogger);

    const largeMessage = "X".repeat(10 * 1024);
    await dispatcher.dispatch({
      ...createTestPayload("complete"),
      message: largeMessage,
    });

    await new Promise((resolve) => setTimeout(resolve, 1200));
    expect(mockPushoverSend).toHaveBeenCalledTimes(1);
    expect(
      (mockPushoverSend.mock.calls[0][1] as NotificationPayload).message,
    ).toBe(largeMessage);
    expect(mockLogger.error).toHaveBeenCalledTimes(0);
  }, 5000);

  test("delay:0 high-frequency: 100 dispatches send immediately, nothing queued", async () => {
    const config = createTestConfig({ pushover: true }, { delay: 0 });
    const dispatcher = createDispatcher(config, mockLogger);

    for (let i = 0; i < 100; i++) {
      await dispatcher.dispatch({
        ...createTestPayload("complete"),
        message: `msg-${i}`,
      });
    }

    expect(mockPushoverSend).toHaveBeenCalledTimes(100);

    await dispatcher.flush();
    expect(mockPushoverSend).toHaveBeenCalledTimes(100);
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
