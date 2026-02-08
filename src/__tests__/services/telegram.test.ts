/// <reference types="bun" />
import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { send } from "../../services/telegram";
import type { TelegramConfig, NotificationPayload } from "../../types";

describe("Telegram Service", () => {
  let fetchMock: ReturnType<typeof mock>;
  let abortSignal: AbortSignal;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    // Save original fetch
    originalFetch = globalThis.fetch;

    // Mock globalThis.fetch
    fetchMock = mock(() =>
      Promise.resolve(new Response("OK", { status: 200 })),
    );
    globalThis.fetch = fetchMock as any;

    // Create a valid AbortSignal
    const controller = new AbortController();
    abortSignal = controller.signal;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  const mockConfig: TelegramConfig = {
    enabled: true,
    botToken: "123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefgh",
    chatId: "-1001234567890",
  };

  const mockPayload: NotificationPayload = {
    eventType: "complete",
    title: "Test Title",
    message: "Test message content",
    projectName: "test-project",
    timestamp: Date.now(),
    sessionID: "session-123",
    elapsedSeconds: 42,
  };

  it("sends POST to correct Telegram API endpoint with bot token in path", async () => {
    await send(mockConfig, mockPayload, abortSignal);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe(
      `https://api.telegram.org/bot${mockConfig.botToken}/sendMessage`,
    );
  });

  it("uses application/json content type", async () => {
    await send(mockConfig, mockPayload, abortSignal);

    const [, options] = fetchMock.mock.calls[0];
    expect(options.headers["Content-Type"]).toBe("application/json");
  });

  it("includes chat_id, text, and parse_mode in JSON body", async () => {
    await send(mockConfig, mockPayload, abortSignal);

    const [, options] = fetchMock.mock.calls[0];
    const body = JSON.parse(options.body);

    expect(body.chat_id).toBe(mockConfig.chatId);
    expect(body.text).toContain("<b>Test Title</b>");
    expect(body.text).toContain("Test message content");
    expect(body.parse_mode).toBe("HTML");
  });

  it("formats message with HTML bold title", async () => {
    await send(mockConfig, mockPayload, abortSignal);

    const [, options] = fetchMock.mock.calls[0];
    const body = JSON.parse(options.body);

    expect(body.text).toBe("<b>Test Title</b>\nTest message content");
  });

  it("truncates message at 4096 characters", async () => {
    const longMessage = "x".repeat(5000);
    const payload: NotificationPayload = {
      ...mockPayload,
      message: longMessage,
    };

    await send(mockConfig, payload, abortSignal);

    const [, options] = fetchMock.mock.calls[0];
    const body = JSON.parse(options.body);

    expect(body.text.length).toBeLessThanOrEqual(4096);
    expect(body.text).toContain("… [truncated]");
  });

  it("passes AbortSignal to fetch for timeout control", async () => {
    await send(mockConfig, mockPayload, abortSignal);

    const [, options] = fetchMock.mock.calls[0];
    expect(options.signal).toBe(abortSignal);
  });

  it("logs error on non-2xx response without throwing", async () => {
    const errorResponse = new Response("Unauthorized", { status: 401 });
    fetchMock = mock(() => Promise.resolve(errorResponse));
    globalThis.fetch = fetchMock as any;

    const consoleErrorSpy = mock(() => {});
    const originalError = console.error;
    console.error = consoleErrorSpy as any;

    try {
      await send(mockConfig, mockPayload, abortSignal);

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      const [message] = consoleErrorSpy.mock.calls[0];
      expect(message).toContain("[EveryNotify] Telegram error:");
      expect(message).toContain("401");
    } finally {
      console.error = originalError;
    }
  });

  it("logs error on fetch exception without throwing", async () => {
    const fetchError = new Error("Network timeout");
    fetchMock = mock(() => Promise.reject(fetchError));
    globalThis.fetch = fetchMock as any;

    const consoleErrorSpy = mock(() => {});
    const originalError = console.error;
    console.error = consoleErrorSpy as any;

    try {
      await send(mockConfig, mockPayload, abortSignal);

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      const [message] = consoleErrorSpy.mock.calls[0];
      expect(message).toContain("[EveryNotify] Telegram failed:");
      expect(message).toContain("Network timeout");
    } finally {
      console.error = originalError;
    }
  });

  it("handles AbortSignal abort gracefully", async () => {
    const controller = new AbortController();
    const abortError = new Error("The operation was aborted");
    abortError.name = "AbortError";

    fetchMock = mock(() => Promise.reject(abortError));
    globalThis.fetch = fetchMock as any;

    const consoleErrorSpy = mock(() => {});
    const originalError = console.error;
    console.error = consoleErrorSpy as any;

    try {
      await send(mockConfig, mockPayload, controller.signal);

      // Should log the abort error
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      const [message] = consoleErrorSpy.mock.calls[0];
      expect(message).toContain("[EveryNotify] Telegram failed:");
    } finally {
      console.error = originalError;
    }
  });

  it("does not throw on successful response", async () => {
    fetchMock = mock(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({ ok: true, result: { message_id: 123 } }),
          {
            status: 200,
          },
        ),
      ),
    );
    globalThis.fetch = fetchMock as any;

    // Should not throw
    await expect(
      send(mockConfig, mockPayload, abortSignal),
    ).resolves.toBeUndefined();
  });

  it("handles very long titles with truncation", async () => {
    const longTitle = "T".repeat(3000);
    const payload: NotificationPayload = {
      ...mockPayload,
      title: longTitle,
    };

    await send(mockConfig, payload, abortSignal);

    const [, options] = fetchMock.mock.calls[0];
    const body = JSON.parse(options.body);

    expect(body.text.length).toBeLessThanOrEqual(4096);
    // Title should be truncated at 250 chars
    expect(body.text).toContain("… [truncated]");
  });

  it("uses correct chat_id format for group chats", async () => {
    const groupConfig: TelegramConfig = {
      enabled: true,
      botToken: "123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefgh",
      chatId: "-1001234567890",
    };

    await send(groupConfig, mockPayload, abortSignal);

    const [, options] = fetchMock.mock.calls[0];
    const body = JSON.parse(options.body);

    expect(body.chat_id).toBe("-1001234567890");
  });

  it("handles empty message gracefully", async () => {
    const payload: NotificationPayload = {
      ...mockPayload,
      message: "",
    };

    await send(mockConfig, payload, abortSignal);

    const [, options] = fetchMock.mock.calls[0];
    const body = JSON.parse(options.body);

    expect(body.text).toBe("<b>Test Title</b>\n");
  });
});
